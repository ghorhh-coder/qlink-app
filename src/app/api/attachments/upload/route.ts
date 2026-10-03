import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { createAttachmentRecord, createAttachmentLogRecord } from "@/lib/attachmentDb";
import { supabaseFiles } from "@/lib/supabaseFiles";
import { supabaseVideos } from "@/lib/supabaseVideos";
import { supabasePostsAdmin } from "@/lib/supabasePosts";
import crypto from "crypto";
import { touchUserPresence } from "@/lib/presence";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { ensureAttachmentSchema } from "@/lib/ensureAttachmentSchema";

// Force this route to run in the Node.js runtime so Buffer and Supabase JS work correctly.
export const runtime = "nodejs";

// Reuse the same roomId logic as /api/chat/send
function buildRoomId(a: string, b: string) {
  return [a, b].sort().join(":");
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB for general files
const MAX_VIDEO_BYTES = 45 * 1024 * 1024; // 45MB for videos
const CHUNK_SIZE_BYTES = 2359296; // 2.25MB (exact multiple of 3 for bit-perfect Base64 encoding without padding)

const FILES_BUCKET = process.env.SUPABASE_FILES_BUCKET || "Autark-1";
const VIDEOS_BUCKET = process.env.SUPABASE_VIDEOS_BUCKET || "Autark-2";

let supabaseStorageOnline = true;
let lastSupabaseStorageCheck = 0;

function isSupabaseStorageAvailable(): boolean {
  const client = supabasePostsAdmin || supabaseVideos || supabaseFiles;
  if (!client) return false;
  const now = Date.now();
  if (!supabaseStorageOnline && now - lastSupabaseStorageCheck < 60_000) {
    return false; // Circuit open: fail fast to chunked resilient vault
  }
  return true;
}

function markSupabaseStorageDown(reason?: string) {
  supabaseStorageOnline = false;
  lastSupabaseStorageCheck = Date.now();
  console.warn("[attachments/upload] Supabase storage offline or restricted, routing to chunked resilient vault:", reason || "unknown");
}

/**
 * Safely attempt to generate a Supabase signed upload URL with 2s timeout and circuit breaker
 */
async function trySupabaseSignUpload(bucket: string, objectKey: string): Promise<{ signedUrl: string; token: string } | null> {
  const client = supabasePostsAdmin || supabaseVideos || supabaseFiles;
  if (!isSupabaseStorageAvailable() || !client || !bucket) return null;
  try {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase sign timeout")), 2000)
    );
    const signPromise = client.storage.from(bucket).createSignedUploadUrl(objectKey);

    const signResult: any = await Promise.race([signPromise, timeoutPromise]);
    if (signResult && !signResult.error && signResult.data?.signedUrl) {
      supabaseStorageOnline = true;
      return {
        signedUrl: signResult.data.signedUrl,
        token: signResult.data.token,
      };
    }
    markSupabaseStorageDown(signResult?.error?.message);
    return null;
  } catch (err: any) {
    markSupabaseStorageDown(err?.message);
    return null;
  }
}

/**
 * Helper to dispatch background push notifications to peer
 */
async function sendAttachmentPushNotification(
  senderHandle: string,
  recipientId: string,
  kind: string,
  originalName: string,
) {
  try {
    const pushSubscriptions = await (prisma as any).pushSubscription.findMany({
      where: { userId: recipientId },
    });

    if (pushSubscriptions && pushSubscriptions.length > 0) {
      const notificationBody =
        kind === "image"
          ? `📷 Sent an image: ${originalName}`
          : kind === "video"
            ? `🎥 Sent a video: ${originalName}`
            : `📁 Sent a file: ${originalName}`;

      const payload = {
        title: `New Message from @${senderHandle}`,
        body: notificationBody,
        url: `/?chat=${senderHandle}`,
      };

      const { sendPushNotification } = await import("@/lib/push");

      await Promise.allSettled(
        pushSubscriptions.map((sub: any) =>
          sendPushNotification(sub, payload).catch(async (err: any) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              try {
                await (prisma as any).pushSubscription.delete({ where: { id: sub.id } });
              } catch {
                // ignore prune error
              }
            }
          })
        )
      );
    }
  } catch (pushErr) {
    console.warn("[attachments/upload] Push notification dispatch note:", pushErr);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meId = (session.user as any).id as string;
    const senderHandle = (session.user as any).handle || "Someone";
    touchUserPresence(meId);
    await ensureAttachmentSchema();

    const contentType = request.headers.get("content-type") || "";

    // =========================================================================
    // PATHWAY A: JSON Request (Signed Direct Upload OR Chunked Resilient Vault)
    // =========================================================================
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));

      // -----------------------------------------------------------------------
      // 1. Request Direct-to-Cloud Signed Upload URL (Supabase storage bypass)
      // -----------------------------------------------------------------------
      if (body.requestSignedUrl) {
        const { toHandle, filename, mimeType, size, kind } = body;
        if (!toHandle || typeof toHandle !== "string") {
          return NextResponse.json({ error: "Missing toHandle" }, { status: 400 });
        }
        if (typeof size !== "number" || size <= 0) {
          return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
        }

        const isVideo = kind === "video" || mimeType?.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(filename || "");
        const maxLimit = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
        if (size > maxLimit) {
          return NextResponse.json(
            { error: `File too large (max ${isVideo ? "45MB" : "10MB"})` },
            { status: 400 }
          );
        }

        const peer = await prisma.user.findUnique({ where: { handle: toHandle } });
        if (!peer || peer.id === meId) {
          return NextResponse.json({ error: "Invalid peer" }, { status: 400 });
        }

        const bucket = isVideo ? VIDEOS_BUCKET : FILES_BUCKET;
        const originalName = filename || "attachment";
        const ext = originalName.includes(".") ? originalName.split(".").pop() : undefined;
        const objectKeyBase = crypto.randomUUID();
        const objectKey = ext ? `${objectKeyBase}.${ext}` : objectKeyBase;

        // Attempt Tier 1: Supabase Direct Signed Upload
        const supabaseSign = await trySupabaseSignUpload(bucket, objectKey);
        if (supabaseSign) {
          return NextResponse.json({
            mode: "supabase",
            signedUrl: supabaseSign.signedUrl,
            token: supabaseSign.token,
            bucket,
            objectKey,
            chunkSize: CHUNK_SIZE_BYTES,
          });
        }

        // Tier 2: Resilient Native Chunked Vault
        return NextResponse.json({
          mode: "chunked",
          fallbackChunked: true,
          chunkSize: CHUNK_SIZE_BYTES,
        });
      }

      // -----------------------------------------------------------------------
      // 2. Initialize Chunked Upload Session
      // -----------------------------------------------------------------------
      if (body.initChunked) {
        const { toHandle, filename, mimeType, size, kind } = body;
        if (!toHandle || typeof toHandle !== "string") {
          return NextResponse.json({ error: "Missing toHandle" }, { status: 400 });
        }
        if (typeof size !== "number" || size <= 0) {
          return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
        }

        const isVideo = kind === "video" || mimeType?.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(filename || "");
        const maxLimit = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
        if (size > maxLimit) {
          return NextResponse.json(
            { error: `File too large (max ${isVideo ? "45MB" : "10MB"})` },
            { status: 400 }
          );
        }

        const peer = await prisma.user.findUnique({ where: { handle: toHandle } });
        if (!peer || peer.id === meId) {
          return NextResponse.json({ error: "Invalid peer" }, { status: 400 });
        }

        const accepted = await prisma.friendRequest.findFirst({
          where: {
            status: "ACCEPTED",
            OR: [
              { fromUserId: meId, toUserId: peer.id },
              { fromUserId: peer.id, toUserId: meId },
            ],
          },
        });
        if (!accepted) {
          return NextResponse.json({ error: "No accepted connection" }, { status: 403 });
        }

        const roomId = buildRoomId(meId, peer.id);
        const uploadId = crypto.randomUUID();
        const effectiveKind = isVideo ? "video" : (kind === "image" || mimeType?.startsWith("image/")) ? "image" : "file";
        const fileMime = mimeType || (isVideo ? "video/mp4" : "application/octet-stream");
        const originalName = filename || "attachment";

        // Pre-create attachment record with status "uploading"
        await createAttachmentRecord({
          data: {
            id: uploadId,
            messageId: null,
            roomId,
            senderId: meId,
            postId: null,
            kind: effectiveKind,
            bucket: "database",
            objectKey: "pending",
            originalName,
            mimeType: fileMime,
            sizeBytes: BigInt(size),
            status: "uploading",
          },
        });

        return NextResponse.json({
          uploadId,
          chunkSize: CHUNK_SIZE_BYTES,
        });
      }

      // -----------------------------------------------------------------------
      // 3. Upload a Single Chunk (< 3.5MB, 100% within Vercel body limits)
      // -----------------------------------------------------------------------
      if (body.uploadChunk) {
        const { uploadId, chunkIndex, data } = body;
        if (!uploadId || typeof chunkIndex !== "number" || typeof data !== "string") {
          return NextResponse.json({ error: "Invalid chunk upload payload" }, { status: 400 });
        }

        await (prisma as any).$executeRawUnsafe(
          `INSERT INTO "_attachment_chunks" ("upload_id", "chunk_index", "data") VALUES ($1, $2, $3)
           ON CONFLICT ("upload_id", "chunk_index") DO UPDATE SET "data" = EXCLUDED."data"`,
          uploadId,
          chunkIndex,
          data
        );

        return NextResponse.json({ ok: true, chunkIndex });
      }

      // -----------------------------------------------------------------------
      // 4. Complete Chunked Upload (Assemble & Deliver)
      // -----------------------------------------------------------------------
      if (body.completeChunked) {
        const { uploadId, toHandle, kind, filename, mimeType, size } = body;
        if (!uploadId || !toHandle) {
          return NextResponse.json({ error: "Missing uploadId or toHandle" }, { status: 400 });
        }

        const peer = await prisma.user.findUnique({ where: { handle: toHandle } });
        if (!peer || peer.id === meId) {
          return NextResponse.json({ error: "Invalid peer" }, { status: 400 });
        }

        const roomId = buildRoomId(meId, peer.id);
        const originalName = filename || "attachment";
        const isVideo = kind === "video" || mimeType?.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(originalName);
        const effectiveKind = isVideo ? "video" : (kind === "image" || mimeType?.startsWith("image/")) ? "image" : "file";
        const fileMime = mimeType || (isVideo ? "video/mp4" : "application/octet-stream");

        // Fetch chunks ordered by chunk_index
        const rows: { data: string }[] = await (prisma as any).$queryRawUnsafe(
          `SELECT "data" FROM "_attachment_chunks" WHERE "upload_id" = $1 ORDER BY "chunk_index" ASC`,
          uploadId
        );

        if (!rows || rows.length === 0) {
          return NextResponse.json({ error: "No chunks found for this upload session" }, { status: 400 });
        }

        const assembledBase64 = rows.map((r) => r.data).join("");
        const finalObjectKey = `data:${fileMime};base64,${assembledBase64}`;

        // Prune chunks asynchronously
        (prisma as any).$executeRawUnsafe(
          `DELETE FROM "_attachment_chunks" WHERE "upload_id" = $1`,
          uploadId
        ).catch(() => {});

        // 1) Create chat message
        const message = await prisma.message.create({
          data: {
            content:
              effectiveKind === "image"
                ? originalName
                : `[${effectiveKind.toUpperCase()} attachment] ${originalName}`,
            senderId: meId,
            roomId,
          },
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            roomId: true,
          },
        });

        // 2) Update attachment metadata to uploaded
        const effectiveSize = size || Math.round((assembledBase64.length * 3) / 4);
        let attachmentRecord: any = null;
        try {
          attachmentRecord = await (prisma as any).attachment.update({
            where: { id: uploadId },
            data: {
              messageId: message.id,
              bucket: "database",
              objectKey: finalObjectKey,
              sizeBytes: BigInt(effectiveSize),
              status: "uploaded",
            },
          });
        } catch {
          // If pre-created attachment not found, create clean
          attachmentRecord = await createAttachmentRecord({
            data: {
              id: uploadId,
              messageId: message.id,
              roomId,
              senderId: meId,
              kind: effectiveKind,
              bucket: "database",
              objectKey: finalObjectKey,
              originalName,
              mimeType: fileMime,
              sizeBytes: BigInt(effectiveSize),
              status: "uploaded",
            },
          });
        }

        // Log upload event
        await createAttachmentLogRecord({
          data: { attachmentId: uploadId, event: "upload-chunked-vault" },
        }).catch(() => {});

        // Background push notification
        sendAttachmentPushNotification(senderHandle, peer.id, effectiveKind, originalName);

        return NextResponse.json({
          message,
          attachment: {
            id: attachmentRecord?.id || uploadId,
            kind: effectiveKind,
            originalName,
            size: effectiveSize,
            mimeType: fileMime,
            bucket: "database",
            objectKey: `/api/media/stream?id=${attachmentRecord?.id || uploadId}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      // -----------------------------------------------------------------------
      // 5. Direct Supabase Upload Complete Callback
      // -----------------------------------------------------------------------
      if (body.uploadComplete) {
        const { toHandle, kind, filename, mimeType, size, bucket, objectKey } = body;
        if (!toHandle || !bucket || !objectKey) {
          return NextResponse.json({ error: "Missing upload complete parameters" }, { status: 400 });
        }

        const peer = await prisma.user.findUnique({ where: { handle: toHandle } });
        if (!peer || peer.id === meId) {
          return NextResponse.json({ error: "Invalid peer" }, { status: 400 });
        }

        const roomId = buildRoomId(meId, peer.id);
        const originalName = filename || "attachment";
        const isVideo = kind === "video" || mimeType?.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(originalName);
        const effectiveKind = isVideo ? "video" : (kind === "image" || mimeType?.startsWith("image/")) ? "image" : "file";
        const fileMime = mimeType || (isVideo ? "video/mp4" : "application/octet-stream");

        const message = await prisma.message.create({
          data: {
            content:
              effectiveKind === "image"
                ? originalName
                : `[${effectiveKind.toUpperCase()} attachment] ${originalName}`,
            senderId: meId,
            roomId,
          },
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            roomId: true,
          },
        });

        const attachmentRecord = await createAttachmentRecord({
          data: {
            messageId: message.id,
            roomId,
            senderId: meId,
            kind: effectiveKind,
            bucket,
            objectKey,
            originalName,
            mimeType: fileMime,
            sizeBytes: BigInt(size || 0),
            status: "uploaded",
          },
        });

        await createAttachmentLogRecord({
          data: { attachmentId: attachmentRecord.id, event: "upload-direct-supabase" },
        }).catch(() => {});

        sendAttachmentPushNotification(senderHandle, peer.id, effectiveKind, originalName);

        return NextResponse.json({
          message,
          attachment: {
            id: attachmentRecord.id,
            kind: effectiveKind,
            originalName,
            size,
            mimeType: fileMime,
            bucket,
            objectKey,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // =========================================================================
    // PATHWAY B: Multipart FormData Direct Upload (Fast Path <= 3.5MB)
    // =========================================================================
    const formData = await request.formData();

    const toHandle = formData.get("toHandle");
    const kind = formData.get("kind"); // "file" | "image" | "video"
    const file = formData.get("file");

    if (!toHandle || typeof toHandle !== "string") {
      return NextResponse.json({ error: "Missing toHandle" }, { status: 400 });
    }

    if (!kind || typeof kind !== "string") {
      return NextResponse.json({ error: "Missing kind" }, { status: 400 });
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!["file", "image", "video"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind; must be 'file', 'image', or 'video'" }, { status: 400 });
    }

    const size = file.size;
    if (kind === "video") {
      if (size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: "Video too large (max 45MB)" }, { status: 400 });
      }
    } else {
      if (size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File/image too large (max 10MB)" }, { status: 400 });
      }
    }

    const peer = await prisma.user.findUnique({ where: { handle: toHandle } });
    if (!peer) {
      return NextResponse.json({ error: "Peer not found" }, { status: 404 });
    }

    if (peer.id === meId) {
      return NextResponse.json({ error: "Cannot chat with yourself" }, { status: 400 });
    }

    const accepted = await prisma.friendRequest.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { fromUserId: meId, toUserId: peer.id },
          { fromUserId: peer.id, toUserId: meId },
        ],
      },
    });

    if (!accepted) {
      return NextResponse.json({ error: "No accepted connection between these users" }, { status: 403 });
    }

    const roomId = buildRoomId(meId, peer.id);

    const originalName = file.name || "attachment";
    const fileMime = file.type || "application/octet-stream";
    const isImageFile = fileMime.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(originalName);
    const isVideoFile = fileMime.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(originalName);
    const effectiveKind = isImageFile ? "image" : isVideoFile ? "video" : (kind === "video" ? "video" : kind === "image" ? "image" : "file");

    const isVideo = effectiveKind === "video";
    const supabase = isVideo ? (supabaseVideos || supabasePostsAdmin) : (supabaseFiles || supabasePostsAdmin);
    const bucket = isVideo ? VIDEOS_BUCKET : FILES_BUCKET;

    const ext = originalName.includes(".") ? originalName.split(".").pop() : undefined;
    const objectKeyBase = crypto.randomUUID();
    const objectKey = ext ? `${objectKeyBase}.${ext}` : objectKeyBase;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let finalBucket = bucket;
    let finalObjectKey = objectKey;
    let supabaseSuccess = false;

    if (supabase && isSupabaseStorageAvailable()) {
      try {
        const uploadResult = await supabase.storage
          .from(bucket)
          .upload(objectKey, buffer, {
            cacheControl: "3600",
            upsert: false,
            contentType: fileMime,
          });
        if (!uploadResult.error) {
          supabaseSuccess = true;
        } else {
          markSupabaseStorageDown(uploadResult.error.message);
        }
      } catch (uploadErr: any) {
        markSupabaseStorageDown(uploadErr?.message);
      }
    }

    // High-performance, zero-latency vault fallback
    if (!supabaseSuccess) {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "attachments");
      try {
        await mkdir(uploadsDir, { recursive: true });
        await writeFile(path.join(uploadsDir, objectKey), buffer);
        finalBucket = "local";
        finalObjectKey = `/uploads/attachments/${objectKey}`;
      } catch {
        finalBucket = "database";
        finalObjectKey = `data:${fileMime};base64,${buffer.toString("base64")}`;
      }
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const message = await prisma.message.create({
      data: {
        content:
          effectiveKind === "image"
            ? originalName
            : `[${effectiveKind.toUpperCase()} attachment] ${originalName}`,
        senderId: meId,
        roomId,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        senderId: true,
        roomId: true,
      },
    });

    let attachmentRecord: any = null;
    try {
      attachmentRecord = await (prisma as any).attachment.create({
        data: {
          messageId: message.id,
          roomId,
          senderId: meId,
          kind: effectiveKind,
          bucket: finalBucket,
          objectKey: finalObjectKey,
          originalName,
          mimeType: fileMime,
          sizeBytes: BigInt(size || buffer.length),
          status: "uploaded",
        },
      });
    } catch {
      attachmentRecord = await createAttachmentRecord({
        data: {
          messageId: message.id,
          roomId,
          senderId: meId,
          kind: effectiveKind,
          bucket: finalBucket,
          objectKey: finalObjectKey,
          originalName,
          mimeType: fileMime,
          sizeBytes: BigInt(size || buffer.length),
          status: "uploaded",
        },
      });
    }

    if (attachmentRecord?.id) {
      createAttachmentLogRecord({
        data: {
          attachmentId: attachmentRecord.id,
          event: "upload",
        },
      }).catch(() => {});
    }

    sendAttachmentPushNotification(senderHandle, peer.id, effectiveKind, originalName);

    return NextResponse.json({
      message,
      attachment: {
        id: attachmentRecord?.id,
        kind: effectiveKind,
        originalName,
        size,
        mimeType: fileMime,
        bucket: finalBucket,
        objectKey: finalObjectKey,
        expiresAt,
      },
    });
  } catch (err) {
    console.error("[attachments/upload] Unhandled error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

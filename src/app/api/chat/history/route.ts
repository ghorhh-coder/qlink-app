import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { cleanHandle } from "@/lib/handle-utils";
import { findSyntheticUser } from "@/lib/globalMockDirectory";

function buildRoomId(a: string, b: string) {
  return [a, b].sort().join(":");
}

// In-memory peer resolution cache (10 min TTL) - cuts 2 redundant DB queries out of every poll
interface CachedPeerResolution {
  peer: {
    id: string;
    handle: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
    publicKeyString: string | null;
  };
  roomId: string;
  cachedAt: number;
}
const peerResolutionCache = new Map<string, CachedPeerResolution>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const url = new URL(request.url);
    const peerHandle = url.searchParams.get("peerHandle");

    if (!peerHandle) {
      return NextResponse.json({ error: "Missing peerHandle" }, { status: 400 });
    }

    const meId = (session.user as any).id as string;
    const cleanedPeerHandle = cleanHandle(peerHandle);
    const cacheKey = `${meId}:${cleanedPeerHandle.toLowerCase()}`;

    const cached = peerResolutionCache.get(cacheKey);
    let peer: {
      id: string;
      handle: string | null;
      name: string | null;
      email: string | null;
      image: string | null;
      publicKeyString: string | null;
    };
    let roomId: string;

    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      peer = cached.peer;
      roomId = cached.roomId;
    } else {
      // Multi-tier peer resolution: exact handle -> ID -> fuzzy handle -> name
      let dbPeer = await prisma.user.findFirst({
        where: {
          OR: [
            { handle: { equals: cleanedPeerHandle, mode: "insensitive" } },
            { id: cleanedPeerHandle },
            { email: { equals: cleanedPeerHandle, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          handle: true,
          name: true,
          email: true,
          image: true,
          publicKeyString: true,
        },
      });

      if (!dbPeer) {
        const synthTarget = findSyntheticUser(cleanedPeerHandle) || findSyntheticUser(peerHandle);
        if (synthTarget) {
          dbPeer = await prisma.user.create({
            data: {
              id: synthTarget.id,
              handle: synthTarget.handle,
              name: synthTarget.name || synthTarget.handle,
              email: synthTarget.email,
              image: synthTarget.image || null,
              blue_tick_status: synthTarget.blue_tick_status || "NONE",
            },
            select: {
              id: true,
              handle: true,
              name: true,
              email: true,
              image: true,
              publicKeyString: true,
            },
          }).catch(async () => {
            return await prisma.user.findFirst({
              where: {
                OR: [
                  { handle: { equals: synthTarget.handle, mode: "insensitive" } },
                  { id: synthTarget.id },
                ],
              },
              select: {
                id: true,
                handle: true,
                name: true,
                email: true,
                image: true,
                publicKeyString: true,
              },
            });
          });
        }
      }

      if (!dbPeer) {
        return NextResponse.json({ error: `Peer "@${peerHandle}" not found.` }, { status: 404 });
      }

      if (dbPeer.id === meId) {
        return NextResponse.json({ error: "Cannot chat with yourself" }, { status: 400 });
      }


      peer = dbPeer;
      roomId = buildRoomId(meId, peer.id);

      // Auto-create/ensure accepted connection for seamless messaging
      const accepted = await prisma.friendRequest.findFirst({
        where: {
          OR: [
            { fromUserId: meId, toUserId: peer.id },
            { fromUserId: peer.id, toUserId: meId },
          ],
        },
      });

      if (!accepted) {
        await prisma.friendRequest.create({
          data: {
            fromUserId: meId,
            toUserId: peer.id,
            categories: "Friend",
            message: "Connected",
            status: "ACCEPTED",
          },
        }).catch(() => {});
      } else if (accepted.status !== "ACCEPTED") {
        await prisma.friendRequest.update({
          where: { id: accepted.id },
          data: { status: "ACCEPTED" },
        }).catch(() => {});
      }

      peerResolutionCache.set(cacheKey, {
        peer,
        roomId,
        cachedAt: Date.now(),
      });
    }

    const sinceParam = url.searchParams.get("since");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10))) : 100;

    let messages: any[];
    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      messages = await prisma.message.findMany({
        where: {
          OR: [
            { roomId, createdAt: { gt: sinceDate } },
            { roomId: `dm:${roomId}`, createdAt: { gt: sinceDate } },
            { roomId, editedAt: { gt: sinceDate } },
            { roomId: `dm:${roomId}`, editedAt: { gt: sinceDate } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: {
          id: true,
          content: true,
          createdAt: true,
          senderId: true,
          roomId: true,
          status: true,
          deliveredAt: true,
          readAt: true,
          isEdited: true,
          editedAt: true,
          reactions: true,
        },
      });
    } else {
      // High-Scale Optimization: Fetch most recent messages up to limit in reverse, then re-sort chronologically
      const rawMessages = await prisma.message.findMany({
        where: {
          OR: [
            { roomId },
            { roomId: `dm:${roomId}` },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          content: true,
          createdAt: true,
          senderId: true,
          roomId: true,
          status: true,
          deliveredAt: true,
          readAt: true,
          isEdited: true,
          editedAt: true,
          reactions: true,
        },
      });
      messages = rawMessages.reverse();
    }

    // Auto-mark ALL unread messages sent by peer as READ (await to ensure DB commit before response)
    const now = new Date();
    await prisma.message.updateMany({
      where: {
        senderId: peer.id,
        OR: [
          { roomId: roomId },
          { roomId: `dm:${roomId}` },
          { roomId: `dm:${peer.id}:${meId}` },
          { roomId: `dm:${meId}:${peer.id}` },
        ],
        status: { in: ["SENT", "DELIVERED"] },
      },
      data: { status: "READ", readAt: now, deliveredAt: now },
    }).catch((err) => console.warn("[chat/history] Failed to mark read:", err));

    for (const m of messages) {
      if (m.senderId === peer.id && m.status !== "READ") {
        m.status = "READ";
        (m as any).readAt = now.toISOString();
      }
    }

    // Query attachments for these messages so images and videos render inline seamlessly
    const messageIds = messages.map((m: any) => m.id);
    let attachments: any[] = [];
    if (messageIds.length > 0) {
      try {
        attachments = await prisma.attachment.findMany({
          where: {
            messageId: { in: messageIds },
          },
          select: {
            id: true,
            messageId: true,
            kind: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            bucket: true,
            objectKey: true,
            createdAt: true,
          },
        });
      } catch (attErr) {
        console.warn("[chat/history] Failed to fetch attachments from primary prisma:", attErr);
      }
    }

    const attachmentsByMessageId = new Map<string, any[]>();
    for (const att of attachments) {
      const serialized = {
        id: att.id,
        kind: att.kind,
        originalName: att.originalName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes ? att.sizeBytes.toString() : "0",
        bucket: att.bucket,
        objectKey: att.objectKey,
        createdAt: att.createdAt,
      };
      if (att.messageId) {
        const list = attachmentsByMessageId.get(att.messageId) || [];
        // Strictly deduplicate attachments per message by objectKey or ID
        if (!list.some((existing) => existing.objectKey === serialized.objectKey || existing.id === serialized.id)) {
          list.push(serialized);
          attachmentsByMessageId.set(att.messageId, list);
        }
      }
    }

    // High-Efficiency ETag Generator (RFC 9110 Standard):
    // Cryptographically digest conversation state including reactions, edits, attachments, and delivery statuses
    const lastMsg = messages[messages.length - 1];
    const firstMsg = messages[0];
    const reactionsDigest = messages.map((m) => `${m.id}:${m.reactions || ""}`).join(";");
    const editsDigest = messages.map((m) => `${m.id}:${m.isEdited ? m.editedAt : ""}`).join(";");
    const etagSource = `${roomId}-${messages.length}-${firstMsg?.id || "0"}-${lastMsg?.id || "0"}-${lastMsg?.status || ""}-${lastMsg?.readAt || ""}-${attachments.length}-${reactionsDigest}-${editsDigest}`;
    const etag = `W/"${Buffer.from(etagSource).toString("base64")}"`;

    const clientIfNoneMatch = request.headers.get("if-none-match");
    if (clientIfNoneMatch && clientIfNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return NextResponse.json(
      {
        roomId,
        peer: {
          id: peer.id,
          handle: peer.handle,
          name: peer.name,
          email: peer.email,
          image: peer.image,
          publicKeyString: peer.publicKeyString,
        },
        messages: messages.map((m) => {
          let reactionsList: any[] = [];
          if (m.reactions) {
            try {
              reactionsList = JSON.parse(m.reactions);
              if (!Array.isArray(reactionsList)) reactionsList = [];
            } catch {
              reactionsList = [];
            }
          }
          return {
            ...m,
            reactions: reactionsList,
            attachments: attachmentsByMessageId.get(m.id) || [],
          };
        }),
      },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "private, no-cache",
        },
      }
    );
  } catch (err: any) {
    console.error("[chat/history]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

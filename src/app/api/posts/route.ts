import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { findManyAttachmentRecords, updateAttachmentRecord } from "@/lib/attachmentDb";
import { supabasePosts, supabasePostsAdmin } from "@/lib/supabasePosts";
import { createPostSchema, validateRequest } from "@/lib/validation";
import { touchUserPresence } from "@/lib/presence";
import { ensureAttachmentSchema } from "@/lib/ensureAttachmentSchema";
import { postRateLimiter } from '@/lib/rateLimiter';
import { inspectContentSafety, calculateFeedRankScore } from '@/lib/moderation';


export const runtime = "nodejs";

type Audience = "GLOBAL" | "FOLLOWERS" | "FRIENDS" | "ALL";

function isAudience(value: unknown): value is Audience {
  return (
    value === "GLOBAL" ||
    value === "FOLLOWERS" ||
    value === "FRIENDS" ||
    value === "ALL"
  );
}

async function getSignedMediaUrl(params: { bucket: string; objectKey: string; id?: string }) {
  if (!params?.bucket || !params?.objectKey) return null;

  // Native Database Vault items stream directly via resilient internal proxy
  if (params.bucket === "database" || params.objectKey.startsWith("data:")) {
    return `/api/media/stream?id=${params.id}`;
  }

  const client = supabasePostsAdmin || supabasePosts;
  if (!client) {
    return params.id ? `/api/media/stream?id=${params.id}` : null;
  }

  try {
    const pub = client.storage.from(params.bucket).getPublicUrl(params.objectKey);
    if (pub.data?.publicUrl) return pub.data.publicUrl;
  } catch {
    // fallback to proxy
  }

  try {
    const res = await client.storage
      .from(params.bucket)
      .createSignedUrl(params.objectKey, 60 * 60 * 24);

    if (res.data?.signedUrl) return res.data.signedUrl;
  } catch (err) {
    console.warn("[posts] Error in getSignedMediaUrl, falling back to stream proxy:", err);
  }
  return params.id ? `/api/media/stream?id=${params.id}` : null;
}

export async function GET(request: Request) {
  try {
    let session: any = null;
    try {
      session = await getServerSession(authOptions);
    } catch {
      // Public / guest / unauthenticated directory request
    }
    const meId = (session?.user as any)?.id as string | undefined;

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const feed = url.searchParams.get("feed") || "foryou"; // "foryou" | "latest" | "network" 

    const now = new Date();

    if (mode === "directory_global_latest") {
      const perAuthorRaw = url.searchParams.get("perAuthor");
      const perAuthor = perAuthorRaw ? Math.max(1, Math.min(20, Number(perAuthorRaw))) : 10;

      const posts = await (prisma as any).post.findMany({
        where: {
          audience: { in: ["GLOBAL", "ALL"] },
        },
        orderBy: { createdAt: "desc" },
        take: 600,
        include: {
          author: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              aura_percentage: true,
              blue_tick_status: true,
              points: true,
              bio: true,
            },
          },
          _count: {
            select: {
              reactions: true,
              comments: true,
              views: true,
            },
          },
        },
      });

      const pickedByAuthor = new Map<string, any[]>();
      for (const p of posts as any[]) {
        const arr = pickedByAuthor.get(p.authorId) || [];
        if (arr.length >= perAuthor) continue;
        arr.push(p);
        pickedByAuthor.set(p.authorId, arr);
      }

      const picked = Array.from(pickedByAuthor.values()).flat();

      const attachmentIds: string[] = picked
        .map((p: any) => p.attachmentId)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0);

      const attachments: any[] = attachmentIds.length
        ? await findManyAttachmentRecords(attachmentIds, {
            id: true,
            kind: true,
            bucket: true,
            objectKey: true,
            mimeType: true,
            sizeBytes: true,
          })
        : [];

      const attachmentById = new Map<string, any>(
        attachments.map((a) => [a.id as string, a]),
      );

      const postsWithMedia = await Promise.all(
        picked.map(async (p: any) => {
          if (!p.attachmentId) return p;

          const att = attachmentById.get(p.attachmentId as string);
          if (!att || !att.bucket || !att.objectKey) {
            return { ...p, media: null, attachmentId: null, attachmentKind: null };
          }

          const normalizedKind =
            typeof att.kind === "string" ? att.kind.toLowerCase() : (p.attachmentKind?.toLowerCase() || att.kind);

          const signedUrl = await getSignedMediaUrl({
            bucket: att.bucket as string,
            objectKey: att.objectKey as string,
            id: att.id as string,
          });

          if (!signedUrl && normalizedKind !== "video") {
            console.warn("[posts] Failed to create signed/public URL for attachment", {
              postId: p.id,
              attachmentId: p.attachmentId,
              bucket: att.bucket,
            });
          }

          return {
            ...p,
            media: signedUrl
              ? {
                  kind: normalizedKind,
                  url: signedUrl,
                  mimeType: att.mimeType,
                  sizeBytes:
                    typeof att.sizeBytes === "bigint"
                      ? Number(att.sizeBytes)
                      : att.sizeBytes,
                }
              : null,
          };
        }),
      );

      // Filter displayable posts (must have text or an attachment/media)
      const validDirectoryPosts = postsWithMedia.filter((p: any) => {
        const hasText = typeof p?.text === "string" && p.text.trim().length > 0;
        const hasMedia = Boolean(p?.media?.url || p?.attachmentId);
        return hasText || hasMedia;
      });

      let sortedDirectoryPosts = validDirectoryPosts;
      if (feed === "foryou") {
        sortedDirectoryPosts = [...validDirectoryPosts].sort((a: any, b: any) => {
          const scoreA = calculateFeedRankScore({
            authorAura: a.author?.aura_percentage || 50,
            reactionsCount: a._count?.reactions || 0,
            commentsCount: a._count?.comments || 0,
            viewsCount: a._count?.views || 0,
            createdAt: a.createdAt,
          });
          const scoreB = calculateFeedRankScore({
            authorAura: b.author?.aura_percentage || 50,
            reactionsCount: b._count?.reactions || 0,
            commentsCount: b._count?.comments || 0,
            viewsCount: b._count?.views || 0,
            createdAt: b.createdAt,
          });
          return scoreB - scoreA;
        });
      }

      // High-Efficiency RFC 9110 ETag Generation for Directory Global Latest:
      const firstPost = sortedDirectoryPosts[0];
      const lastPost = sortedDirectoryPosts[sortedDirectoryPosts.length - 1];
      const dirDigest = `dir-${sortedDirectoryPosts.length}-${firstPost?.id || "0"}-${lastPost?.id || "0"}-${firstPost?.createdAt || ""}-${feed}`;
      const dirEtag = `W/"${Buffer.from(dirDigest).toString("base64")}"`;

      const ifNoneMatch = request.headers.get("if-none-match");
      if (ifNoneMatch && ifNoneMatch === dirEtag) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: dirEtag,
            "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
          },
        });
      }

      return NextResponse.json(
        { posts: sortedDirectoryPosts, perAuthor, feedMode: feed },
        {
          headers: {
            ETag: dirEtag,
            "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
          },
        },
      );
    }

    const posts = await (prisma as any).post.findMany({
      where: {
        OR: [
          { audience: { in: ["GLOBAL", "ALL"] } },
          { expiresAt: { gt: now } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        author: {
          select: {
            id: true,
            handle: true,
            name: true,
            image: true,
            bio: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            comments: true,
            views: true,
          },
        },
      },
    });

    // Filter by visibility rules.
    // GLOBAL/ALL: visible to everyone
    // FOLLOWERS: visible if viewer follows author or viewer is author
    // FRIENDS: visible if accepted friend connection exists or viewer is author

    const authorIds: string[] = Array.from(
      new Set((posts as Array<{ authorId: string }>).map((p) => p.authorId)),
    );

    let followingSet = new Set<string>();
    if (meId) {
      try {
        const follows: Array<{ followingId: string }> = await (prisma as any).follow.findMany({
          where: {
            followerId: meId,
            followingId: { in: authorIds },
          },
          select: { followingId: true },
        });
        followingSet = new Set(follows.map((f) => f.followingId));
      } catch (err) {
        console.warn("[posts] follow table lookup failed; defaulting to no-follow visibility", err);
      }
    }

    let friendSet = new Set<string>();
    if (meId) {
      try {
        const accepted: Array<{ fromUserId: string; toUserId: string }> = await (prisma as any).friendRequest.findMany({
          where: {
            status: "ACCEPTED",
            OR: [
              { fromUserId: meId, toUserId: { in: authorIds } },
              { toUserId: meId, fromUserId: { in: authorIds } },
            ],
          },
          select: { fromUserId: true, toUserId: true },
        });

        for (const fr of accepted) {
          friendSet.add(fr.fromUserId === meId ? fr.toUserId : fr.fromUserId);
        }
      } catch (err) {
        console.warn("[posts] friendRequest table lookup failed; defaulting to no-friends visibility", err);
      }
    }

    const visible = (posts as Array<{ authorId: string; audience: string }>).filter((p) => {
      if (meId && p.authorId === meId) return true;
      if (p.audience === "GLOBAL" || p.audience === "ALL") return true;
      if (meId && p.audience === "FOLLOWERS") return followingSet.has(p.authorId);
      if (meId && p.audience === "FRIENDS") return friendSet.has(p.authorId);
      return false;
    });

    const attachmentIds: string[] = (visible as any[])
      .map((p: any) => p.attachmentId)
      .filter((id: any): id is string => typeof id === "string" && id.length > 0);

    const attachments: any[] = attachmentIds.length
      ? await findManyAttachmentRecords(attachmentIds, {
          id: true,
          kind: true,
          bucket: true,
          objectKey: true,
          mimeType: true,
          sizeBytes: true,
        })
      : [];

    const attachmentById = new Map<string, any>(
      attachments.map((a) => [a.id as string, a]),
    );

    const postsWithMedia = await Promise.all(
      (visible as any[]).map(async (p: any) => {
        if (!p.attachmentId) return p;
        const att = attachmentById.get(p.attachmentId as string);
        if (!att || !att.bucket || !att.objectKey) {
            prisma.post.update({ where: { id: p.id }, data: { attachmentId: null, attachmentKind: null } }).catch(() => {});
            return { ...p, media: null, attachmentId: null, attachmentKind: null };
          }

        const normalizedKind =
          typeof att.kind === "string" ? att.kind.toLowerCase() : att.kind;

        const signedUrl = await getSignedMediaUrl({
          bucket: att.bucket as string,
          objectKey: att.objectKey as string,
          id: att.id as string,
        });

        return {
          ...p,
          media: signedUrl
            ? {
                kind: normalizedKind,
                url: signedUrl,
                mimeType: att.mimeType,
                sizeBytes:
                  typeof att.sizeBytes === "bigint"
                    ? Number(att.sizeBytes)
                    : att.sizeBytes,
              }
            : null,
        };
      }),
    );

    // Filter displayable posts (must have text or an attachment/media)
    const validPostsWithMedia = postsWithMedia.filter((p: any) => {
      const hasText = typeof p?.text === "string" && p.text.trim().length > 0;
      const hasMedia = Boolean(p?.media?.url || p?.attachmentId);
      return hasText || hasMedia;
    });

    let finalPosts = validPostsWithMedia;

    if (feed === "network" && meId) {
      finalPosts = finalPosts.filter((p: any) => p.authorId === meId || followingSet.has(p.authorId) || friendSet.has(p.authorId));
    } else if (feed === "foryou") {
      finalPosts = [...finalPosts].sort((a: any, b: any) => {
        const scoreA = calculateFeedRankScore({
          authorAura: a.author?.aura_percentage || 50,
          reactionsCount: a._count?.reactions || 0,
          commentsCount: a._count?.comments || 0,
          viewsCount: a._count?.views || 0,
          createdAt: a.createdAt,
        });
        const scoreB = calculateFeedRankScore({
          authorAura: b.author?.aura_percentage || 50,
          reactionsCount: b._count?.reactions || 0,
          commentsCount: b._count?.comments || 0,
          viewsCount: b._count?.views || 0,
          createdAt: b.createdAt,
        });
        return scoreB - scoreA;
      });
    }

    // High-Efficiency RFC 9110 ETag Generation for Feed:
    const firstPost = finalPosts[0];
    const lastPost = finalPosts[finalPosts.length - 1];
    const reactionsSum = finalPosts.reduce((acc: number, p: any) => acc + (p._count?.reactions || 0) + (p._count?.comments || 0), 0);
    const feedDigest = `feed-${finalPosts.length}-${firstPost?.id || "0"}-${lastPost?.id || "0"}-${firstPost?.createdAt || ""}-${reactionsSum}-${feed}-${meId || "anon"}`;
    const feedEtag = `W/"${Buffer.from(feedDigest).toString("base64")}"`;

    const clientIfNoneMatch = request.headers.get("if-none-match");
    if (clientIfNoneMatch && clientIfNoneMatch === feedEtag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: feedEtag,
          "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
        },
      });
    }

    return NextResponse.json(
      { posts: finalPosts, feedMode: feed },
      {
        headers: {
          ETag: feedEtag,
          "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
        },
      },
    );
  } catch (err: any) {
    console.error("[posts] GET Unhandled error", err);
    // Handle database connection and table errors gracefully
    if (err?.code === 'P1001' || err?.message?.includes('Can\'t reach database server') || 
        err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      return NextResponse.json({ posts: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meId = (session.user as any).id as string;
    touchUserPresence(meId);
    await ensureAttachmentSchema();

    const userExists = await prisma.user.findUnique({
      where: { id: meId },
      select: { id: true },
    });
    if (!userExists) {
      return NextResponse.json({ error: "User profile not found. Please log in again." }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate request body using Zod schema
    const { text, audience, attachmentId, attachmentKind } = validateRequest(createPostSchema, body);

    // Rate Limiting Check (Meta/X Grade: Token-Bucket Sliding Window)
    const rateCheck = postRateLimiter.check(meId, 5, 60_000);
    if (!rateCheck.allowed) {
      const waitSec = Math.max(1, Math.ceil(rateCheck.resetMs / 1000));
      return NextResponse.json(
        { error: `Posting velocity limit reached. Please wait ${waitSec}s before posting again.` },
        { status: 429, headers: { "Retry-After": String(waitSec) } }
      );
    }

    // Safety & Anti-Spam Inspection
    if (text) {
      const safety = inspectContentSafety(text);
      if (!safety.isSafe) {
        return NextResponse.json(
          { error: safety.reason || "Content violated safety policy." },
          { status: 400 }
        );
      }
    }

    const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);

    const post = await (prisma as any).post.create({
      data: {
        author: { connect: { id: meId } },
        text: text || "",
        audience: audience || "GLOBAL",
        attachmentId: attachmentId || null,
        attachmentKind: attachmentKind || null,
        expiresAt,
      },
      include: {
        author: {
          select: {
            id: true,
            handle: true,
            name: true,
            image: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            comments: true,
            views: true,
          },
        },
      },
    });

    if (attachmentId) {
      // Link attachment metadata to this post in attachments DB and mark status uploaded.
      try {
        await updateAttachmentRecord(attachmentId, {
          postId: post.id,
          status: "uploaded",
        });
      } catch (err) {
        console.error("[posts] Failed to link attachment to post", err);
      }
    }

    return NextResponse.json({ post });
  } catch (err: any) {
    // Handle validation errors
    if (err.message && err.message.includes('Validation failed')) {
      const errorData = JSON.parse(err.message);
      return NextResponse.json(errorData, { status: 400 });
    }
    
    console.error("[posts] POST Unhandled error", err);
    // Handle database connection and table errors gracefully
    if (err?.code === 'P1001' || err?.message?.includes('Can\'t reach database server') || 
        err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      return NextResponse.json({ error: "Database unavailable. Please try again." }, { status: 503 });
    }
    return NextResponse.json({ error: err?.message || "Failed to create post. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const meId = (session.user as any).id as string;
    const url = new URL(request.url);
    const postId = url.searchParams.get("id");
    if (!postId) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    const post = await (prisma as any).post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.authorId !== meId) {
      return NextResponse.json({ error: "Forbidden: Cannot delete other users' posts" }, { status: 403 });
    }

    await (prisma as any).post.delete({
      where: { id: postId },
    });

    return NextResponse.json({ success: true, deletedId: postId });
  } catch (err: any) {
    console.error("[posts] DELETE error", err);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}

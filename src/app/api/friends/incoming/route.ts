import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const toUserId = (session.user as any).id as string;

    const requests = await prisma.friendRequest.findMany({
      where: { toUserId },
      orderBy: { updatedAt: "desc" },
      include: {
        fromUser: {
          select: {
            id: true,
            handle: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Deduplicate: keep only the latest request per sender
    const seenSenderIds = new Set<string>();
    const uniqueRequests = [];
    for (const r of requests) {
      if (!r.fromUserId) continue;
      if (!seenSenderIds.has(r.fromUserId)) {
        seenSenderIds.add(r.fromUserId);
        uniqueRequests.push(r);
      }
    }

    // Auto-mark SENT messages from friends to this user as DELIVERED
    const friendUserIds = uniqueRequests
      .filter((r) => r.status === "ACCEPTED" && r.fromUserId)
      .map((r) => r.fromUserId);

    if (friendUserIds.length > 0) {
      const roomIds: string[] = [];
      friendUserIds.forEach((fId) => {
        const u = [toUserId, fId].sort();
        roomIds.push(`${u[0]}:${u[1]}`, `dm:${u[0]}:${u[1]}`);
      });

      const now = new Date();
      prisma.message.updateMany({
        where: {
          roomId: { in: roomIds },
          senderId: { in: friendUserIds },
          status: "SENT",
        },
        data: {
          status: "DELIVERED",
          deliveredAt: now,
        },
      }).catch((err) => console.error("[friends/incoming] DELIVERED update error:", err));
    }

    const shaped = await Promise.all(
      uniqueRequests.map(async (r) => {
        let latestMessage = null;
        let lastInteractionAt = r.updatedAt ? r.updatedAt.toISOString() : r.createdAt.toISOString();
        let unreadCount = 0;

        if (r.status === "ACCEPTED" && r.fromUser) {
          const uids = [toUserId, r.fromUserId].sort();
          const plainRoomId = `${uids[0]}:${uids[1]}`;
          const dmRoomId = `dm:${plainRoomId}`;

          const [msg, count] = await Promise.all([
            prisma.message.findFirst({
              where: {
                OR: [
                  { roomId: plainRoomId },
                  { roomId: dmRoomId },
                ],
              },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                content: true,
                createdAt: true,
                senderId: true,
                status: true,
                isEdited: true,
                editedAt: true,
              },
            }),
            prisma.message.count({
              where: {
                roomId: { in: [plainRoomId, dmRoomId] },
                senderId: r.fromUserId,
                status: { in: ["SENT", "DELIVERED"] },
              },
            }),
          ]);

          unreadCount = count;

          if (msg) {
            latestMessage = {
              id: msg.id,
              content: msg.content,
              createdAt: msg.createdAt.toISOString(),
              senderId: msg.senderId,
              status: msg.status || "SENT",
              isEdited: msg.isEdited || false,
              editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
            };
            lastInteractionAt = msg.createdAt.toISOString();
          }
        }

        return {
          id: r.id,
          status: r.status,
          categories: r.categories.split(",").filter(Boolean),
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt ? r.updatedAt.toISOString() : r.createdAt.toISOString(),
          lastInteractionAt,
          fromUser: r.fromUser,
          latestMessage,
          unreadCount,
          isUnread: unreadCount > 0,
        };
      })
    );

    // Advanced Ranking Algorithm:
    // 1. PENDING requests first (actionable)
    // 2. Unread messages second (immediate attention)
    // 3. ACCEPTED friends ranked by most recent message / interaction timestamp (descending)
    // 4. REJECTED requests at bottom
    // 5. Stable tie-breaker: alphabetical by handle
    shaped.sort((a, b) => {
      const getStatusPriority = (status: string) => {
        if (status === "PENDING") return 1;
        if (status === "ACCEPTED") return 2;
        return 3;
      };

      const prioA = getStatusPriority(a.status);
      const prioB = getStatusPriority(b.status);
      if (prioA !== prioB) return prioA - prioB;

      // Unread priority boost
      if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1;

      const timeA = new Date(a.lastInteractionAt || a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.lastInteractionAt || b.updatedAt || b.createdAt).getTime();
      if (timeA !== timeB) return timeB - timeA;

      const handleA = a.fromUser?.handle || "";
      const handleB = b.fromUser?.handle || "";
      return handleA.localeCompare(handleB);
    });

        // High-Efficiency RFC 9110 ETag Generation for Incoming Requests:
    const firstReq = shaped[0];
    const lastReq = shaped[shaped.length - 1];
    const unreadDigest = shaped.map((r) => `${r.id}:${r.unreadCount || 0}`).join(",");
    const inDigest = `in-${shaped.length}-${firstReq?.id || "0"}-${lastReq?.id || "0"}-${firstReq?.lastInteractionAt || firstReq?.updatedAt || ""}-${toUserId}-${unreadDigest}`;
    const inEtag = `W/"${Buffer.from(inDigest).toString("base64")}"`;

    const clientIfNoneMatch = request.headers.get("if-none-match");
    if (clientIfNoneMatch && clientIfNoneMatch === inEtag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: inEtag,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return NextResponse.json(
      { requests: shaped },
      {
        headers: {
          ETag: inEtag,
          "Cache-Control": "private, no-cache",
        },
      }
    );
  } catch (err) {
    console.error("[friends/incoming]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

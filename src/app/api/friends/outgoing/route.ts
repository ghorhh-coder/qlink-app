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

    const fromUserId = (session.user as any).id as string;

    const requests = await prisma.friendRequest.findMany({
      where: { fromUserId },
      orderBy: { updatedAt: "desc" },
      include: {
        toUser: {
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

    // Deduplicate: keep only the latest request per recipient
    const seenRecipientIds = new Set<string>();
    const uniqueRequests = [];
    for (const r of requests) {
      if (!r.toUserId) continue;
      if (!seenRecipientIds.has(r.toUserId)) {
        seenRecipientIds.add(r.toUserId);
        uniqueRequests.push(r);
      }
    }

    // Auto-mark SENT messages from friends to this user as DELIVERED
    const friendUserIds = uniqueRequests
      .filter((r) => r.status === "ACCEPTED" && r.toUserId)
      .map((r) => r.toUserId);

    if (friendUserIds.length > 0) {
      const roomIds: string[] = [];
      friendUserIds.forEach((fId) => {
        const u = [fromUserId, fId].sort();
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
      }).catch((err) => console.error("[friends/outgoing] DELIVERED update error:", err));
    }

    const shaped = await Promise.all(
      uniqueRequests.map(async (r) => {
        let latestMessage = null;
        let lastInteractionAt = r.updatedAt ? r.updatedAt.toISOString() : r.createdAt.toISOString();
        let unreadCount = 0;

        if (r.status === "ACCEPTED" && r.toUser) {
          const uids = [fromUserId, r.toUserId].sort();
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
                senderId: r.toUserId,
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
          toUser: r.toUser,
          latestMessage,
          unreadCount,
          isUnread: unreadCount > 0,
        };
      })
    );

    const allRequests = [...shaped];

    // Advanced Ranking Algorithm:
    // 1. ACCEPTED friends ranked by unread status & most recent message / interaction timestamp (descending)
    // 2. PENDING outgoing requests
    // 3. REJECTED requests at bottom
    // 4. Stable tie-breaker: alphabetical by handle
    allRequests.sort((a, b) => {
      const getStatusPriority = (status: string) => {
        if (status === "ACCEPTED") return 1;
        if (status === "PENDING") return 2;
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

      const handleA = a.toUser?.handle || "";
      const handleB = b.toUser?.handle || "";
      return handleA.localeCompare(handleB);
    });

    // High-Efficiency RFC 9110 ETag Generation for Outgoing Requests:
    const firstReq = allRequests[0];
    const lastReq = allRequests[allRequests.length - 1];
    const unreadDigest = allRequests.map((r) => `${r.id}:${r.unreadCount || 0}`).join(",");
    const outDigest = `out-${allRequests.length}-${firstReq?.id || "0"}-${lastReq?.id || "0"}-${firstReq?.lastInteractionAt || firstReq?.updatedAt || ""}-${fromUserId}-${unreadDigest}`;
    const outEtag = `W/"${Buffer.from(outDigest).toString("base64")}"`;

    const clientIfNoneMatch = request.headers.get("if-none-match");
    if (clientIfNoneMatch && clientIfNoneMatch === outEtag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: outEtag,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    const res = NextResponse.json(
      { requests: allRequests },
      {
        headers: {
          ETag: outEtag,
          "Cache-Control": "private, no-cache",
        },
      }
    );
    res.cookies.delete("ql_synth_reqs");
    return res;
  } catch (err) {
    console.error("[friends/outgoing]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

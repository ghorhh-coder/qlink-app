import { NextResponse } from "next/server";
import { findAttachmentRecord } from "@/lib/attachmentDb";
import fs from "fs";
import path from "path";
import { supabasePostsAdmin, supabasePosts } from "@/lib/supabasePosts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const key = url.searchParams.get("key");
    const bucket = url.searchParams.get("bucket") || process.env.SUPABASE_POSTS_BUCKET || "Autark-3";

    let targetBucket = bucket;
    let targetKey = key;
    let mimeType = "video/mp4";
    let totalSize: number | null = null;

    if (id) {
      const att = await findAttachmentRecord(id, {
        bucket: true,
        objectKey: true,
        mimeType: true,
        sizeBytes: true,
      });

      if (!att || !att.bucket || !att.objectKey) {
        return new NextResponse("Attachment not found", { status: 404 });
      }

      // High-performance local vault handler (Zero-latency video & image streaming)
      if (att.bucket === "local" || att.objectKey.startsWith("/uploads/")) {
        const relativeFilePath = att.objectKey.replace(/^\//, "").replace(/\.\./g, "");
        const publicBaseDir = path.resolve(process.cwd(), "public");
        const localPath = path.resolve(publicBaseDir, relativeFilePath);

        // Security Barrier: Strictly enforce path confinement inside public directory
        if (!localPath.startsWith(publicBaseDir)) {
          return new NextResponse("Forbidden: Access path denied", { status: 403 });
        }

        if (fs.existsSync(localPath)) {
          const stats = fs.statSync(localPath);

          const mime = att.mimeType || (att.objectKey.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
          const rangeHeader = request.headers.get("range");
          if (rangeHeader) {
            const rangeParts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(rangeParts[0], 10);
            const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : stats.size - 1;
            const chunk = fs.readFileSync(localPath).subarray(start, end + 1);
            return new NextResponse(chunk, {
              status: 206,
              headers: {
                "Content-Range": `bytes ${start}-${end}/${stats.size}`,
                "Accept-Ranges": "bytes",
                "Content-Length": String(chunk.length),
                "Content-Type": mime,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Access-Control-Allow-Origin": "*",
              },
            });
          }
          const buffer = fs.readFileSync(localPath);
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(buffer.length),
              "Accept-Ranges": "bytes",
              "Cache-Control": "public, max-age=31536000, immutable",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }

      // Native Database Vault Handler (Zero-downtime base64 storage)
      if (att.bucket === "database" || att.objectKey.startsWith("data:")) {
        const parts = att.objectKey.split(",");
        const base64Str = parts.length > 1 ? parts[1] : parts[0];
        const buffer = Buffer.from(base64Str, "base64");
        const dataMimeMatch = att.objectKey.match(/^data:([^;]+);base64,/);
        const detectedMime = dataMimeMatch ? dataMimeMatch[1] : null;
        const mime = att.mimeType || detectedMime || (att.kind === "video" ? "video/mp4" : "image/jpeg");

        const rangeHeader = request.headers.get("range");
        if (rangeHeader) {
          const rangeParts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(rangeParts[0], 10);
          const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : buffer.length - 1;
          const chunk = buffer.subarray(start, end + 1);
          return new NextResponse(chunk, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(chunk.length),
              "Content-Type": mime,
              "Cache-Control": "public, max-age=31536000, immutable",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(buffer.length),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      targetBucket = att.bucket;
      targetKey = att.objectKey;
      mimeType = att.mimeType || "video/mp4";
      if (att.sizeBytes) {
        totalSize = typeof att.sizeBytes === "bigint" ? Number(att.sizeBytes) : Number(att.sizeBytes);
      }
    }

    if (!targetBucket || !targetKey) {
      return new NextResponse("Invalid stream parameters", { status: 400 });
    }

    const client = supabasePostsAdmin || supabasePosts;
    let streamUrl: string | null = null;

    if (client) {
      try {
        const pub = client.storage.from(targetBucket).getPublicUrl(targetKey);
        if (pub.data?.publicUrl) {
          streamUrl = pub.data.publicUrl;
        }
      } catch {
        // ignore
      }
    }

    if (!streamUrl) {
      streamUrl = `https://${process.env.SUPABASE_POSTS_URL ? new URL(process.env.SUPABASE_POSTS_URL).hostname : "ansfsehkrddmrwnjspek.supabase.co"}/storage/v1/object/public/${targetBucket}/${targetKey}`;
    }

    // Tech-Giant Zero-Egress Architecture (Netflix / X / Meta standard):
    // Issue HTTP 307 (Temporary Redirect) directly to the Supabase Edge CDN with Range-compatible caching headers.
    // HTML5 <video>, ExoPlayer, AVPlayer, and modern browsers seamlessly follow 307 redirects
    // directly to the CDN with Range headers intact, enabling smooth seeking and zero buffering.
    // Result: 0 GB Vercel Fast Origin Transfer, 0s Vercel Serverless CPU execution.
    const forceProxy = url.searchParams.get("proxy") === "true";
    if (!forceProxy) {
      const redirectResponse = NextResponse.redirect(streamUrl, { status: 307 });
      redirectResponse.headers.set(
        "Cache-Control",
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
      );
      redirectResponse.headers.set("Access-Control-Allow-Origin", "*");
      return redirectResponse;
    }

    // Fallback: only executed if caller explicitly passed ?proxy=true
    const rangeHeader = request.headers.get("range");
    const fetchHeaders: Record<string, string> = {};
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    let upstreamRes: Response | null = null;
    try {
      upstreamRes = await fetch(streamUrl, {
        headers: fetchHeaders,
        cache: "no-store",
      });
    } catch (fetchErr: any) {
      console.warn("[media/stream] External upstream fetch unreachable:", fetchErr?.message || fetchErr);
      return new NextResponse("Media storage temporarily unreachable", { status: 503 });
    }

    if (!upstreamRes || (!upstreamRes.ok && upstreamRes.status !== 206)) {
      console.error("[media/stream] Upstream fetch failed:", upstreamRes?.status, upstreamRes?.statusText);
      return new NextResponse("Video stream unavailable", { status: upstreamRes?.status || 502 });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstreamRes.headers.get("content-type") || mimeType);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Content-Disposition", "inline");
    responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    } else if (totalSize) {
      responseHeaders.set("Content-Length", String(totalSize));
    }

    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[media/stream] Unhandled stream proxy error:", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

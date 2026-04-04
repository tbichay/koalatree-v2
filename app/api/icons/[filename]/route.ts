import { list, get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

const ALLOWED_ICONS = new Set([
  "favicon-16.png",
  "favicon-32.png",
  "favicon.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "app-icon.png",
  "logo.png",
]);

/**
 * Public icon proxy — serves branding icons from Vercel Blob,
 * falling back to static files in /public/icons/.
 *
 * No auth required — browsers must fetch favicons unauthenticated.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const rawFilename = (await params).filename;
  const filename = rawFilename?.trim().replace(/\s.*$/, "");

  if (!filename || !ALLOWED_ICONS.has(filename)) {
    return new Response("Invalid icon filename", { status: 400 });
  }

  // 1. Try Vercel Blob (studio-generated icons)
  try {
    const blobPath = `studio/icons/${filename}`;
    const { blobs } = await list({ prefix: blobPath, limit: 5 });
    const exactBlob = blobs.find((b) => b.pathname === blobPath);

    if (exactBlob) {
      const result = await get(exactBlob.url, { access: "private" });

      if (result && result.statusCode === 200 && result.stream) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType || "image/png",
            "Content-Length": String(result.blob.size),
            "Cache-Control":
              "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      }
    }
  } catch {
    // Blob not available (e.g. no token in dev) — fall through to static
  }

  // 2. Fallback: read directly from /public/icons/ on disk
  try {
    const filePath = join(process.cwd(), "public", "icons", filename);
    const buffer = await readFile(filePath);

    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // File not found on disk either
  }

  return new Response("Icon not found", { status: 404 });
}

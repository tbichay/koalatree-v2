import { list, get } from "@vercel/blob";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public image proxy — serves Studio-generated images from Vercel Blob,
 * falling back to static files in /public/.
 *
 * Flow: Studio generates image → "Verwenden" activates it as canonical →
 * this proxy serves the canonical from Blob → instantly live on website.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // Sanitize filename
  if (!filename || !/^[\w-]+\.\w+$/.test(filename)) {
    console.error(`[ImageProxy] Invalid filename: "${filename}"`);
    return new Response("Invalid filename", { status: 400 });
  }

  // 1. Try Vercel Blob (studio-generated canonical images)
  // Uses the same get() pattern as the hero compositing route (proven to work on Vercel)
  try {
    const exactPath = `studio/${filename}`;
    const { blobs } = await list({ prefix: exactPath, limit: 20 });
    const exactBlob = blobs.find((b) => b.pathname === exactPath);

    if (exactBlob) {
      console.log(`[ImageProxy] Found blob: ${exactBlob.pathname} (${exactBlob.size} bytes)`);
      const result = await get(exactBlob.url, { access: "private" });

      if (result && result.statusCode === 200 && result.stream) {
        console.log(`[ImageProxy] Serving ${filename} from Blob`);
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType || "image/png",
            "Content-Length": String(result.blob.size),
            "Cache-Control": "public, max-age=30, s-maxage=30",
          },
        });
      } else {
        console.error(`[ImageProxy] get() failed for ${filename}: status=${result?.statusCode}`);
      }
    } else {
      console.log(`[ImageProxy] No blob found for ${exactPath} (${blobs.length} prefix matches)`);
    }
  } catch (err) {
    console.error(`[ImageProxy] Blob error for ${filename}:`, err);
  }

  // 2. Fallback: proxy the static /public/ file via internal fetch
  // On Vercel, /public/ files are served at the root URL (e.g. /koda-portrait.png).
  // The middleware matcher excludes .png files so this won't loop back here.
  try {
    const origin = request.nextUrl.origin;
    const staticUrl = `${origin}/${filename}`;
    console.log(`[ImageProxy] Fallback to static: ${staticUrl}`);
    const staticRes = await fetch(staticUrl);

    if (staticRes.ok && staticRes.body) {
      console.log(`[ImageProxy] Serving ${filename} from static /public/`);
      return new Response(staticRes.body, {
        headers: {
          "Content-Type": staticRes.headers.get("Content-Type") || "image/png",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    } else {
      console.error(`[ImageProxy] Static fallback returned ${staticRes.status} for ${filename}`);
    }
  } catch (err) {
    console.error(`[ImageProxy] Static fallback error for ${filename}:`, err);
  }

  return new Response("Image not found", { status: 404 });
}

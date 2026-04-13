/**
 * Test Clip API — Generate a single test clip for provider comparison
 *
 * POST: Generate one clip with Kling AND Runway from the same inputs
 *   Body: { imageUrl: string, prompt: string, provider?: "kling" | "runway" | "both" }
 *   Returns: { kling?: { videoUrl, cost }, runway?: { videoUrl, cost } }
 *
 * Use this to compare quality before deciding which provider to use.
 */

import { auth } from "@/lib/auth";

export const maxDuration = 800;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    imageUrl: string;    // Public image URL or blob URL
    prompt: string;
    provider?: "kling" | "runway" | "both";
    duration?: number;
  };

  if (!body.imageUrl || !body.prompt) {
    return Response.json({ error: "imageUrl und prompt erforderlich" }, { status: 400 });
  }

  const provider = body.provider || "both";
  const duration = body.duration || 5;
  const results: Record<string, { videoUrl?: string; cost: number; error?: string; durationMs: number }> = {};

  // Resolve blob URL if needed
  let imageUrl = body.imageUrl;
  if (imageUrl.includes(".blob.vercel-storage.com")) {
    // Need to make it accessible — use blob proxy
    const { get } = await import("@vercel/blob");
    const blob = await get(imageUrl, { access: "private" });
    if (blob?.stream) {
      // Upload to a temp location or use data URI
      const reader = blob.stream.getReader();
      const chunks: Uint8Array[] = [];
      let chunk;
      while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
      const buffer = Buffer.concat(chunks);

      if (provider === "runway" || provider === "both") {
        // Runway accepts data URIs
        const { bufferToDataUri } = await import("@/lib/runway");
        imageUrl = bufferToDataUri(buffer, "image/png");
      }

      if (provider === "kling" || provider === "both") {
        // Kling needs fal.ai upload
        const { uploadToFal } = await import("@/lib/fal");
        imageUrl = await uploadToFal(buffer, "test.png", "image/png");
      }
    }
  }

  // ── Kling ──
  if (provider === "kling" || provider === "both") {
    const start = Date.now();
    try {
      const { klingI2V } = await import("@/lib/fal");
      // Need buffer for klingI2V
      let imgBuffer: Buffer;
      if (imageUrl.startsWith("data:")) {
        imgBuffer = Buffer.from(imageUrl.split(",")[1], "base64");
      } else {
        const res = await fetch(imageUrl);
        imgBuffer = Buffer.from(await res.arrayBuffer());
      }

      const videoUrl = await klingI2V({
        imageBuffer: imgBuffer,
        prompt: body.prompt,
        durationSeconds: Math.min(10, duration),
        aspectRatio: "16:9",
        quality: "standard",
      });
      results.kling = {
        videoUrl,
        cost: 0.084 * duration,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      results.kling = {
        cost: 0,
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  }

  // ── Runway ──
  if (provider === "runway" || provider === "both") {
    const start = Date.now();
    try {
      const { runwayI2V } = await import("@/lib/runway");
      const videoUrl = await runwayI2V({
        imageUrl: imageUrl.startsWith("data:") ? imageUrl : imageUrl,
        prompt: body.prompt,
        duration: duration <= 5 ? 5 : 10,
        model: "gen4_turbo",
      });
      results.runway = {
        videoUrl,
        cost: 0.05 * duration,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      results.runway = {
        cost: 0,
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  }

  return Response.json({ results });
}

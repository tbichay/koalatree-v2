import { auth } from "@/lib/auth";
import { put, get, list } from "@vercel/blob";
import { extractLastFrame, uploadToFal } from "@/lib/fal";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

/**
 * Extract the last frame from a video clip and store it for frame-chaining.
 * Called when user switches clip versions so the correct frame is used
 * for the next clip's generation.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { geschichteId, sceneIndex, videoUrl } = await request.json() as {
      geschichteId: string;
      sceneIndex: number;
      videoUrl: string;
    };

    if (!process.env.FAL_KEY) {
      return Response.json({ error: "FAL_KEY not configured" }, { status: 500 });
    }

    // Download the video from our proxy
    const baseUrl = process.env.AUTH_URL || "https://www.koalatree.ai";
    const fullUrl = videoUrl.startsWith("http") ? videoUrl : `${baseUrl}${videoUrl}`;

    const videoRes = await fetch(fullUrl);
    if (!videoRes.ok) return Response.json({ error: "Video not found" }, { status: 404 });
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    // Upload to fal.ai and extract last frame
    const publicVideoUrl = await uploadToFal(videoBuffer, `scene-${sceneIndex}.mp4`, "video/mp4");
    const lastFrame = await extractLastFrame(publicVideoUrl);

    // Save as frame for next clip
    const paddedIdx = String(sceneIndex).padStart(3, "0");
    const blob = await put(
      `films/${geschichteId}/frame-${paddedIdx}.png`,
      lastFrame,
      { access: "private", contentType: "image/png", allowOverwrite: true },
    );

    console.log(`[Extract Frame] Saved frame-${paddedIdx}.png (${(lastFrame.byteLength / 1024).toFixed(0)}KB)`);

    return Response.json({ url: blob.url, size: lastFrame.byteLength });
  } catch (error) {
    console.error("[Extract Frame] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Fehler" }, { status: 500 });
  }
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateVideo, generateSceneVideo, downloadVideo } from "@/lib/hedra";
import { put, get, list } from "@vercel/blob";

export const maxDuration = 300;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

interface SceneInput {
  type: "dialog" | "landscape" | "transition";
  characterId?: string;
  sceneDescription: string;
  mood?: string;
  camera?: string;
  audioStartMs: number;
  audioEndMs: number;
  quality?: "standard" | "premium";
}

async function loadBuffer(url: string): Promise<Buffer> {
  const result = await get(url, { access: "private" });
  if (!result?.stream) throw new Error("Could not load asset");
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function loadPortrait(characterId: string): Promise<Buffer> {
  const filename = `${characterId}-portrait.png`;
  const { blobs } = await list({ prefix: `images/${filename}`, limit: 1 });
  if (blobs.length > 0) return loadBuffer(blobs[0].url);

  const baseUrl = process.env.AUTH_URL || "https://www.koalatree.ai";
  const res = await fetch(`${baseUrl}/api/images/${filename}`);
  if (!res.ok) throw new Error(`Portrait not found: ${characterId}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { geschichteId, sceneIndex, scene, previousLastFrameUrl } = await request.json() as {
      geschichteId: string;
      sceneIndex: number;
      scene: SceneInput;
      previousLastFrameUrl?: string;
    };

    // Load story audio
    const geschichte = await prisma.geschichte.findUnique({
      where: { id: geschichteId },
      select: { audioUrl: true },
    });
    if (!geschichte?.audioUrl) throw new Error("Story has no audio");

    const fullAudio = await loadBuffer(geschichte.audioUrl);

    // Segment audio (MP3 128kbps = 16 bytes/ms)
    const bytesPerMs = 16;
    const startByte = Math.max(0, Math.floor(scene.audioStartMs * bytesPerMs));
    const endByte = Math.min(fullAudio.byteLength, Math.ceil(scene.audioEndMs * bytesPerMs));
    const audioSegment = Buffer.from(fullAudio.subarray(startByte, endByte));

    const segDuration = (scene.audioEndMs - scene.audioStartMs) / 1000;
    console.log(`[Scene Clip] Scene ${sceneIndex}: ${scene.type}, ${segDuration.toFixed(1)}s audio segment (${(audioSegment.byteLength / 1024).toFixed(0)}KB)`);

    let videoUrl: string;

    if (scene.type === "dialog" && scene.characterId) {
      const portrait = await loadPortrait(scene.characterId);

      if (scene.quality === "premium") {
        // Kling Avatar v2 — better movement but adds text (will crop later)
        videoUrl = await generateVideo({
          imageBuffer: portrait,
          audioBuffer: audioSegment,
          prompt: `${scene.sceneDescription}. Absolutely NO text, NO subtitles, NO captions on screen.`,
          aspectRatio: "9:16",
          resolution: "720p",
        });
      } else {
        // Hedra Character-3 — standard lip-sync
        videoUrl = await generateVideo({
          imageBuffer: portrait,
          audioBuffer: audioSegment,
          prompt: scene.sceneDescription,
          aspectRatio: "9:16",
          resolution: "720p",
        });
      }
    } else {
      // Landscape/Transition — Kling I2V
      const sceneImage = await loadPortrait(scene.characterId || "koda");
      videoUrl = await generateSceneVideo({
        imageBuffer: sceneImage,
        prompt: `${scene.sceneDescription}. ${scene.mood || ""}. Camera: ${scene.camera || "wide"}. KoalaTree animated style, warm colors.`,
        aspectRatio: "9:16",
        resolution: "720p",
      });
    }

    // Download and store
    const videoBuffer = await downloadVideo(videoUrl);
    const blob = await put(
      `films/${geschichteId}/scene-${String(sceneIndex).padStart(3, "0")}.mp4`,
      videoBuffer,
      { access: "private", contentType: "video/mp4", allowOverwrite: true }
    );

    console.log(`[Scene Clip] Done: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

    return Response.json({
      videoUrl: `/api/video/film-scene/${geschichteId}/${sceneIndex}`,
      blobUrl: blob.url,
      size: videoBuffer.byteLength,
    });
  } catch (error) {
    console.error("[Scene Clip] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Fehler" }, { status: 500 });
  }
}

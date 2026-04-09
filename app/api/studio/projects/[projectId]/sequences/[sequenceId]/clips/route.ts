/**
 * Studio Sequence Clips API — Generate video clips for sequence scenes
 *
 * POST: Generate a single scene clip (SSE streaming)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import { klingAvatar, klingI2V, seedanceI2V, extractLastFrame } from "@/lib/fal";
import { segmentMp3 } from "@/lib/audio-segment";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 300;

/** Resolve relative URLs to absolute for server-side fetch */
function resolveUrl(url: string): string {
  if (url.startsWith("http")) return url;
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.AUTH_URL || "https://koalatree.ai";
  return `${base}${url}`;
}

interface ClipRequest {
  sceneIndex: number;
  quality?: "standard" | "premium";
  force?: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as ClipRequest;

  // Load sequence with project and characters
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
    include: {
      project: {
        include: { characters: true },
      },
    },
  });

  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });
  if (!sequence.audioUrl) return Response.json({ error: "Zuerst Audio generieren" }, { status: 400 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const scene = scenes[body.sceneIndex];
  if (!scene) return Response.json({ error: `Szene ${body.sceneIndex} nicht gefunden` }, { status: 404 });

  // Skip if already done (unless forcing)
  if (!body.force && scene.videoUrl && scene.status === "done") {
    return Response.json({ videoUrl: scene.videoUrl, cached: true });
  }

  const quality = body.quality || scene.quality || "standard";

  // SSE streaming
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* */ }
      };

      send({ progress: "Starting..." });
      const keepAlive = setInterval(() => send({ progress: "generating..." }), 5000);

      try {
        // Load audio segment for this scene
        const hasAudio = scene.audioStartMs !== scene.audioEndMs && scene.audioEndMs > 0;
        let audioSegment: Buffer = Buffer.alloc(0);

        if (hasAudio) {
          send({ progress: "Lade Audio-Segment..." });
          // Private Blob URLs need the SDK, not fetch
          let fullAudio: Buffer;
          if (sequence.audioUrl!.includes(".blob.vercel-storage.com")) {
            const audioBlob = await get(sequence.audioUrl!, { access: "private" });
            if (!audioBlob?.stream) throw new Error("Audio nicht ladbar");
            const reader = audioBlob.stream.getReader();
            const chunks: Uint8Array[] = [];
            let chunk;
            while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
            fullAudio = Buffer.concat(chunks);
          } else {
            const audioRes = await fetch(sequence.audioUrl!);
            fullAudio = Buffer.from(new Uint8Array(await audioRes.arrayBuffer()));
          }

          const durSec = (scene.audioEndMs - scene.audioStartMs) / 1000;
          if (durSec > 30) throw new Error(`Audio zu lang: ${durSec.toFixed(0)}s (max 30s)`);

          audioSegment = segmentMp3(fullAudio, scene.audioStartMs, scene.audioEndMs);
        }

        // Find character portrait — try scene character, then lead, then any
        const character = scene.characterId
          ? sequence.project.characters.find((c) => c.id === scene.characterId)
          : null;

        // Resolve portrait: scene character → lead character → any character with portrait
        const portraitChar = character?.portraitUrl ? character
          : sequence.project.characters.find((c) => c.role === "lead" && c.portraitUrl)
          || sequence.project.characters.find((c) => c.portraitUrl);

        let portraitBuffer: Buffer | undefined;
        if (portraitChar?.portraitUrl) {
          send({ progress: `Lade Portrait (${portraitChar.name})...` });
          const portraitUrl = resolveUrl(portraitChar.portraitUrl);
          const portraitRes = await fetch(portraitUrl);
          if (portraitRes.ok) {
            portraitBuffer = Buffer.from(await portraitRes.arrayBuffer());
          } else {
            console.warn(`[Clip] Portrait fetch failed: ${portraitUrl} → ${portraitRes.status}`);
          }
        }

        // Load previous frame for continuity
        let prevFrame: Buffer | undefined;
        if (body.sceneIndex > 0) {
          const prevFramePath = `studio/${projectId}/sequences/${sequenceId}/frames/frame-${String(body.sceneIndex - 1).padStart(3, "0")}.png`;
          try {
            const existing = await get(prevFramePath, { access: "private" });
            if (existing?.stream) {
              const reader = existing.stream.getReader();
              const chunks: Uint8Array[] = [];
              let chunk;
              while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
              prevFrame = Buffer.concat(chunks);
            }
          } catch { /* no previous frame */ }
        }

        let videoUrl = "";
        const isDialog = (scene.type === "dialog") && scene.characterId && hasAudio;

        if (isDialog && portraitBuffer) {
          // ── DIALOG: Lip-sync video ──
          const prompt = buildScenePrompt(scene, character?.description, sequence.project.stylePrompt);

          if (quality === "premium" && process.env.GOOGLE_AI_API_KEY) {
            // Premium: Veo 3.1 + Kling LipSync
            send({ progress: "Premium: Veo 3.1..." });
            try {
              const { generateVeoVideo, downloadVeoVideo } = await import("@/lib/veo");
              const segDur = Math.min(8, Math.max(1, (scene.audioEndMs - scene.audioStartMs) / 1000));
              const veoUrl = await generateVeoVideo({
                prompt: `${prompt} Natural lip synchronization.`,
                referenceImage: portraitBuffer,
                durationSeconds: Math.ceil(segDur),
                aspectRatio: "9:16",
                resolution: "720p",
                quality: "fast",
                generateAudio: false,
              });
              const veoBuffer = await downloadVeoVideo(veoUrl);
              const { klingLipSync } = await import("@/lib/fal");
              videoUrl = await klingLipSync(veoBuffer, audioSegment);
            } catch (err) {
              console.warn("[Clip] Veo failed, fallback to Kling Avatar Pro:", err);
              send({ progress: "Veo fehlgeschlagen, nutze Kling Avatar Pro..." });
              videoUrl = await klingAvatar(portraitBuffer, audioSegment, prompt, "pro");
            }
          } else {
            // Standard: Kling Avatar
            send({ progress: "Dialog: Kling Avatar..." });
            videoUrl = await klingAvatar(portraitBuffer, audioSegment, prompt, "standard");
          }
        } else {
          // ── LANDSCAPE / TRANSITION ──
          // Load sequence landscape image as fallback
          let landscapeBuffer: Buffer | undefined;
          if (sequence.landscapeRefUrl) {
            try {
              const lsUrl = resolveUrl(sequence.landscapeRefUrl);
              // Private blob URLs need the blob SDK, public URLs can be fetched directly
              if (lsUrl.includes(".blob.vercel-storage.com")) {
                const lsBlob = await get(lsUrl, { access: "private" });
                if (lsBlob?.stream) {
                  const reader = lsBlob.stream.getReader();
                  const chunks: Uint8Array[] = [];
                  let chunk;
                  while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
                  landscapeBuffer = Buffer.concat(chunks);
                }
              } else {
                const lsRes = await fetch(lsUrl);
                if (lsRes.ok) landscapeBuffer = Buffer.from(await lsRes.arrayBuffer());
              }
            } catch { /* no landscape */ }
          }

          const imageSource = prevFrame || landscapeBuffer || portraitBuffer;
          if (!imageSource) {
            send({ done: true, error: `Szene ${body.sceneIndex}: Kein Bild verfuegbar. Bitte Portrait zuweisen.`, skipped: true });
            clearInterval(keepAlive);
            try { controller.close(); } catch { /* */ }
            return;
          }

          const prompt = buildScenePrompt(scene, character?.description, sequence.project.stylePrompt);
          const durSec = hasAudio
            ? Math.min(10, Math.max(3, (scene.audioEndMs - scene.audioStartMs) / 1000))
            : scene.durationHint || 5;

          if (quality === "premium") {
            send({ progress: "Premium: Kling 3.0 Pro..." });
            videoUrl = await klingI2V({
              imageBuffer: imageSource,
              prompt,
              durationSeconds: Math.ceil(durSec),
              quality: "pro",
              endImageBuffer: prevFrame && portraitBuffer ? portraitBuffer : undefined,
            });
          } else {
            send({ progress: "Landscape: Seedance..." });
            try {
              videoUrl = await seedanceI2V({
                imageBuffer: imageSource,
                prompt,
                durationSeconds: Math.ceil(durSec),
              });
            } catch {
              send({ progress: "Seedance fehlgeschlagen, nutze Kling..." });
              videoUrl = await klingI2V({
                imageBuffer: imageSource,
                prompt,
                durationSeconds: Math.ceil(durSec),
                quality: "standard",
              });
            }
          }
        }

        // Extract last frame for next scene continuity
        send({ progress: "Extrahiere letzten Frame..." });
        try {
          const lastFrame = await extractLastFrame(videoUrl);
          const framePath = `studio/${projectId}/sequences/${sequenceId}/frames/frame-${String(body.sceneIndex).padStart(3, "0")}.png`;
          await put(framePath, lastFrame, { access: "private", contentType: "image/png" });
        } catch (err) {
          console.warn("[Clip] Frame extraction failed:", err);
        }

        // Save clip to Blob
        send({ progress: "Speichere Clip..." });
        const videoRes = await fetch(videoUrl);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const clipPath = `studio/${projectId}/sequences/${sequenceId}/clips/clip-${String(body.sceneIndex).padStart(3, "0")}.mp4`;
        const clipBlob = await put(clipPath, videoBuffer, { access: "private", contentType: "video/mp4" });

        // Update scene in DB
        const updatedScenes = scenes.map((s, i) =>
          i === body.sceneIndex
            ? { ...s, videoUrl: clipBlob.url, status: "done" as const, quality }
            : s,
        );

        const doneCount = updatedScenes.filter((s) => s.status === "done").length;
        await prisma.studioSequence.update({
          where: { id: sequenceId },
          data: {
            scenes: JSON.parse(JSON.stringify(updatedScenes)),
            clipCount: doneCount,
            status: doneCount === updatedScenes.length ? "clips" : sequence.status,
          },
        });

        clearInterval(keepAlive);
        send({
          done: true,
          videoUrl: clipBlob.url,
          sceneIndex: body.sceneIndex,
          quality,
          clipCount: doneCount,
          totalScenes: updatedScenes.length,
        });
      } catch (err) {
        clearInterval(keepAlive);
        console.error("[Clip] Error:", err);
        send({ done: true, error: err instanceof Error ? err.message : "Fehler" });
      }
      try { controller.close(); } catch { /* */ }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

function buildScenePrompt(scene: StudioScene, charDescription?: string | null, stylePrompt?: string | null): string {
  const parts: string[] = [];
  // Visual style first — sets the overall look
  if (stylePrompt) {
    parts.push(`Style: ${stylePrompt}.`);
  } else {
    parts.push("Style: 2D Disney/Pixar animation, vibrant colors, hand-drawn feel, warm lighting.");
  }
  if (charDescription) parts.push(`Character: ${charDescription}.`);
  parts.push(scene.sceneDescription);
  if (scene.location) parts.push(`Setting: ${scene.location}.`);
  if (scene.mood) parts.push(`Mood: ${scene.mood}.`);
  if (scene.camera) parts.push(`Camera: ${scene.camera}.`);
  parts.push("NO text, NO subtitles, NO watermarks.");
  return parts.join(" ");
}

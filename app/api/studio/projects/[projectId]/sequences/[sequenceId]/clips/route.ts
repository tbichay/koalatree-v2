/**
 * Studio Sequence Clips API — Generate video clips for sequence scenes
 *
 * POST: Generate a single scene clip (SSE streaming)
 * PUT: Set active version or delete a version
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
  stylePrompt?: string;
  mode?: "film" | "hoerspiel" | "audiobook"; // film = lip-sync, hoerspiel/audiobook = no lip-sync
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

        // Load default visual style from DB (cached per request)
        const defaultStyle = await getDefaultVisualStyle();
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
        // Lip-sync only in film mode. Hoerspiel/audiobook use landscape-style video for all scenes.
        const screenplayData = sequence.project.screenplay as Record<string, unknown> | null;
        const clipMode = body.mode || (screenplayData?.mode as string) || "film";
        const isLipSync = (scene.type === "dialog") && scene.characterId && hasAudio && clipMode === "film";
        const isDialog = isLipSync; // Legacy alias

        if (isDialog && portraitBuffer) {
          // ── DIALOG with LIP-SYNC ──
          const prompt = buildScenePrompt(scene, character?.description, body.stylePrompt || sequence.project.stylePrompt, defaultStyle, sequence.atmosphereText);
          const segDur = Math.min(15, Math.max(1, (scene.audioEndMs - scene.audioStartMs) / 1000));

          if (quality === "premium") {
            // Premium dialog: Seedance 2.0 for non-English (best multilingual lip-sync)
            // Veo 3.1 Fast for English (best English lip-sync)
            const lang = sequence.project.language || "de";
            const useSeedance = lang !== "en"; // Seedance better for German, French, etc.
            send({ progress: useSeedance ? "Premium: Seedance 2.0 Lip-Sync..." : "Premium: Veo 3.1 Lip-Sync..." });
            if (useSeedance) {
              // Seedance 2.0: Best for German/multilingual lip-sync
              try {
                const { seedance2I2V } = await import("@/lib/fal");
                videoUrl = await seedance2I2V({
                  imageBuffer: portraitBuffer,
                  prompt: `${prompt} Character speaks with natural lip synchronization.`,
                  audioBuffer: audioSegment,
                  durationSeconds: Math.ceil(segDur),
                  aspectRatio: "9:16",
                });
              } catch (err) {
                console.warn("[Clip] Seedance 2.0 failed, fallback to Veo + LipSync:", err);
                send({ progress: "Fallback: Veo 3.1 + Kling LipSync..." });
                try {
                  const { generateVeoVideo, downloadVeoVideo } = await import("@/lib/veo");
                  const veoUrl = await generateVeoVideo({
                    prompt: `${prompt} Natural lip synchronization.`,
                    referenceImage: portraitBuffer,
                    durationSeconds: Math.ceil(segDur),
                    aspectRatio: "9:16",
                    quality: "fast",
                    generateAudio: false,
                  });
                  const veoBuffer = await downloadVeoVideo(veoUrl);
                  const { klingLipSync } = await import("@/lib/fal");
                  videoUrl = await klingLipSync(veoBuffer, audioSegment);
                } catch (err2) {
                  console.warn("[Clip] Veo failed, fallback to Kling Avatar:", err2);
                  send({ progress: "Fallback: Kling Avatar..." });
                  videoUrl = await klingAvatar(portraitBuffer, audioSegment, prompt, "pro");
                }
              }
            } else {
              // Veo 3.1 Fast: Best for English lip-sync
              try {
                const { generateVeoVideo, downloadVeoVideo } = await import("@/lib/veo");
                const veoUrl = await generateVeoVideo({
                  prompt: `${prompt} Character speaks with natural lip synchronization. Clear English dialogue.`,
                  referenceImage: portraitBuffer,
                  durationSeconds: Math.ceil(segDur),
                  aspectRatio: "9:16",
                  quality: "fast",
                  generateAudio: true,
                });
                videoUrl = veoUrl;
              } catch (err) {
                console.warn("[Clip] Veo Fast failed, fallback to Seedance 2.0:", err);
                send({ progress: "Fallback: Seedance 2.0..." });
                try {
                  const { seedance2I2V } = await import("@/lib/fal");
                  videoUrl = await seedance2I2V({
                    imageBuffer: portraitBuffer,
                    prompt: `${prompt} Character speaks with natural lip synchronization.`,
                    audioBuffer: audioSegment,
                    durationSeconds: Math.ceil(segDur),
                    aspectRatio: "9:16",
                  });
                } catch (err2) {
                  console.warn("[Clip] Seedance 2.0 failed, fallback to Kling Avatar:", err2);
                  send({ progress: "Fallback: Kling Avatar..." });
                  videoUrl = await klingAvatar(portraitBuffer, audioSegment, prompt, "pro");
                }
              }
            }
          } else {
            // Standard: Veo 3.1 Lite + Kling LipSync (cheapest lip-sync: ~$0.064/s)
            send({ progress: "Dialog: Veo 3.1 Lite + Kling LipSync..." });
            try {
              const { generateVeoVideo, downloadVeoVideo } = await import("@/lib/veo");
              const veoUrl = await generateVeoVideo({
                prompt: `${prompt} Natural lip synchronization.`,
                referenceImage: portraitBuffer,
                durationSeconds: Math.ceil(segDur),
                aspectRatio: "9:16",
                quality: "lite",
                generateAudio: false,
              });
              const veoBuffer = await downloadVeoVideo(veoUrl);
              const { klingLipSync } = await import("@/lib/fal");
              videoUrl = await klingLipSync(veoBuffer, audioSegment);
            } catch (err) {
              console.warn("[Clip] Veo Lite failed, fallback to Kling Avatar:", err);
              send({ progress: "Fallback: Kling Avatar..." });
              videoUrl = await klingAvatar(portraitBuffer, audioSegment, prompt, "standard");
            }
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

          const prompt = buildScenePrompt(scene, character?.description, body.stylePrompt || sequence.project.stylePrompt, defaultStyle, sequence.atmosphereText);
          // Audio timing is master — use actual audio duration for ALL scene types
          const audioDurSec = (scene.audioEndMs - scene.audioStartMs) / 1000;
          const durSec = audioDurSec > 0
            ? Math.min(10, Math.max(3, audioDurSec))
            : scene.durationHint || 5;

          if (quality === "premium") {
            // Premium landscape: Veo 3.1 Fast (best photorealism from text)
            // Fallback: Seedance 2.0 → Kling 3.0 Pro
            send({ progress: "Premium: Veo 3.1 Fast..." });
            try {
              const { generateVeoVideo, downloadVeoVideo } = await import("@/lib/veo");
              const veoUrl = await generateVeoVideo({
                prompt,
                referenceImage: imageSource,
                durationSeconds: Math.ceil(Math.min(8, durSec)),
                aspectRatio: "9:16",
                quality: "fast",
                generateAudio: false,
              });
              videoUrl = veoUrl;
            } catch (veoErr) {
              console.warn("[Clip] Veo Fast failed, trying Seedance 2.0:", veoErr);
              send({ progress: "Fallback: Seedance 2.0..." });
              try {
                const { seedance2I2V } = await import("@/lib/fal");
                videoUrl = await seedance2I2V({
                  imageBuffer: imageSource,
                  prompt,
                  durationSeconds: Math.ceil(durSec),
                  endImageBuffer: prevFrame && portraitBuffer ? portraitBuffer : undefined,
                });
              } catch {
                send({ progress: "Fallback: Kling 3.0 Pro..." });
                videoUrl = await klingI2V({
                  imageBuffer: imageSource,
                  prompt,
                  durationSeconds: Math.ceil(durSec),
                  quality: "pro",
                });
              }
            }
          } else {
            // Standard: Seedance 1.5 (cheapest landscape)
            send({ progress: "Landscape: Seedance 1.5..." });
            try {
              // Load next scene's portrait as end-frame anchor for smooth transition
              const nextScene = scenes[body.sceneIndex + 1];
              const nextChar = nextScene?.characterId
                ? sequence.project.characters.find((c) => c.id === nextScene.characterId)
                : null;
              let endFrameBuffer: Buffer | undefined;
              if (nextChar?.portraitUrl) {
                try {
                  const endUrl = resolveUrl(nextChar.portraitUrl);
                  const endRes = await fetch(endUrl);
                  if (endRes.ok) endFrameBuffer = Buffer.from(await endRes.arrayBuffer());
                } catch { /* no end frame */ }
              }

              videoUrl = await seedanceI2V({
                imageBuffer: imageSource,
                prompt,
                durationSeconds: Math.ceil(durSec),
                endImageBuffer: endFrameBuffer,
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

        // Save clip to Blob (versioned path)
        send({ progress: "Speichere Clip..." });
        const videoRes = await fetch(videoUrl);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const timestamp = Date.now();
        const clipPath = `studio/${projectId}/sequences/${sequenceId}/clips/clip-${String(body.sceneIndex).padStart(3, "0")}-v${timestamp}.mp4`;
        const clipBlob = await put(clipPath, videoBuffer, { access: "private", contentType: "video/mp4" });

        // Detect which provider was used
        const provider = isDialog
          ? (quality === "premium" ? "veo+lipsync" : "kling-avatar")
          : (quality === "premium" ? "kling-pro" : "seedance");

        const clipDurSec = hasAudio
          ? (scene.audioEndMs - scene.audioStartMs) / 1000
          : scene.durationHint || 5;
        const actualDurationMs = Math.round(clipDurSec * 1000);

        const estimatedCost = isDialog
          ? (quality === "premium" ? 0.55 : 0.28)
          : (quality === "premium" ? 0.84 : 0.13);

        // Save as Asset for the library (provenance tracking)
        try {
          const { createAsset } = await import("@/lib/assets");
          await createAsset({
            type: "clip",
            category: `scene:${body.sceneIndex}`,
            buffer: videoBuffer,
            filename: `clip-${String(body.sceneIndex).padStart(3, "0")}-v${timestamp}.mp4`,
            mimeType: "video/mp4",
            durationSec: clipDurSec,
            generatedBy: {
              model: provider,
              prompt: buildScenePrompt(scene, character?.description, body.stylePrompt || sequence.project.stylePrompt, defaultStyle, sequence.atmosphereText),
            },
            modelId: provider,
            costCents: Math.round(estimatedCost * 100),
            projectId,
            userId: session.user!.id!,
          });
        } catch (assetErr) {
          console.warn("[Clip] Asset save failed:", assetErr);
        }

        // Build new version entry
        const newVersion = {
          videoUrl: clipBlob.url,
          provider,
          quality,
          cost: estimatedCost,
          durationSec: clipDurSec,
          createdAt: new Date().toISOString(),
        };

        // Update scene in DB with version history
        const updatedScenes = scenes.map((s, i) => {
          if (i !== body.sceneIndex) return s;
          const existingVersions = s.versions || [];
          // If scene already had a videoUrl but no versions array, migrate it
          if (s.videoUrl && existingVersions.length === 0) {
            existingVersions.push({
              videoUrl: s.videoUrl,
              provider: "unknown",
              quality: s.quality || "standard",
              cost: 0,
              durationSec: clipDurSec,
              createdAt: s.videoUrl.includes("-v") ? "" : new Date().toISOString(),
            });
          }
          const versions = [...existingVersions, newVersion];
          return {
            ...s,
            videoUrl: clipBlob.url,
            status: "done" as const,
            quality,
            versions,
            activeVersionIdx: versions.length - 1,
            actualDurationMs,
          };
        });

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

/** Set active version or delete a version */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as {
    sceneIndex: number;
    action: "setActive" | "deleteVersion";
    versionIdx: number;
  };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
  });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const scene = scenes[body.sceneIndex];
  if (!scene) return Response.json({ error: "Szene nicht gefunden" }, { status: 404 });

  const versions = scene.versions || [];

  if (body.action === "setActive") {
    if (body.versionIdx < 0 || body.versionIdx >= versions.length) {
      return Response.json({ error: "Version nicht gefunden" }, { status: 404 });
    }
    scene.activeVersionIdx = body.versionIdx;
    scene.videoUrl = versions[body.versionIdx].videoUrl;
  } else if (body.action === "deleteVersion") {
    if (versions.length <= 1) {
      // Delete last version = reset scene
      scene.versions = [];
      scene.activeVersionIdx = undefined;
      scene.videoUrl = undefined;
      scene.status = "pending";
    } else {
      versions.splice(body.versionIdx, 1);
      scene.versions = versions;
      // Adjust activeVersionIdx
      if (scene.activeVersionIdx !== undefined && scene.activeVersionIdx >= versions.length) {
        scene.activeVersionIdx = versions.length - 1;
      }
      scene.videoUrl = versions[scene.activeVersionIdx || 0]?.videoUrl;
    }
  }

  scenes[body.sceneIndex] = scene;
  const doneCount = scenes.filter((s) => s.status === "done").length;

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: {
      scenes: JSON.parse(JSON.stringify(scenes)),
      clipCount: doneCount,
    },
  });

  return Response.json({ scene, doneCount });
}

/** Visual style cache — loaded once per request from DB */
let cachedVisualStyle: string | null = null;

async function getDefaultVisualStyle(): Promise<string> {
  if (cachedVisualStyle) return cachedVisualStyle;
  try {
    const { getBlockContent } = await import("@/lib/prompt-composer");
    const block = await getBlockContent("visual:disney-2d");
    if (block) { cachedVisualStyle = block.content; return block.content; }
  } catch { /* fallback */ }
  return "2D Disney/Pixar animation, vibrant colors, hand-drawn feel, warm lighting.";
}

function buildScenePrompt(scene: StudioScene, charDescription?: string | null, stylePrompt?: string | null, defaultStyle?: string, atmosphereText?: string | null): string {
  const parts: string[] = [];
  parts.push(`Style: ${stylePrompt || defaultStyle || "2D Disney/Pixar animation, vibrant colors, hand-drawn feel, warm lighting."}`);
  if (charDescription) {
    parts.push(`Character: ${charDescription}.`);
    parts.push("Maintain exact visual consistency with the reference character image.");
  }
  parts.push(scene.sceneDescription);
  if (scene.location) parts.push(`Setting: ${scene.location}.`);
  if (scene.mood) parts.push(`Mood: ${scene.mood}.`);
  if (atmosphereText) parts.push(`Atmosphere & Weather: ${atmosphereText}.`);
  if (scene.sfx) parts.push(`Sound effects in scene: ${scene.sfx}.`);
  if (scene.camera) parts.push(`Camera: ${scene.camera}.`);
  parts.push("NO text, NO subtitles, NO watermarks.");
  return parts.join(" ");
}

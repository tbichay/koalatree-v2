/**
 * Studio Sequence Clips API — Generate video clips for sequence scenes
 *
 * POST: Generate a single scene clip (SSE streaming)
 * PUT: Set active version or delete a version
 */

// Auth handled by resolveUserId (supports both session + internal task worker)
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import { klingAvatar, klingI2V, seedanceI2V, extractLastFrame } from "@/lib/fal";
import { segmentMp3 } from "@/lib/audio-segment";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 800;

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
  const { resolveUserId } = await import("@/lib/studio/task-auth");
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as ClipRequest;

  // Load sequence with project and characters
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: userId } },
    include: {
      project: {
        include: { characters: { include: { actor: true } } },
      },
    },
  });

  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // Resolve aspect ratio from project format
  const projectFormat = (sequence.project as { format?: string }).format || "portrait";
  const aspectRatio: "9:16" | "16:9" | "1:1" = projectFormat === "wide" || projectFormat === "cinema" ? "16:9" : "9:16";

  // Per-scene audio: check if any scene has dialogAudioUrl (V2) or sequence has audioUrl (V1 fallback)
  const scenesCheck = (sequence.scenes as unknown as StudioScene[]) || [];
  const hasPerSceneAudio = scenesCheck.some((s) => s.dialogAudioUrl);
  if (!hasPerSceneAudio && !sequence.audioUrl) return Response.json({ error: "Zuerst Audio generieren" }, { status: 400 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const scene = scenes[body.sceneIndex];
  if (!scene) return Response.json({ error: `Szene ${body.sceneIndex} nicht gefunden` }, { status: 404 });

  // Create task for tracking
  const { createTask } = await import("@/lib/studio/task-tracker");
  const task = await createTask(userId, "clip", projectId, { sequenceId, sceneIndex: body.sceneIndex, quality: body.quality }, body.quality === "premium" ? 150 : 30);

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

      send({ progress: "Starting...", taskId: task.id });
      await task.progress(`Clip Szene ${body.sceneIndex + 1}...`, 5);

        // Load default visual style from DB (cached per request)
        const defaultStyle = await getDefaultVisualStyle();
      const keepAlive = setInterval(() => send({ progress: "generating..." }), 5000);

      try {
        // Load audio for this scene — V2: per-scene dialogAudioUrl, V1 fallback: segment from sequence audio
        let hasAudio = false;
        let audioSegment: Buffer = Buffer.alloc(0);

        if (scene.dialogAudioUrl) {
          // V2: Per-scene audio — load directly
          send({ progress: "Lade Dialog-Audio..." });
          hasAudio = true;
          if (scene.dialogAudioUrl.includes(".blob.vercel-storage.com")) {
            const audioBlob = await get(scene.dialogAudioUrl, { access: "private" });
            if (!audioBlob?.stream) throw new Error("Dialog-Audio nicht ladbar");
            const reader = audioBlob.stream.getReader();
            const chunks: Uint8Array[] = [];
            let chunk;
            while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
            audioSegment = Buffer.concat(chunks);
          } else {
            const audioRes = await fetch(scene.dialogAudioUrl);
            audioSegment = Buffer.from(new Uint8Array(await audioRes.arrayBuffer()));
          }
        } else if (sequence.audioUrl && scene.audioStartMs !== scene.audioEndMs && scene.audioEndMs > 0) {
          // V1 fallback: segment from full sequence audio
          hasAudio = true;
          send({ progress: "Lade Audio-Segment..." });
          let fullAudio: Buffer;
          if (sequence.audioUrl.includes(".blob.vercel-storage.com")) {
            const audioBlob = await get(sequence.audioUrl, { access: "private" });
            if (!audioBlob?.stream) throw new Error("Audio nicht ladbar");
            const reader = audioBlob.stream.getReader();
            const chunks: Uint8Array[] = [];
            let chunk;
            while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
            fullAudio = Buffer.concat(chunks);
          } else {
            const audioRes = await fetch(sequence.audioUrl);
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
        const screenplayData = sequence.project.screenplay as Record<string, unknown> | null;
        const clipMode = body.mode || (screenplayData?.mode as string) || "film";
        const isDialog = (scene.type === "dialog") && scene.characterId && hasAudio && clipMode === "film";

        const prompt = buildScenePrompt(scene, character?.description, body.stylePrompt || sequence.project.stylePrompt, defaultStyle, sequence.atmosphereText, scenes[body.sceneIndex - 1]?.sceneDescription, character?.actor);

        // ── Load Character Sheet for multi-reference binding ──
        const actor = (character as unknown as { actor?: { characterSheet?: { front?: string; profile?: string; fullBody?: string } } })?.actor;
        const characterRefs: Buffer[] = [];
        if (actor?.characterSheet) {
          for (const angle of ["front", "profile", "fullBody"] as const) {
            const url = actor.characterSheet[angle];
            if (url) {
              try {
                const refUrl = resolveUrl(url);
                let refRes;
                if (refUrl.includes(".blob.vercel-storage.com")) {
                  const refBlob = await get(refUrl, { access: "private" });
                  if (refBlob?.stream) {
                    const reader = refBlob.stream.getReader();
                    const chunks: Uint8Array[] = [];
                    let chunk;
                    while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
                    characterRefs.push(Buffer.concat(chunks));
                  }
                } else {
                  refRes = await fetch(refUrl);
                  if (refRes.ok) characterRefs.push(Buffer.from(await refRes.arrayBuffer()));
                }
              } catch { /* skip this angle */ }
            }
          }
          if (characterRefs.length > 0) {
            send({ progress: `${characterRefs.length} Character-Referenzen geladen` });
            await task.progress(`${characterRefs.length} Referenzen`, 15);
          }
        }

        // ── Load landscape for transition/establishing shots ──
        let landscapeBuffer: Buffer | undefined;
        if (sequence.landscapeRefUrl) {
          try {
            const lsUrl = resolveUrl(sequence.landscapeRefUrl);
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

        if (isDialog && (portraitBuffer || characterRefs.length > 0)) {
          // ── DIALOG: Kling 3.0 Pro with Character Binding + Audio Lip-Sync ──
          const segDur = Math.min(10, Math.max(2, (scene.audioEndMs - scene.audioStartMs) / 1000));
          send({ progress: "Kling 3.0 Pro: Character + Lip-Sync..." });
          await task.progress("Kling 3.0 Dialog...", 30);

          // Use Kling Avatar for lip-sync (portrait + audio → talking head video)
          const startImage = prevFrame || portraitBuffer || characterRefs[0];
          if (!startImage) throw new Error("Kein Portrait verfuegbar fuer Dialog-Szene");

          try {
            // Kling 3.0 Pro Image-to-Video with character binding + our TTS audio
            videoUrl = await klingI2V({
              imageBuffer: startImage,
              prompt: `${prompt} The character speaks with natural lip movements matching the audio.`,
              durationSeconds: Math.ceil(segDur),
              aspectRatio,
              quality: "pro",
              characterElements: characterRefs.length > 0 ? characterRefs : portraitBuffer ? [portraitBuffer] : undefined,
              generateAudio: false, // We provide our own TTS audio
            });

            // Apply Lip-Sync with our TTS audio
            send({ progress: "Kling LipSync: Audio anwenden..." });
            await task.progress("Lip-Sync...", 60);
            const videoRes2 = await fetch(videoUrl);
            const videoBuffer = Buffer.from(await videoRes2.arrayBuffer());
            const { klingLipSync } = await import("@/lib/fal");
            videoUrl = await klingLipSync(videoBuffer, audioSegment);
          } catch (err) {
            console.warn("[Clip] Kling 3.0 Pro failed, fallback to Avatar:", err);
            send({ progress: "Fallback: Kling Avatar..." });
            videoUrl = await klingAvatar(startImage, audioSegment, prompt, "pro");
          }
        } else {
          // ── LANDSCAPE / TRANSITION: Kling 3.0 Image-to-Video ──
          const imageSource = prevFrame || landscapeBuffer || portraitBuffer || characterRefs[0];
          if (!imageSource) {
            send({ done: true, error: `Szene ${body.sceneIndex}: Kein Bild verfuegbar. Bitte Landscape oder Actor zuweisen.`, skipped: true });
            clearInterval(keepAlive);
            try { controller.close(); } catch { /* */ }
            return;
          }

          const durSec = scene.durationHint || 5;
          send({ progress: "Kling 3.0: Landscape..." });
          await task.progress("Landscape...", 30);

          try {
            videoUrl = await klingI2V({
              imageBuffer: imageSource,
              prompt,
              durationSeconds: Math.ceil(Math.min(10, durSec)),
              aspectRatio,
              quality: "pro",
              endImageBuffer: prevFrame && portraitBuffer ? portraitBuffer : undefined,
              characterElements: characterRefs.length > 0 ? characterRefs : undefined,
              generateAudio: false, // No audio for landscapes — ambient comes from Remotion
            });
          } catch (err) {
            console.warn("[Clip] Kling 3.0 landscape failed, fallback standard:", err);
            send({ progress: "Fallback: Kling Standard..." });
            videoUrl = await klingI2V({
              imageBuffer: imageSource,
              prompt,
              durationSeconds: Math.ceil(Math.min(10, durSec)),
              aspectRatio,
              quality: "standard",
            });
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

        // Provider is now always Kling 3.0
        const provider = isDialog ? "kling-3.0-pro+lipsync" : "kling-3.0-pro";

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
              prompt: buildScenePrompt(scene, character?.description, body.stylePrompt || sequence.project.stylePrompt, defaultStyle, sequence.atmosphereText, scenes[body.sceneIndex - 1]?.sceneDescription, character?.actor),
            },
            modelId: provider,
            costCents: Math.round(estimatedCost * 100),
            projectId,
            userId,
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
        await task.complete({ videoUrl: clipBlob.url, sceneIndex: body.sceneIndex });
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
        const errorMsg = err instanceof Error ? err.message : "Fehler";
        console.error("[Clip] Error:", err);
        await task.fail(errorMsg);
        send({ done: true, error: errorMsg });
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
  const { resolveUserId: resolveUser } = await import("@/lib/studio/task-auth");
  const putUserId = await resolveUser(request);
  if (!putUserId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as {
    sceneIndex: number;
    action: "setActive" | "deleteVersion";
    versionIdx: number;
  };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: putUserId } },
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

function buildScenePrompt(
  scene: StudioScene,
  charDescription?: string | null,
  stylePrompt?: string | null,
  defaultStyle?: string,
  atmosphereText?: string | null,
  prevSceneDescription?: string | null,
  actorData?: { outfit?: string | null; traits?: string | null } | null,
): string {
  const parts: string[] = [];

  // Visual style — FIRST so it sets the tone
  parts.push(`STYLE: ${stylePrompt || defaultStyle || "Photorealistic, cinematic lighting, professional cinematography."}`);

  // Character — detailed with actor traits/outfit
  if (charDescription) {
    let charLine = `CHARACTER (must match reference image exactly): ${charDescription}.`;
    if (actorData?.outfit) charLine += ` WEARING: ${actorData.outfit}.`;
    if (actorData?.traits) charLine += ` DISTINCTIVE FEATURES: ${actorData.traits}.`;
    parts.push(charLine);
  }

  // What the character is DOING — from spoken text context
  if (scene.spokenText && scene.type === "dialog") {
    parts.push(`ACTION: The character is speaking. Their mouth moves naturally as they talk. Body language matches the emotion: ${scene.emotion || "neutral"}.`);
  }

  // Main scene description — the AI Director's detailed visual description
  parts.push(`SCENE: ${scene.sceneDescription}`);

  // Continuity from previous scene
  if (prevSceneDescription) {
    parts.push(`CONTINUITY from previous shot: "${prevSceneDescription.slice(0, 150)}". Same environment, same lighting, same character position.`);
  }

  // Environment details
  if (scene.location) parts.push(`LOCATION: ${scene.location}.`);
  if (atmosphereText) parts.push(`ATMOSPHERE: ${atmosphereText}.`);
  if (scene.mood) parts.push(`MOOD: ${scene.mood}.`);

  // Camera
  if (scene.camera) {
    const cameraDetail: Record<string, string> = {
      "close-up": "Close-up shot focused on face and upper body, shallow depth of field.",
      "medium": "Medium shot showing character from waist up in their environment.",
      "wide": "Wide establishing shot showing the full scene and environment.",
      "slow-pan": "Slow horizontal pan across the scene, cinematic movement.",
      "zoom-in": "Gradual zoom into the subject, building intensity.",
      "zoom-out": "Slow zoom out revealing more of the environment.",
    };
    parts.push(`CAMERA: ${cameraDetail[scene.camera] || scene.camera}.`);
  }

  // Strict quality rules
  parts.push("RULES: Cinematic quality. NO text overlays. NO subtitles. NO watermarks. NO UI elements. NO extra characters unless specified.");

  return parts.join("\n");
}

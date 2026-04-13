/**
 * Studio Sequence Clips API — Generate video clips for sequence scenes
 *
 * POST: Generate a single scene clip (SSE streaming)
 * PUT: Set active version or delete a version
 */

// Auth handled by resolveUserId (supports both session + internal task worker)
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import { klingAvatar, klingI2V, klingO3, seedanceI2V, extractLastFrame } from "@/lib/fal";
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

/** Load a buffer from Vercel Blob or HTTP URL */
async function loadBlobBuffer(url: string): Promise<Buffer | undefined> {
  try {
    if (url.includes(".blob.vercel-storage.com")) {
      const blob = await get(url, { access: "private" });
      if (!blob?.stream) return undefined;
      const reader = blob.stream.getReader();
      const chunks: Uint8Array[] = [];
      let chunk;
      while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
      return Buffer.concat(chunks);
    } else {
      const res = await fetch(url);
      if (!res.ok) return undefined;
      return Buffer.from(await res.arrayBuffer());
    }
  } catch {
    return undefined;
  }
}

interface ClipRequest {
  sceneIndex: number;
  quality?: "standard" | "premium";
  stylePrompt?: string;
  mode?: "film" | "hoerspiel" | "audiobook"; // film = lip-sync, hoerspiel/audiobook = no lip-sync
  force?: boolean;
  provider?: "kling" | "runway"; // Video provider (default: kling)
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

        // Find character for this scene
        const character = scene.characterId
          ? sequence.project.characters.find((c) => c.id === scene.characterId)
          : null;

        // Resolve portrait: try ALL sources (castSnapshot → actor.characterSheet → actor.portraitAssetId → char.portraitUrl)
        const resolvePortraitUrl = (char: typeof character): string | undefined => {
          if (!char) return undefined;
          const actor = (char as unknown as { actor?: { portraitAssetId?: string; characterSheet?: { front?: string } } }).actor;
          const castSnapshot = (char as unknown as { castSnapshot?: { portraitUrl?: string } }).castSnapshot;
          return castSnapshot?.portraitUrl
            || actor?.characterSheet?.front
            || actor?.portraitAssetId
            || char.portraitUrl
            || undefined;
        };

        const portraitChar = resolvePortraitUrl(character) ? character
          : sequence.project.characters.find((c) => c.role === "lead" && resolvePortraitUrl(c))
          || sequence.project.characters.find((c) => resolvePortraitUrl(c));

        let portraitBuffer: Buffer | undefined;
        const portraitUrl = resolvePortraitUrl(portraitChar);
        if (portraitUrl) {
          send({ progress: `Lade Portrait (${portraitChar?.name})...` });
          const buf = await loadBlobBuffer(portraitUrl);
          if (buf) {
            portraitBuffer = buf;
            console.log(`[Clip] Portrait loaded for ${portraitChar?.name}: ${portraitUrl.slice(-40)}`);
          } else {
            console.warn(`[Clip] Portrait FAILED for ${portraitChar?.name}: ${portraitUrl.slice(-40)}`);
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

        // Check for costume override from sequence
        const costumesJson = (sequence as unknown as { costumes?: Record<string, { description: string }> }).costumes;
        const costumeOverride = scene.characterId && costumesJson ? costumesJson[scene.characterId] : undefined;
        const actorDataForPrompt = character?.actor
          ? {
              ...character.actor,
              outfit: costumeOverride?.description || (character.actor as { outfit?: string }).outfit,
            }
          : undefined;
        if (costumeOverride) {
          console.log(`[Clip] Costume override for ${character?.name}: ${costumeOverride.description}`);
        }

        const prompt = buildScenePrompt(scene, character?.description, body.stylePrompt || sequence.project.stylePrompt, defaultStyle, sequence.atmosphereText, scenes[body.sceneIndex - 1]?.sceneDescription, actorDataForPrompt);

        // ── Load Character Sheet for multi-reference binding ──
        const actor = (character as unknown as { actor?: { characterSheet?: { front?: string; profile?: string; fullBody?: string } } })?.actor;
        const characterRefs: Buffer[] = [];
        if (actor?.characterSheet) {
          for (const angle of ["front", "profile", "fullBody"] as const) {
            const url = actor.characterSheet[angle];
            if (url) {
              const buf = await loadBlobBuffer(url);
              if (buf) {
                characterRefs.push(buf);
                console.log(`[Clip] Character ref ${angle} loaded: ${url.slice(-40)}`);
              }
            }
          }
          if (characterRefs.length > 0) {
            send({ progress: `${characterRefs.length} Character-Referenzen geladen` });
            await task.progress(`${characterRefs.length} Referenzen`, 15);
          }
        }
        // Fallback: if no character sheet but portrait exists, use it as single ref
        if (characterRefs.length === 0 && portraitBuffer) {
          characterRefs.push(portraitBuffer);
          console.log(`[Clip] Using portrait as single character reference`);
        }

        // ── Load props from Library as additional Elements ──
        const propElements: Buffer[] = [];
        try {
          const { getAssets } = await import("@/lib/assets");
          const propAssets = await getAssets({
            type: "reference" as any,
            category: "prop",
            userId,
            limit: 3, // Kling allows max 3 elements total
          });
          // Only load props if we have room (max 3 elements: character refs + props)
          const maxProps = Math.max(0, 3 - characterRefs.length);
          for (const prop of propAssets.slice(0, maxProps)) {
            const propBuffer = await loadBlobBuffer(prop.blobUrl);
            if (propBuffer) {
              propElements.push(propBuffer);
              console.log(`[Clip] Prop element loaded: ${(prop as { name?: string }).name || prop.category}`);
            }
          }
        } catch {
          // No props available — continue without
        }

        // Combine character refs + props for Kling Elements
        const allElements = [...characterRefs, ...propElements];

        // ── Load location image for scene background ──
        let landscapeBuffer: Buffer | undefined;
        if (sequence.landscapeRefUrl) {
          landscapeBuffer = await loadBlobBuffer(sequence.landscapeRefUrl);
          if (landscapeBuffer) {
            console.log(`[Clip] Location loaded from sequence`);
          }
        }
        // Fallback: load from Library if no location assigned
        if (!landscapeBuffer) {
          try {
            const { getAssets: getLocAssets } = await import("@/lib/assets");
            const locs = await getLocAssets({ type: "landscape" as any, userId, limit: 1 });
            if (locs.length > 0) {
              landscapeBuffer = await loadBlobBuffer(locs[0].blobUrl);
              if (landscapeBuffer) console.log(`[Clip] Location fallback from Library: ${(locs[0] as { name?: string }).name}`);
            }
          } catch { /* no location */ }
        }

        // Summary log
        console.log(`[Clip] Scene ${body.sceneIndex} ready: portrait=${!!portraitBuffer}, charRefs=${characterRefs.length}, location=${!!landscapeBuffer}, storyboard=${!!scene.storyboardImageUrl}, props=${propElements.length}, elements=${allElements.length}`);

        if (isDialog && (portraitBuffer || characterRefs.length > 0)) {
          // ── DIALOG: Camera-based strategy ──
          // close-up → Avatar (only speaker, with lip-sync)
          // medium/wide → I2V (group scene, no lip-sync, audio plays over)
          const audioDurSec = (scene.audioEndMs - scene.audioStartMs) / 1000;
          const segDur = Math.max(2, Math.ceil(audioDurSec));
          const camera = scene.camera || "close-up";
          const isCloseUp = camera === "close-up" || camera === "zoom-in";

          const useRunwayForDialog = body.provider === "runway";

          if (isCloseUp) {
            const speakerImage = portraitBuffer || characterRefs[0];
            if (!speakerImage) throw new Error("Kein Portrait fuer Close-Up Dialog");

            send({ progress: `Close-Up: ${character?.name || "Dialog"} spricht... (${useRunwayForDialog ? "Runway" : "Kling"})` });
            await task.progress(`Close-Up: ${character?.name || "Dialog"}`, 30);

            if (useRunwayForDialog) {
              // ── RUNWAY: Use prevFrame for continuity (NOT portrait — avoids "portrait look") ──
              try {
                const { runwayI2V, bufferToDataUri } = await import("@/lib/runway");
                // Prefer prevFrame for action continuity, fallback to portrait
                const runwayStartImage = prevFrame || landscapeBuffer || speakerImage;
                const charDesc = actorDataForPrompt
                  ? `The main character is ${character?.name || "the protagonist"}: ${(character as any)?.description || ""}. ${actorDataForPrompt.outfit ? `Wearing: ${actorDataForPrompt.outfit}.` : ""}`
                  : "";
                videoUrl = await runwayI2V({
                  imageUrl: bufferToDataUri(runwayStartImage, "image/png"),
                  prompt: `${charDesc} ${prompt}. Character speaking naturally, animated facial expressions, in action (not a static portrait).`,
                  duration: Math.min(10, Math.ceil(segDur)) as 5 | 10,
                  ratio: aspectRatio === "9:16" ? "720:1280" : "1280:720",
                  model: quality === "premium" ? "gen4.5" : "gen4_turbo",
                });
              } catch (runwayErr) {
                console.warn("[Clip] Runway dialog failed, falling back to Kling Avatar:", runwayErr);
                send({ progress: "Runway fehlgeschlagen, Fallback: Kling Avatar..." });
                // Fall through to Kling below
              }
            }

            if (!videoUrl) {
              // ── KLING AVATAR: portrait + audio → video with lip-sync ──
              try {
                videoUrl = await klingAvatar(speakerImage, audioSegment, prompt, "pro");
              } catch (err) {
                console.warn("[Clip] Avatar Pro failed, trying Standard:", err);
                send({ progress: "Fallback: Avatar Standard..." });
                try {
                  videoUrl = await klingAvatar(speakerImage, audioSegment, prompt, "standard");
                } catch (err2) {
                  console.warn("[Clip] Avatar Standard failed, trying I2V:", err2);
                  send({ progress: "Fallback: I2V..." });
                  videoUrl = await klingI2V({
                    imageBuffer: speakerImage,
                    prompt,
                    durationSeconds: Math.ceil(segDur),
                    aspectRatio,
                    quality: "pro",
                    generateAudio: false,
                  });
                }
              }
            }
          } else {
            // ── MEDIUM/WIDE: group scene, NO lip-sync ──
            const groupImage = landscapeBuffer || prevFrame || portraitBuffer || characterRefs[0];
            if (!groupImage) throw new Error("Kein Bild fuer Gruppenszene");

            send({ progress: `${camera}: Gruppenszene (${useRunwayForDialog ? "Runway" : "Kling"})...` });
            await task.progress(`${camera}: Gruppe`, 30);

            if (useRunwayForDialog) {
              try {
                const { runwayI2V, bufferToDataUri } = await import("@/lib/runway");
                // Use prevFrame for continuity
                const runwayGroupImage = prevFrame || groupImage;
                const charDesc = character
                  ? `The main character "${character.name}" (${(character as any)?.description || ""}) is in the scene. ${actorDataForPrompt?.outfit ? `Wearing: ${actorDataForPrompt.outfit}.` : ""}`
                  : "";
                videoUrl = await runwayI2V({
                  imageUrl: bufferToDataUri(runwayGroupImage, "image/png"),
                  prompt: `${charDesc} ${prompt}`,
                  duration: Math.min(10, Math.ceil(segDur)) as 5 | 10,
                  ratio: aspectRatio === "9:16" ? "720:1280" : "1280:720",
                  model: quality === "premium" ? "gen4.5" : "gen4_turbo",
                });
              } catch (runwayErr) {
                console.warn("[Clip] Runway group failed, falling back to Kling:", runwayErr);
              }
            }

            if (!videoUrl) {
            try {
              videoUrl = await klingI2V({
                imageBuffer: groupImage,
                prompt,
                durationSeconds: Math.ceil(segDur),
                aspectRatio,
                quality: "pro",
                characterElements: allElements.length > 0 ? allElements : undefined,
                generateAudio: false,
              });
            } catch (err) {
              console.warn("[Clip] I2V Pro failed, trying Standard:", err);
              send({ progress: "Fallback: I2V Standard..." });
              videoUrl = await klingI2V({
                imageBuffer: groupImage,
                prompt,
                durationSeconds: Math.ceil(segDur),
                aspectRatio,
                quality: "standard",
                generateAudio: false,
              });
            }
            } // close if (!videoUrl) — Kling fallback for group
          }
        } else {
          // ── LANDSCAPE / TRANSITION ──

          const storyboardFrame = scene.storyboardImageUrl ? await loadBlobBuffer(scene.storyboardImageUrl) : undefined;
          // Priority: prevFrame FIRST for continuity (prevents "paddling on sand")
          // Location only for first scene or when no prevFrame
          const imageSource = prevFrame || landscapeBuffer || storyboardFrame || portraitBuffer || characterRefs[0];
          if (!imageSource) {
            send({ done: true, error: `Szene ${body.sceneIndex}: Kein Bild verfuegbar. Bitte Location oder Actor zuweisen.`, skipped: true });
            clearInterval(keepAlive);
            try { controller.close(); } catch { /* */ }
            return;
          }

          const durSec = scene.durationHint || 5;
          const useRunway = body.provider === "runway";

          // ── RUNWAY PATH ──
          if (useRunway) {
            try {
              send({ progress: `Runway: Szene...` });
              await task.progress("Runway...", 30);

              const { runwayI2V, bufferToDataUri } = await import("@/lib/runway");
              const imageDataUri = bufferToDataUri(imageSource, "image/png");
              // Add character description even for landscape scenes (many "landscape" scenes show the character)
              const charDesc = character
                ? `The main character "${character.name}" is in this scene. ${(character as any)?.description || ""}. ${actorDataForPrompt?.outfit ? `Wearing: ${actorDataForPrompt.outfit}.` : ""}`
                : "";
              videoUrl = await runwayI2V({
                imageUrl: imageDataUri,
                prompt: `${charDesc} ${prompt}`.trim(),
                duration: durSec <= 5 ? 5 : 10,
                ratio: aspectRatio === "9:16" ? "720:1280" : "1280:720",
                model: quality === "premium" ? "gen4.5" : "gen4_turbo",
              });
            } catch (runwayErr) {
              console.warn("[Clip] Runway failed, falling back to Kling:", runwayErr);
              send({ progress: "Runway fehlgeschlagen, Fallback: Kling..." });
            }
          }

          // ── KLING PATH (default or fallback) ──
          if (!videoUrl) {
            const useO3 = durSec > 5 || scene.storyboardImageUrl;

          if (useO3) {
            try {
              // Build multi_prompt if there are consecutive landscape scenes
              const multiPrompts: string[] = [];
              const nextScenes = scenes.slice(body.sceneIndex, body.sceneIndex + 3); // Look ahead up to 3 scenes
              // Only use multi_prompt if current scene is long enough
              if (durSec >= 8 && nextScenes.length > 1) {
                for (const ns of nextScenes) {
                  if (ns.sceneDescription) {
                    multiPrompts.push(ns.sceneDescription.replace(/"[^"]*"/g, "").trim());
                  }
                }
              }

              send({ progress: `Kling O3: ${multiPrompts.length > 1 ? `Multi-Shot (${multiPrompts.length})` : "Szene"}...` });
              await task.progress("O3...", 30);

              videoUrl = await klingO3({
                imageBuffer: imageSource,
                prompt,
                durationSeconds: Math.ceil(Math.min(15, durSec)),
                multiPrompt: multiPrompts.length > 1 ? multiPrompts : undefined,
                shotType: scene.cameraMotion || undefined,
                characterElements: allElements.length > 0 ? allElements : undefined,
                generateAudio: false,
              });
            } catch (err) {
              console.warn("[Clip] O3 failed, falling back to Kling v3:", err);
              send({ progress: "Fallback: Kling 3.0..." });
              videoUrl = ""; // Reset for fallback
            }
          }

          if (!videoUrl) {
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
                characterElements: allElements.length > 0 ? allElements : undefined,
                generateAudio: false,
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
          } // close if (!videoUrl) — Kling fallback block
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

  // CRITICAL: No text in video — must be FIRST instruction
  parts.push("ABSOLUTE RULE: Do NOT render ANY text, words, letters, subtitles, captions, titles, or writing of any kind in the video. The video must be PURELY VISUAL with zero text.");

  // Visual style
  parts.push(`STYLE: ${stylePrompt || defaultStyle || "Photorealistic, cinematic lighting, professional cinematography."}`);

  // Character — detailed with actor traits/outfit
  if (charDescription) {
    let charLine = `CHARACTER (must match reference image exactly): ${charDescription}.`;
    if (actorData?.outfit) charLine += ` WEARING: ${actorData.outfit}.`;
    if (actorData?.traits) charLine += ` DISTINCTIVE FEATURES: ${actorData.traits}.`;
    parts.push(charLine);
  }

  // What the character is DOING — body language only, NO dialog text
  if (scene.spokenText && scene.type === "dialog") {
    // Don't include the spoken text — just describe the action
    const emotionAction: Record<string, string> = {
      "neutral": "talking naturally",
      "excited": "talking excitedly with animated gestures",
      "happy": "talking happily with a bright smile",
      "sad": "speaking softly with a sad expression",
      "angry": "speaking forcefully with intense expression",
      "scared": "speaking nervously, looking around anxiously",
      "dramatic": "speaking with dramatic intensity",
      "tense": "speaking through tension, jaw clenched",
      "calm": "speaking calmly and gently",
      "joyful": "laughing and talking with pure joy, body shaking with laughter",
    };
    parts.push(`ACTION: The character is ${emotionAction[scene.emotion || "neutral"] || "talking"}. Mouth moves naturally. No text or subtitles shown.`);
  }

  // Main scene description — strip any quoted dialog to prevent text rendering
  const cleanDescription = scene.sceneDescription
    .replace(/"[^"]*"/g, "") // Remove quoted text
    .replace(/says?\s*:?\s*"[^"]*"/gi, "") // Remove "says: ..."
    .replace(/\s+/g, " ").trim();
  parts.push(`SCENE: ${cleanDescription}`);

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

  // Camera motion (user override or AI-assigned)
  if (scene.cameraMotion) {
    const motionDetail: Record<string, string> = {
      "static": "Camera is completely still, no movement.",
      "pan-left": "Camera pans slowly to the left.",
      "pan-right": "Camera pans slowly to the right.",
      "tilt-up": "Camera tilts upward slowly.",
      "tilt-down": "Camera tilts downward slowly.",
      "zoom-in": "Camera zooms in gradually, increasing tension.",
      "zoom-out": "Camera zooms out slowly, revealing more of the scene.",
      "dolly-forward": "Camera moves forward toward the subject.",
      "dolly-back": "Camera pulls back away from the subject.",
      "tracking": "Camera tracks alongside the moving character.",
      "rotation": "Camera slowly rotates around the subject.",
    };
    parts.push(`CAMERA MOTION: ${motionDetail[scene.cameraMotion] || scene.cameraMotion}`);
  }

  // Strict quality rules
  parts.push("RULES: Cinematic quality. NO text overlays. NO subtitles. NO watermarks. NO UI elements. NO extra characters unless specified.");

  return parts.join("\n");
}

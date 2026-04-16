/**
 * Studio Task Queue Processor — Cron job that runs every minute
 *
 * Picks the next pending task and executes it.
 * Handles: clip, audio, story, screenplay, portrait, landscape, character-sheet, assemble
 */

import { prisma } from "@/lib/db";

export const maxDuration = 800;

// Verify cron secret or allow direct invocation in dev
function verifyCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  // Allow in development
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reset stale tasks (stuck in "running" for >10 minutes)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.studioTask.updateMany({
    where: {
      status: "running",
      startedAt: { lt: staleThreshold },
    },
    data: {
      status: "pending",
      error: "Task war zu lange blockiert und wurde zurueckgesetzt",
    },
  });

  // Pick next task (highest priority first, then oldest)
  const task = await prisma.studioTask.findFirst({
    where: { status: "pending" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  if (!task) {
    return Response.json({ message: "Keine wartenden Tasks", processed: false });
  }

  console.log(`[StudioTask] Processing task ${task.id}: type=${task.type}, retry=${task.retryCount}/${task.maxRetries}`);

  // Mark as running
  await prisma.studioTask.update({
    where: { id: task.id },
    data: { status: "running", startedAt: new Date(), error: null },
  });

  const updateProgress = async (progress: string, pct?: number) => {
    await prisma.studioTask.update({
      where: { id: task.id },
      data: { progress, ...(pct !== undefined ? { progressPct: pct } : {}) },
    });
  };

  try {
    let output: Record<string, unknown> = {};
    let actualCostCents = 0;

    const input = task.input as Record<string, unknown>;

    switch (task.type) {
      case "clip": {
        await updateProgress("Generiere Clip...", 10);
        output = await processClipTask(input, task.userId, updateProgress);
        actualCostCents = (output.costCents as number) || 0;
        break;
      }
      case "audio": {
        await updateProgress("Generiere Audio...", 10);
        output = await processAudioTask(input, task.userId, updateProgress);
        break;
      }
      case "portrait": {
        await updateProgress("Generiere Portrait...", 10);
        output = await processPortraitTask(input, task.userId, updateProgress);
        actualCostCents = 4; // ~$0.04
        break;
      }
      case "landscape": {
        await updateProgress("Generiere Landscape...", 10);
        output = await processLandscapeTask(input, task.userId, updateProgress);
        actualCostCents = 4;
        break;
      }
      case "character-sheet": {
        await updateProgress("Generiere Character Sheet...", 10);
        output = await processCharacterSheetTask(input, task.userId, updateProgress);
        actualCostCents = 4;
        break;
      }
      case "story": {
        await updateProgress("Generiere Geschichte...", 10);
        output = await processStoryTask(input, task.userId, updateProgress);
        actualCostCents = 2; // ~$0.02
        break;
      }
      case "screenplay": {
        await updateProgress("Generiere Drehbuch...", 10);
        output = await processScreenplayTask(input, task.userId, updateProgress);
        actualCostCents = 5; // ~$0.05
        break;
      }
      default:
        throw new Error(`Unbekannter Task-Typ: ${task.type}`);
    }

    // Quality check (if applicable)
    let qualityScore: number | undefined;
    let qualityNotes: string | undefined;

    if (task.type === "clip" || task.type === "portrait" || task.type === "character-sheet") {
      try {
        const { checkVisualQuality } = await import("@/lib/studio/quality-check");
        const check = await checkVisualQuality(
          output.url as string || output.portraitUrl as string || output.videoUrl as string,
          output.prompt as string || "",
          task.type,
        );
        qualityScore = check.score;
        qualityNotes = check.notes;

        // Store prompt feedback for pattern analysis
        const originalPrompt = output.prompt as string || "";
        if (originalPrompt) {
          try {
            const { storePromptFeedback, improvePrompt } = await import("@/lib/studio/prompt-tuner");

            if (check.score < 70) {
              // Try to improve the prompt for low-quality results
              let improvedPrompt: string | undefined;
              let improvement: string | undefined;

              if (check.score < 40 && task.retryCount < task.maxRetries) {
                const improved = await improvePrompt(originalPrompt, check.notes, check.score, task.type);
                improvedPrompt = improved.improvedPrompt;
                improvement = improved.changes;
              }

              await storePromptFeedback(
                task.id,
                originalPrompt,
                check.score,
                check.notes,
                improvedPrompt,
                improvement,
              );
            }
          } catch (tunerErr) {
            console.error("[PromptTuner] Error:", tunerErr);
          }
        }

        // Auto-retry if quality is too low
        if (check.score < 40 && task.retryCount < task.maxRetries) {
          // Use improved prompt for retry if available
          const feedback = await prisma.promptFeedback.findFirst({
            where: { taskId: task.id },
            orderBy: { createdAt: "desc" },
          });

          const updatedInput = { ...(task.input as Record<string, unknown>) };
          if (feedback?.improvedPrompt) {
            updatedInput.stylePrompt = feedback.improvedPrompt;
          }

          await prisma.studioTask.update({
            where: { id: task.id },
            data: {
              status: "pending",
              retryCount: task.retryCount + 1,
              input: JSON.parse(JSON.stringify(updatedInput)),
              error: `Quality Score zu niedrig (${check.score}/100): ${check.notes}`,
              qualityScore: check.score,
              qualityNotes: check.notes,
              qualityChecked: true,
              actualCostCents,
            },
          });
          return Response.json({ processed: true, taskId: task.id, status: "retry-with-improved-prompt", qualityScore: check.score });
        }
      } catch (err) {
        console.error("[QualityCheck] Error:", err);
        // Quality check failure is non-fatal
      }
    }

    // Mark as completed
    await prisma.studioTask.update({
      where: { id: task.id },
      data: {
        status: "completed",
        output: output as object,
        progress: "Fertig",
        progressPct: 100,
        completedAt: new Date(),
        actualCostCents,
        ...(qualityScore !== undefined ? { qualityScore, qualityNotes, qualityChecked: true } : {}),
      },
    });

    return Response.json({ processed: true, taskId: task.id, status: "completed", qualityScore });
  } catch (err) {
    console.error(`[StudioTask] ${task.type} failed:`, err);

    const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
    const shouldRetry = task.retryCount < task.maxRetries;

    await prisma.studioTask.update({
      where: { id: task.id },
      data: {
        status: shouldRetry ? "pending" : "failed",
        error: errorMsg,
        retryCount: task.retryCount + 1,
        ...(shouldRetry ? {} : { completedAt: new Date() }),
      },
    });

    return Response.json({ processed: true, taskId: task.id, status: shouldRetry ? "retry" : "failed", error: errorMsg });
  }
}

// ── Task Processors ──────────────────────────────────────────────

async function processClipTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, sequenceId, sceneIndex, quality: qualityInput, stylePrompt, mode, provider, directorNote, cameraOverride, durationOverride } = input as {
    projectId: string;
    sequenceId: string;
    sceneIndex: number;
    quality?: string;
    stylePrompt?: string;
    mode?: string;
    provider?: string;
    directorNote?: string;
    cameraOverride?: string;
    durationOverride?: number;
  };
  const quality = qualityInput || "standard";

  // Sequential check: ensure ALL previous scenes in this sequence are done
  const pendingPrev = await prisma.studioTask.findFirst({
    where: {
      type: "clip",
      status: { in: ["pending", "running"] },
      input: { path: ["sequenceId"], equals: sequenceId },
    },
    orderBy: { createdAt: "asc" },
  });
  // If there's a pending/running clip task for a LOWER sceneIndex, defer this one
  if (pendingPrev) {
    const prevInput = pendingPrev.input as Record<string, unknown>;
    if (typeof prevInput.sceneIndex === "number" && prevInput.sceneIndex < sceneIndex) {
      throw new Error(`Warte auf Szene ${(prevInput.sceneIndex as number) + 1} (sequentiell)`);
    }
  }

  await updateProgress(`Clip Szene ${sceneIndex + 1}: Lade Daten...`, 10);

  // Load sequence with project and characters
  const { put, get } = await import("@vercel/blob");
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId } },
    include: {
      project: {
        include: { characters: { include: { actor: true } } },
      },
    },
  });
  if (!sequence) throw new Error("Sequenz nicht gefunden");

  const scenes = (sequence.scenes as unknown as import("@/lib/studio/types").StudioScene[]) || [];
  const scene = scenes[sceneIndex];
  if (!scene) throw new Error(`Szene ${sceneIndex} nicht gefunden`);

  const projectFormat = (sequence.project as { format?: string }).format || "portrait";
  const aspectRatio: "9:16" | "16:9" | "1:1" = projectFormat === "wide" || projectFormat === "cinema" ? "16:9" : "9:16";

  // Helper to load buffers from Vercel Blob or HTTP
  const loadBlobBuffer = async (url: string): Promise<Buffer | undefined> => {
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
    } catch { return undefined; }
  };

  // Determine if scene has audio
  const hasAudio = !!scene.dialogAudioUrl || (!!sequence.audioUrl && scene.audioStartMs !== scene.audioEndMs && scene.audioEndMs > 0);

  // Find character for this scene
  const character = scene.characterId
    ? sequence.project.characters.find((c) => c.id === scene.characterId)
    : null;

  const screenplayData = sequence.project.screenplay as Record<string, unknown> | null;
  const clipMode = mode || (screenplayData?.mode as string) || "film";
  const isDialog = scene.type === "dialog" && !!scene.characterId && hasAudio;

  // Resolve portrait URL
  const resolvePortraitUrl = (char: typeof character): string | undefined => {
    if (!char) return undefined;
    const actor = (char as unknown as { actor?: { portraitAssetId?: string; characterSheet?: { front?: string } } }).actor;
    const castSnapshot = (char as unknown as { castSnapshot?: { portraitUrl?: string } }).castSnapshot;
    return castSnapshot?.portraitUrl || actor?.characterSheet?.front || actor?.portraitAssetId || char.portraitUrl || undefined;
  };

  const portraitChar = resolvePortraitUrl(character) ? character
    : sequence.project.characters.find((c) => c.role === "lead" && resolvePortraitUrl(c))
    || sequence.project.characters.find((c) => resolvePortraitUrl(c));

  await updateProgress(`Clip Szene ${sceneIndex + 1}: Lade Bilder...`, 20);

  // Load portrait
  let portraitBuffer: Buffer | undefined;
  const portraitUrl = resolvePortraitUrl(portraitChar);
  if (portraitUrl) {
    portraitBuffer = await loadBlobBuffer(portraitUrl);
  }
  // Detailed logging for character → actor → image chain
  const actorObj = (character as unknown as { actor?: { id?: string; name?: string; characterSheet?: Record<string, string> } })?.actor;
  console.log(`[Clip] Scene ${sceneIndex} character chain:`,
    `char="${character?.name}" (${character?.id?.slice(-6)})`,
    `→ actor="${actorObj?.name || "NONE"}" (${actorObj?.id?.slice(-6) || "—"})`,
    `→ portrait=${portraitBuffer ? "loaded" : "MISSING"}`,
    `→ sheet=${actorObj?.characterSheet ? Object.keys(actorObj.characterSheet).filter(k => actorObj.characterSheet![k]).join(",") || "empty" : "NONE"}`,
  );

  // Load previous frame for continuity
  let prevFrame: Buffer | undefined;
  const transition = scene.clipTransition || "seamless";
  const needsPrevFrame = transition === "seamless" || transition === "match-cut";

  async function loadFrameFromBlob(path: string): Promise<Buffer | undefined> {
    try {
      const existing = await get(path, { access: "private" });
      if (existing?.stream) {
        const reader = existing.stream.getReader();
        const chunks: Uint8Array[] = [];
        let chunk;
        while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
        return Buffer.concat(chunks);
      }
    } catch (e) { console.warn("[Cron] Frame load:", e); }
    return undefined;
  }

  if (needsPrevFrame) {
    if (sceneIndex > 0) {
      // Load from previous scene in same sequence
      const prevFramePath = `studio/${projectId}/sequences/${sequenceId}/frames/frame-${String(sceneIndex - 1).padStart(3, "0")}.png`;
      prevFrame = await loadFrameFromBlob(prevFramePath);
    } else {
      // Scene 0: load last frame from PREVIOUS sequence (cross-sequence transition)
      const prevSequence = await prisma.studioSequence.findFirst({
        where: { projectId, orderIndex: { lt: sequence.orderIndex } },
        orderBy: { orderIndex: "desc" },
        select: { id: true, sceneCount: true, scenes: true },
      });
      if (prevSequence?.sceneCount) {
        const lastSceneIdx = prevSequence.sceneCount - 1;
        const prevFramePath = `studio/${projectId}/sequences/${prevSequence.id}/frames/frame-${String(lastSceneIdx).padStart(3, "0")}.png`;
        prevFrame = await loadFrameFromBlob(prevFramePath);

        // Fallback: if no saved frame, extract from last clip's video
        if (!prevFrame) {
          const prevScenes = (prevSequence.scenes as unknown as Array<{ videoUrl?: string; status?: string }>) || [];
          const lastScene = prevScenes[lastSceneIdx];
          if (lastScene?.videoUrl && lastScene.status === "done") {
            console.log(`[Clip] No saved frame — extracting from previous sequence's last clip`);
            try {
              const prevVideoBuffer = await loadBlobBuffer(lastScene.videoUrl);
              if (prevVideoBuffer) {
                const { uploadToFal, extractLastFrame } = await import("@/lib/fal");
                const uploadedUrl = await uploadToFal(prevVideoBuffer, "prev-clip.mp4", "video/mp4");
                const frameBuffer = await extractLastFrame(uploadedUrl);
                prevFrame = frameBuffer;
                // Save for next time
                await put(prevFramePath, frameBuffer, { access: "private", contentType: "image/png" });
                console.log(`[Clip] Cross-sequence frame extracted and saved for future use`);
              }
            } catch (extractErr) {
              console.error(`[Clip] Cross-sequence frame extraction failed:`, extractErr instanceof Error ? extractErr.message : extractErr);
            }
          }
        }
        console.log(`[Clip] Cross-sequence prevFrame from seq ${prevSequence.id} scene ${lastSceneIdx}: ${prevFrame ? "loaded" : "not found"}`);
      }
    }
    console.log(`[Clip] Scene ${sceneIndex}: ${transition} — ${prevFrame ? "prevFrame loaded" : "no prevFrame"}`);
  }

  // Load character sheet refs
  const actor = (character as unknown as { actor?: { characterSheet?: { front?: string; profile?: string; fullBody?: string } } })?.actor;
  const characterRefs: Buffer[] = [];
  if (actor?.characterSheet) {
    for (const angle of ["front", "profile", "fullBody"] as const) {
      const url = actor.characterSheet[angle];
      if (url) {
        const buf = await loadBlobBuffer(url);
        if (buf) characterRefs.push(buf);
      }
    }
  }
  if (characterRefs.length === 0 && portraitBuffer) characterRefs.push(portraitBuffer);
  console.log(`[Clip] Scene ${sceneIndex}: ${characterRefs.length} character refs loaded (${characterRefs.length >= 3 ? "full sheet" : characterRefs.length === 1 ? "portrait only" : "NONE"})`);

  // Load location image
  let landscapeBuffer: Buffer | undefined;
  if (sequence.landscapeRefUrl) {
    landscapeBuffer = await loadBlobBuffer(sequence.landscapeRefUrl);
  }
  if (!landscapeBuffer) {
    try {
      const { getAssets } = await import("@/lib/assets");
      const locs = await getAssets({ type: "landscape" as any, userId, limit: 1 });
      if (locs.length > 0) landscapeBuffer = await loadBlobBuffer(locs[0].blobUrl);
    } catch (e) { console.warn("[Cron]", e); }
  }

  // Costume override
  const costumesJson = (sequence as unknown as { costumes?: Record<string, { description: string }> }).costumes;
  const costumeOverride = scene.characterId && costumesJson ? costumesJson[scene.characterId] : undefined;

  // If director's note: rewrite sceneDescription with AI before building prompt
  let effectiveDescription = scene.sceneDescription;
  if (directorNote) {
    await updateProgress(`Clip Szene ${sceneIndex + 1}: Integriere Regie-Anweisung...`, 25);
    try {
      const { enhanceSceneDescription } = await import("@/lib/studio/image-quality");
      const enhanced = await enhanceSceneDescription({
        currentDescription: scene.sceneDescription,
        userCorrection: directorNote,
        sceneType: scene.type as "landscape" | "dialog" | "transition",
        characterName: character?.name,
        characterDescription: (character as any)?.description,
        location: scene.location || (sequence.location as string | undefined),
        previousSceneDescription: scenes[sceneIndex - 1]?.sceneDescription,
      });
      effectiveDescription = enhanced.description;
      console.log(`[Clip] Director's note integrated: "${directorNote}" → ${effectiveDescription.length} chars`);
    } catch (enhErr) {
      console.warn("[Clip] Scene enhancement failed, using directorNote as fallback:", enhErr);
      // Fallback: keep directorNote in prompt directly
    }
  }

  // Build O3 prompt
  const { buildO3Prompt } = await import("@/lib/studio/kling-prompts");
  const prompt = buildO3Prompt({
    sceneDescription: effectiveDescription,
    camera: cameraOverride || scene.camera,
    cameraMotion: scene.cameraMotion,
    emotion: scene.emotion,
    characterName: character?.name,
    characterDescription: (character as any)?.description || (character?.actor as any)?.description,
    outfit: costumeOverride?.description || (character?.actor as any)?.outfit,
    traits: (character?.actor as any)?.traits,
    location: scene.location || (sequence.location as string | undefined),
    mood: scene.mood || (sequence.atmosphereText as string | undefined),
    prevSceneHint: scenes[sceneIndex - 1]?.sceneDescription,
    clipTransition: scene.clipTransition,
  });

  // Choose start image based on scene type + transition
  // Priority: prevFrame (seamless) > scene-type-appropriate > fallback
  let imageSource: Buffer | undefined;
  if (prevFrame) {
    imageSource = prevFrame; // Seamless/match-cut: always use previous frame
  } else if (isDialog && portraitBuffer) {
    imageSource = portraitBuffer; // Dialog scenes: character portrait
  } else if (!isDialog && landscapeBuffer) {
    imageSource = landscapeBuffer; // Landscape scenes: location image
  } else {
    imageSource = landscapeBuffer || portraitBuffer || characterRefs[0]; // Fallback chain
  }

  // Handle startImageOverride for hard-cut/fade
  if (scene.startImageOverride && (transition === "hard-cut" || transition === "fade-to-black")) {
    if (scene.startImageOverride.type === "portrait" && portraitBuffer) {
      imageSource = portraitBuffer;
    } else if (scene.startImageOverride.type === "custom" && scene.startImageOverride.url) {
      imageSource = await loadBlobBuffer(scene.startImageOverride.url);
    }
    // "location" is already the default (landscapeBuffer)
  }

  if (!imageSource) throw new Error(`Szene ${sceneIndex}: Kein Bild verfuegbar`);

  // Dialog clip duration: smart buffer based on what comes NEXT
  // - If next scene is also dialog (character interrupts) → minimal buffer (0.5s)
  // - If next scene is landscape/transition or last scene → full buffer (1.5s)
  let durSec: number;
  if (durationOverride) {
    durSec = durationOverride;
  } else if (isDialog) {
    const dialogDur = (scene.audioEndMs - scene.audioStartMs) / 1000;
    const nextScene = scenes[sceneIndex + 1];
    const nextIsDialog = nextScene?.type === "dialog" && nextScene?.spokenText;
    const buffer = nextIsDialog ? 0.5 : 1.5;
    durSec = Math.max(4, Math.ceil(dialogDur + buffer));
  } else {
    durSec = scene.durationHint || 5;
  }

  await updateProgress(`Clip Szene ${sceneIndex + 1}: Generiere Video...`, 30);

  // Generate video with O3 (with fallback chain)
  const { klingO3, klingI2V, extractLastFrame } = await import("@/lib/fal");
  let videoUrl = "";
  let usedProvider = "kling-o3-standard";
  let usedDurSec = Math.ceil(Math.min(15, durSec));

  try {
    videoUrl = await klingO3({
      imageBuffer: imageSource,
      prompt,
      durationSeconds: usedDurSec,
      characterElements: characterRefs.length > 0 ? characterRefs : undefined,
      generateAudio: false,
    });
  } catch (o3Err) {
    console.warn("[Clip] O3 failed, trying I2V Pro:", o3Err);
    await updateProgress(`Clip Szene ${sceneIndex + 1}: Fallback I2V...`, 50);
    usedDurSec = Math.ceil(Math.min(10, durSec));
    try {
      videoUrl = await klingI2V({
        imageBuffer: imageSource,
        prompt,
        durationSeconds: usedDurSec,
        aspectRatio,
        quality: "pro",
        characterElements: characterRefs.length > 0 ? characterRefs : undefined,
        generateAudio: false,
      });
      usedProvider = "kling-i2v-pro";
    } catch {
      videoUrl = await klingI2V({
        imageBuffer: imageSource,
        prompt,
        durationSeconds: usedDurSec,
        aspectRatio,
        quality: "standard",
        generateAudio: false,
      });
      usedProvider = "kling-i2v-standard";
    }
  }

  await updateProgress(`Clip Szene ${sceneIndex + 1}: Speichere...`, 80);

  // Save clip to Blob FIRST (download while URL is fresh)
  const videoRes = await fetch(videoUrl);
  let videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // LIP-SYNC: For dialog scenes with audio, apply Kling LipSync ($0.014/s)
  // This takes the generated video + TTS audio and syncs mouth movements
  if (isDialog && scene.dialogAudioUrl) {
    await updateProgress(`Clip Szene ${sceneIndex + 1}: Lip-Sync...`, 85);
    try {
      const dialogAudioBuffer = await loadBlobBuffer(scene.dialogAudioUrl);
      if (dialogAudioBuffer) {
        const { klingLipSync } = await import("@/lib/fal");
        const lipSyncUrl = await klingLipSync(videoBuffer, dialogAudioBuffer);
        const lipSyncRes = await fetch(lipSyncUrl);
        if (lipSyncRes.ok) {
          videoBuffer = Buffer.from(await lipSyncRes.arrayBuffer());
          usedProvider += "+lipsync";
          console.log(`[Clip] Lip-sync applied for scene ${sceneIndex}`);
        }
      }
    } catch (lsErr) {
      console.warn(`[Clip] Lip-sync failed for scene ${sceneIndex}, using video without sync:`, lsErr instanceof Error ? lsErr.message : lsErr);
      // Non-fatal: video still works, just without lip-sync
    }
  }

  // Extract last frame AFTER downloading (use saved blob URL, not temp fal URL)
  try {
    // Upload video to fal.ai first so extractLastFrame can access it
    const { uploadToFal } = await import("@/lib/fal");
    const uploadedVideoUrl = await uploadToFal(videoBuffer, "clip.mp4", "video/mp4");
    const lastFrame = await extractLastFrame(uploadedVideoUrl);
    const framePath = `studio/${projectId}/sequences/${sequenceId}/frames/frame-${String(sceneIndex).padStart(3, "0")}.png`;
    await put(framePath, lastFrame, { access: "private", contentType: "image/png" });
    console.log(`[Clip] Frame ${sceneIndex} extracted and saved`);
  } catch (err) {
    console.error("[Clip] Frame extraction failed — seamless transitions for next clip will use location image:", err instanceof Error ? err.message : err);
  }
  const timestamp = Date.now();
  const clipPath = `studio/${projectId}/sequences/${sequenceId}/clips/clip-${String(sceneIndex).padStart(3, "0")}-v${timestamp}.mp4`;
  const clipBlob = await put(clipPath, videoBuffer, { access: "private", contentType: "video/mp4" });

  // Cost per second by provider (fal.ai pricing)
  const COST_PER_SEC: Record<string, number> = {
    "kling-o3-standard": 0.084,
    "kling-i2v-pro": 0.168,
    "kling-i2v-standard": 0.028,
  };
  const LIPSYNC_COST_PER_SEC = 0.014;
  const providerName = usedProvider;
  const clipDurSec = hasAudio ? (scene.audioEndMs - scene.audioStartMs) / 1000 : scene.durationHint || 5;
  const actualDurationMs = Math.round(clipDurSec * 1000);
  const baseCost = usedDurSec * (COST_PER_SEC[usedProvider.replace("+lipsync", "")] || 0.084);
  const lipSyncCost = usedProvider.includes("+lipsync") ? usedDurSec * LIPSYNC_COST_PER_SEC : 0;
  const estimatedCost = baseCost + lipSyncCost;

  // Save as Asset
  try {
    const { createAsset } = await import("@/lib/assets");
    await createAsset({
      type: "clip",
      category: `scene:${sceneIndex}`,
      buffer: videoBuffer,
      filename: `clip-${String(sceneIndex).padStart(3, "0")}-v${timestamp}.mp4`,
      mimeType: "video/mp4",
      durationSec: clipDurSec,
      generatedBy: { model: providerName, prompt },
      modelId: providerName,
      costCents: Math.round(estimatedCost * 100),
      projectId,
      userId,
    });
  } catch (assetErr) {
    console.warn("[Clip] Asset save failed:", assetErr);
  }

  // Update scene in DB with version history
  const newVersion = {
    videoUrl: clipBlob.url,
    provider: providerName,
    quality,
    cost: estimatedCost,
    durationSec: clipDurSec,
    createdAt: new Date().toISOString(),
    directorNote: directorNote || undefined,
    cameraOverride: cameraOverride || undefined,
  };

  const updatedScenes = scenes.map((s, i) => {
    if (i !== sceneIndex) return s;
    const existingVersions = s.versions || [];
    if (s.videoUrl && existingVersions.length === 0) {
      existingVersions.push({
        videoUrl: s.videoUrl,
        provider: "unknown",
        quality: s.quality || "standard",
        cost: 0,
        durationSec: clipDurSec,
        createdAt: new Date().toISOString(),
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

  await updateProgress("Clip fertig", 100);
  return {
    videoUrl: clipBlob.url,
    sceneIndex,
    quality,
    prompt,
    costCents: Math.round(estimatedCost * 100),
  };
}

async function processAudioTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, sequenceId } = input as { projectId: string; sequenceId: string };

  await updateProgress("Generiere Audio...", 20);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://koalatree.io";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/sequences/${sequenceId}/audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-studio-task-user": userId, "x-cron-secret": process.env.CRON_SECRET || "",
    },
    body: JSON.stringify({ force: true }),
  });

  // Audio uses SSE — read the stream to completion
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Kein Stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.progress) await updateProgress(data.progress, undefined);
          if (data.done) {
            if (data.error) throw new Error(data.error);
            result = data;
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
    }

    return result;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Audio-Generierung fehlgeschlagen");
  return data;
}

async function processPortraitTask(
  input: Record<string, unknown>,
  _userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { actorId, description, style } = input as { actorId: string; description: string; style?: string };

  await updateProgress("Generiere Portrait...", 30);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://koalatree.io";
  const res = await fetch(`${baseUrl}/api/studio/actors/portrait`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": _userId },
    body: JSON.stringify({ actorId, description, style }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Portrait-Generierung fehlgeschlagen");

  await updateProgress("Portrait fertig", 100);
  return data;
}

async function processLandscapeTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, sequenceId, description, style } = input as {
    projectId: string;
    sequenceId: string;
    description: string;
    style?: string;
  };

  await updateProgress("Generiere Landscape...", 30);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://koalatree.io";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/sequences/${sequenceId}/landscape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ description, style }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Landscape-Generierung fehlgeschlagen");

  await updateProgress("Landscape fertig", 100);
  return data;
}

async function processCharacterSheetTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { actorId, angle, description, style } = input as {
    actorId: string;
    angle: string;
    description: string;
    style?: string;
  };

  await updateProgress(`Character Sheet (${angle})...`, 30);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://koalatree.io";
  const res = await fetch(`${baseUrl}/api/studio/actors/character-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ actorId, angle, description, style }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Character Sheet fehlgeschlagen");

  await updateProgress("Character Sheet fertig", 100);
  return data;
}

async function processStoryTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, brief } = input as { projectId?: string; brief: Record<string, unknown> };

  await updateProgress("Generiere Geschichte...", 20);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://koalatree.io";
  const res = await fetch(`${baseUrl}/api/studio/generate-story`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ brief, projectId }),
  });

  // SSE stream
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Kein Stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.progress) await updateProgress(data.progress);
          if (data.done) {
            if (data.error) throw new Error(data.error);
            result = data;
          }
        } catch (e) { console.warn("[Cron]", e); }
      }
    }
    return result;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Story-Generierung fehlgeschlagen");
  return data;
}

async function processScreenplayTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, directingStyle, atmosphere, atmospherePreset, mode, force } = input as {
    projectId: string;
    directingStyle?: string;
    atmosphere?: string;
    atmospherePreset?: string;
    mode?: string;
    force?: boolean;
  };

  await updateProgress("Generiere Drehbuch...", 20);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://koalatree.io";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/screenplay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ directingStyle, atmosphere, atmospherePreset, mode, force: force ?? true }),
  });

  // SSE stream
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Kein Stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.progress) await updateProgress(data.progress);
          if (data.done) {
            if (data.error) throw new Error(data.error);
            result = data;
          }
        } catch (e) { console.warn("[Cron]", e); }
      }
    }
    return result;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Drehbuch-Generierung fehlgeschlagen");
  return data;
}

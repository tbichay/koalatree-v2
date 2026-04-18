/**
 * Studio Task Queue Processor — Cron job that runs every minute
 *
 * Picks the next pending task and executes it.
 * Handles: clip, audio, story, screenplay, portrait, landscape, character-sheet, assemble
 */

import { prisma } from "@/lib/db";

export const maxDuration = 800;

// ── Clip-Provider Default ────────────────────────────────────────
//
// Wan 2.7 wurde 2026-04-17 nach bestandenem Spike zum Default. Details:
// docs/clip-provider-requirements.md, Abschnitt "Wan 2.7 Spike — PASSED".
//
// Override-Pfade:
//   - Pro Task: `input.provider` ("wan-2.7" | "seedance" | "kling")
//   - Global:   Env-Var CLIP_PROVIDER_DEFAULT (nur fuer Not-Revert ohne Redeploy)
//
// Wan-Fallback: wenn Wan bei einem Clip fehlschlaegt, faellt der Code
// automatisch auf den alten Seedance (Dialog) bzw. Kling-O3 (silent) Pfad
// zurueck. Der Fallback ist im `usedProvider`-String sichtbar
// ("wan-fallback-seedance" / "wan-fallback-kling-o3") damit chronische
// Wan-Probleme per DB-Query aufgespuert werden koennen.
const CLIP_PROVIDER_DEFAULT = (process.env.CLIP_PROVIDER_DEFAULT || "wan-2.7") as
  "wan-2.7" | "seedance" | "kling";

// STRICT-Mode: wenn true, werfen Wan-Fehler den Task hart durch statt
// auf Seedance/Kling-O3 zurueckzufallen. Default: true (Entwicklung) —
// wir WOLLEN Wan-Fehler laut sehen, bevor sie von Legacy-Fallbacks
// verdeckt werden. In Prod bei Bedarf per Env auf "false" setzen, sobald
// Wan stabil laeuft und Fallbacks als Safety-Net gewuenscht sind.
const CLIP_PROVIDER_STRICT = (process.env.CLIP_PROVIDER_STRICT || "true") === "true";

// Dialog-Location-Context (Flux Kontext Pro Pre-Step):
// Vor dem Wan-I2V-Dialog einen Flux-Kontext-Call der das Portrait in den
// Szenen-Hintergrund "rebaked" (Close-Up des Characters in Location statt
// Studio-Hintergrund vom Portrait). Der Character bleibt identisch (Flux
// Kontext Pro ist fuer Identity-Preservation gebaut), nur der Hintergrund
// passt zur Szene. Kostet +$0.04 pro Dialog-Clip (one-time, nicht per-Sek).
//
// Default: true (aktiviert). Wenn Flux den Character zu stark drifted oder
// den Stil kippt (z.B. 3D-Cartoon → fotorealistisch), per Env auf "false"
// setzen — dann faellt der Code zurueck auf reinen Portrait-Anchor.
const DIALOG_LOCATION_CONTEXT = (process.env.DIALOG_LOCATION_CONTEXT || "true") === "true";

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

  // Auto-Transition-Inference (2026-04-18):
  // Wenn clipTransition nicht explizit gesetzt ist, inferieren wir basierend
  // auf Charakter-Wechsel zum Vorgaenger:
  //   - Vorgaenger hat anderen characterId (= Speaker-Change) → "hard-cut"
  //     Grund: Wan 2.7 I2V + audio_url ist Single-Mouth-Lip-Sync. Zwei
  //     Charaktere im selben Clip fuehren zu chaotischem Mund-Gezappel.
  //     Reverse-Shot-Cut (Film-Standard) ist die saubere Loesung.
  //   - Vorgaenger ist Dialog und aktuelle Szene ist Landscape (oder umgekehrt)
  //     → auch "hard-cut" (neue Anchor-Szene, keine Pixel-Kette)
  //   - Sonst → "seamless" (Default, wie bisher)
  // User-Override gewinnt immer — nur undefined triggert Auto-Inference.
  function inferTransition(): "seamless" | "hard-cut" | "fade-to-black" | "match-cut" {
    if (scene.clipTransition) return scene.clipTransition;
    if (sceneIndex === 0) return "seamless"; // No prev → no decision
    const prevScene = scenes[sceneIndex - 1];
    if (!prevScene) return "seamless";
    const prevSpeaker = prevScene.characterId;
    const currSpeaker = scene.characterId;
    // Speaker-Change bei Dialog-Szenen → hard-cut
    if (prevScene.type === "dialog" && scene.type === "dialog"
        && prevSpeaker && currSpeaker && prevSpeaker !== currSpeaker) {
      return "hard-cut";
    }
    // Typ-Wechsel dialog↔landscape → hard-cut (neue visuelle Anker-Szene)
    if (prevScene.type !== scene.type && (prevScene.type === "dialog" || scene.type === "dialog")) {
      return "hard-cut";
    }
    return "seamless";
  }
  const transition = inferTransition();
  if (!scene.clipTransition && transition !== "seamless") {
    const prevScene = scenes[sceneIndex - 1];
    console.log(
      `[Clip] Scene ${sceneIndex}: auto-inferred transition=${transition} ` +
      `(prev=${prevScene?.type}/${prevScene?.characterId?.slice(-6) || "—"} → ` +
      `curr=${scene.type}/${scene.characterId?.slice(-6) || "—"})`,
    );
  }
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

  // Determine clip-provider for THIS task — task input wins over global default
  const clipProvider = (provider as "wan-2.7" | "seedance" | "kling" | undefined) || CLIP_PROVIDER_DEFAULT;
  console.log(`[Clip] Scene ${sceneIndex}: provider=${clipProvider} (${provider ? "task-override" : "default"})`);

  // Dialog-Szenen ignorieren prevFrame und ankern auf dem Portrait (siehe
  // imageSource-Selection unten). Damit faellt dann auch der "continuing
  // seamlessly from previous shot" Prompt-Prefix weg — sonst wuerde Wan
  // versuchen zum vorherigen Framing zurueckzumontieren und das Portrait-
  // Anchor-Framing (Close-Up) aufweichen.
  const dialogForcesPortrait = isDialog && !!portraitBuffer;
  const effectiveTransition = dialogForcesPortrait ? undefined : scene.clipTransition;

  // ── Dialog-Location-Context Pre-Step (Flux Kontext Pro) ──────────
  // Problem (2026-04-18 entdeckt): Wan I2V ist single-image-model. Wenn
  // wir das Portrait als Anchor nehmen, uebernimmt Wan auch den Portrait-
  // Hintergrund (Studio/weiss) — passt nicht zur Location (Wald, etc.).
  //
  // Fix: Flux Kontext Pro rebaked das Portrait mit Location-Hintergrund.
  // Flux Kontext ist fuer Identity-Preservation gebaut — derselbe Character
  // in neuem Kontext. Ergebnis: Close-Up in Location. Dann Wan I2V wie
  // gewohnt mit nativer Lip-Sync.
  //
  // Kosten: +$0.04 one-time pro Dialog-Clip. Per Env DIALOG_LOCATION_CONTEXT
  // =false deaktivierbar (Fallback auf reinen Portrait-Anchor).
  //
  // Wan-Ref-to-Video + Audio waere der idealere Weg, aber fal.ai hat audio_url
  // nur am I2V-Endpoint. Siehe docs/clip-provider-requirements.md Pika-Section.
  let dialogContextFrame: Buffer | undefined;
  let dialogContextExtraCost = 0;
  const locationStr = (scene.location as string | undefined) || (sequence.location as string | undefined);
  // Scene-Anchor hat Vorrang: wenn der User ein Setup-Bild approbiert hat,
  // wird es unten (nach Prompt-Build) als imageSource verwendet. Flux-Pre-Step
  // ist dann redundant und nur Kostenrisiko → skippen.
  if (
    dialogForcesPortrait
    && DIALOG_LOCATION_CONTEXT
    && clipProvider === "wan-2.7"
    && !scene.sceneAnchorImageUrl
    && (locationStr || landscapeBuffer)
  ) {
    const moodStr = (scene.mood as string | undefined) || (sequence.atmosphereText as string | undefined);
    const charName = character?.name || "the character";
    const fluxPrompt =
      `Close-up portrait of ${charName} in ${locationStr || "a natural setting matching the scene"}` +
      (moodStr ? `, ${moodStr}` : "") +
      `. Looking directly at the camera, lips and mouth clearly visible, face fully front-facing. ` +
      `Keep the exact same character identity as the reference: same face, same eyes, same fur, same outfit, same style. ` +
      `Cinematic close-up framing from shoulders up, shallow depth of field, ` +
      `location visible but softly out of focus behind the character.`;
    await updateProgress(`Clip Szene ${sceneIndex + 1}: Dialog-Location-Context (Flux)...`, 30);
    try {
      const { fluxKontext, downloadVideo } = await import("@/lib/fal");
      const res = await fluxKontext({
        imageBuffer: portraitBuffer!,
        prompt: fluxPrompt,
        aspectRatio: "9:16",
      });
      const buf = await downloadVideo(res.url); // generic fetch → works for images too
      if (buf && buf.byteLength > 0) {
        dialogContextFrame = buf;
        dialogContextExtraCost = 0.04;
        console.log(
          `[Clip] Scene ${sceneIndex}: Dialog-Context frame ready ` +
          `(${buf.byteLength}B via Flux Kontext, +$0.04). Location="${locationStr || "n/a"}"`,
        );
      }
    } catch (fluxErr) {
      console.warn(
        `[Clip] Scene ${sceneIndex}: Flux Kontext pre-step failed, falling back to raw portrait:`,
        fluxErr instanceof Error ? fluxErr.message : fluxErr,
      );
      // dialogContextFrame stays undefined → imageSource uses portraitBuffer
    }
  }

  // Build prompts for BOTH paths — same input, different output syntax.
  // Wan-Path uses buildWanPrompt (no @Image/@Audio refs, Variant-G-aware
  // landscape anchor). O3/Seedance-Path still uses buildO3Prompt.
  const { buildO3Prompt, buildWanPrompt, wanNegativePromptFor } = await import("@/lib/studio/kling-prompts");
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
    clipTransition: effectiveTransition,
    isDialog,
  });

  // Wan prompt — separate file, no Ref-Syntax. Landscape scenes mit
  // landscapeBuffer aber OHNE prevFrame sind "Variant G": das Location-Bild
  // wird zum image_url-Anker, und der Prompt kriegt den "preserve composition"-
  // Prefix. Wenn prevFrame gesetzt ist, ist das KEINE Landscape-from-image
  // mehr (dann uebernimmt der prevFrame die Anker-Rolle), egal welcher Szene-Typ.
  //
  // WICHTIG (2026-04-18): wenn ein Character im Scene gesetzt UND Character-
  // Refs geladen sind, ist das KEIN Landscape-from-image mehr — auch wenn
  // scene.type === "landscape". Diese Szenen gehen durch den Ref-to-Video-
  // Pfad mit Multi-Ref (Character-Sheet + prevFrame/location), damit die
  // Identity konsistent bleibt. Reine Landscapes (ohne Character) bleiben
  // bei I2V mit Variant-G-Pattern.
  const hasCharacterSheet = !!character && characterRefs.length > 0;
  const isLandscapeFromImage =
    !isDialog
    && !prevFrame
    && !!landscapeBuffer
    && !hasCharacterSheet;
  const wanPrompt = buildWanPrompt({
    sceneDescription: effectiveDescription,
    camera: cameraOverride || scene.camera,
    cameraMotion: scene.cameraMotion,
    emotion: scene.emotion,
    characterName: isLandscapeFromImage ? undefined : character?.name,
    characterDescription: (character as any)?.description || (character?.actor as any)?.description,
    outfit: costumeOverride?.description || (character?.actor as any)?.outfit,
    traits: (character?.actor as any)?.traits,
    location: scene.location || (sequence.location as string | undefined),
    mood: scene.mood || (sequence.atmosphereText as string | undefined),
    prevSceneHint: scenes[sceneIndex - 1]?.sceneDescription,
    clipTransition: effectiveTransition,
    isDialog,
    isLandscapeFromImage,
  });

  // Choose start image based on scene type + transition
  //
  // Dialog-Szenen ankern IMMER auf dem kanonischen Portrait — nie auf
  // einem prevFrame. Begruendung (2026-04-18, nach Prod-Run-Analyse):
  // - Wan 2.7 I2V ist ein Single-Image-Model. Bei seamless-chain sieht es
  //   als Identity-Referenz nur den prevFrame, keinen Character-Sheet.
  // - Wenn ein vorausgehender Landscape-Clip den Character bereits
  //   "erfunden" hat (weil Landscape-Prompt keinen Character-Pixel-Anchor
  //   hat), uebernimmt der Dialog-Clip den driftet Character + versucht
  //   Lip-Sync darauf → doppelt drift.
  // - Portrait als Anchor gibt Wan einen sauberen Front-Shot mit klarem
  //   Mund fuer die Audio-Sync. Visuelle Pixel-Continuity bei Dialog ist
  //   narrativ eh sekundaer (Dialoge starten meistens mit cut-to-close).
  //
  // Der Tradeoff: Landscape-Landscape seamless bleibt pixel-perfect.
  // Nur Dialog-Szenen brechen die Pixel-Kette zugunsten der Identity.
  let imageSource: Buffer | undefined;
  if (dialogForcesPortrait) {
    // Dialog: Flux-Kontext-Frame bevorzugt (location-passender Hintergrund),
    // sonst raw Portrait (Fallback wenn Flux fehlgeschlagen oder Flag off).
    imageSource = dialogContextFrame || portraitBuffer;
  } else if (prevFrame) {
    imageSource = prevFrame; // Non-dialog seamless/match-cut
  } else if (!isDialog && landscapeBuffer) {
    imageSource = landscapeBuffer; // Landscape fresh
  } else {
    imageSource = landscapeBuffer || portraitBuffer || characterRefs[0]; // Fallback
  }
  if (dialogForcesPortrait && prevFrame) {
    console.log(
      `[Clip] Scene ${sceneIndex}: Dialog — overriding prevFrame with ` +
      `${dialogContextFrame ? "Flux-context frame" : "portrait anchor"} for character identity + lip-sync quality`,
    );
  }

  // ── Scene-Anchor-Image Override (Pre-Production-Setup) ──────────
  // Wenn der User ein Setup-Bild pro Szene approbiert hat (via UI-Panel
  // "Setup-Bild" in /studio/engine), nimmt es Vorrang vor allen Heuristiken:
  //   - Dialog-Portrait-Anchor (wird nicht mehr gebraucht)
  //   - Flux-Kontext-Pre-Step (wird nicht mehr gebraucht)
  //   - prevFrame-Chaining (Dialog) / Landscape-Fresh
  // Grund: Das Anchor-Bild ist vom User bereits visuell validiert und enthaelt
  // Charakter + Location korrekt komponiert. Der Clip-Cron wird dadurch
  // deterministisch — gleicher Input → gleicher Output.
  // Generiert via Nano Banana Pro Edit ($0.15/img), siehe
  // app/api/studio/projects/.../scene-anchor/route.ts.
  let usedSceneAnchor = false;
  if (scene.sceneAnchorImageUrl) {
    const anchorBuf = await loadBlobBuffer(scene.sceneAnchorImageUrl);
    if (anchorBuf) {
      imageSource = anchorBuf;
      usedSceneAnchor = true;
      console.log(
        `[Clip] Scene ${sceneIndex}: using approved scene-anchor image ` +
        `(${anchorBuf.byteLength}B) — overriding heuristic imageSource`,
      );
    } else {
      console.warn(
        `[Clip] Scene ${sceneIndex}: sceneAnchorImageUrl set but blob load failed — ` +
        `falling back to heuristic imageSource (${scene.sceneAnchorImageUrl})`,
      );
    }
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

  // Provider selection:
  //   - Default: Wan 2.7 I2V (seit 2026-04-17 nach Spike-PASS)
  //       * Dialog → Wan + audio_url (native LipSync, single-pass)
  //       * Landscape/silent → Wan (optional landscape-image-anchor = Variant G)
  //   - Task-Input `provider` oder Env CLIP_PROVIDER_DEFAULT kann auf Legacy
  //     umschalten: "seedance" (Dialog), "kling" (silent) — nur noch fuer
  //     Revert-Fall. Normal-Fall ist Wan.
  //   - Wenn Wan einen Clip wirft, faellt der Code pro Clip auf Seedance bzw.
  //     Kling-O3 zurueck (siehe Fallback-Block unten). `usedProvider` faengt
  //     das mit "wan-fallback-*"-Praefix ab damit es per DB-Query sichtbar ist.
  //
  // Alter Kommentar (2026-04-17, Pre-Wan-Spike): Kling O3 + klingLipSync war
  // der frueher-frueher-Pfad, verworfen wegen face_detection_error auf Cartoons.
  // Kommentar-Block als Reference-History in git-history, nicht mehr inline.
  const { klingO3, klingI2V, seedance2RefToVideo, wan27I2V, wan27RefToVideo, extractLastFrame } = await import("@/lib/fal");
  let videoUrl = "";
  let usedProvider: string;
  let usedDurSec = Math.ceil(Math.min(15, durSec));

  // ── WAN-DIALOG-Pfad ────────────────────────────────────────────
  // Voraussetzung: clipProvider === "wan-2.7" && Dialog-Scene && audio da.
  // Fallback auf Seedance bei Wan-Fehler (Audio > 15MB, fal-API down, etc.).
  if (isDialog && scene.dialogAudioUrl && clipProvider === "wan-2.7") {
    await updateProgress(`Clip Szene ${sceneIndex + 1}: Wan 2.7 Dialog...`, 35);

    const dialogAudioBuffer = await loadBlobBuffer(scene.dialogAudioUrl);
    if (!dialogAudioBuffer) {
      throw new Error(
        `Szene ${sceneIndex + 1}: Dialog-Audio konnte nicht geladen werden ` +
        `(${scene.dialogAudioUrl}). Ohne Audio kein Lip-Sync — bitte Audio neu generieren.`,
      );
    }

    const wanDurSec = Math.min(15, Math.max(2, usedDurSec));
    const anchorTag = usedSceneAnchor
      ? "anchor (pre-production)"
      : prevFrame ? "seamless (prevFrame)" : "fresh (portrait)";
    console.log(
      `[Clip] Wan 2.7 dialog scene ${sceneIndex}: ` +
      `image=${imageSource.byteLength}B, audio=${dialogAudioBuffer.byteLength}B, ${wanDurSec}s, ` +
      `${anchorTag}`,
    );

    try {
      const r = await wan27I2V({
        imageBuffer: imageSource,
        prompt: wanPrompt,
        audioBuffer: dialogAudioBuffer,
        durationSeconds: wanDurSec,
        // Dialog IMMER in 1080p — Wan ist $0.10/s flat, kein Aufpreis,
        // und mehr Pixel = bessere Mund-/Lip-Sync-Detail (siehe
        // Prod-Test 2026-04-18: 720p zu grob fuer Koala-Lip-Sync).
        resolution: "1080p",
        negativePrompt: wanNegativePromptFor("dialog"),
        // Prompt-Expansion ausschalten: fal.ai rewrited sonst den Prompt
        // und verduennt unsere expliziten Mouth-Sync-Cues. Bei Dialog
        // wollen wir EXAKT die Formulierung aus buildWanPrompt senden.
        enablePromptExpansion: false,
      });
      videoUrl = r.url;
      // Provider-Tag: Anchor (approved Pre-Production-Bild) > Flux-Kontext (Legacy-Fallback) > seamless/audio.
      const baseProvider = usedSceneAnchor
        ? "wan-2.7-i2v+anchor"
        : prevFrame ? "wan-2.7-i2v+seamless" : "wan-2.7-i2v+audio";
      usedProvider = !usedSceneAnchor && dialogContextFrame
        ? `${baseProvider}+flux-context`
        : baseProvider;
      usedDurSec = wanDurSec;
    } catch (wanErr) {
      // Wan-Fehler → in STRICT-Mode hart werfen, sonst chirurgischer
      // Fallback auf Seedance. Loggt laut, damit wir Muster erkennen
      // ("jeder Clip >8s wirft bei Wan").
      const msg = wanErr instanceof Error ? wanErr.message : String(wanErr);
      if (CLIP_PROVIDER_STRICT) {
        console.error(`[Clip] Wan 2.7 dialog failed for scene ${sceneIndex} (STRICT — no fallback):`, msg);
        throw new Error(
          `Szene ${sceneIndex + 1}: Wan 2.7 Dialog-Generation fehlgeschlagen ` +
          `(STRICT-Mode aktiv, CLIP_PROVIDER_STRICT=true — kein Fallback). ` +
          `Original-Fehler: ${msg}`,
        );
      }
      console.warn(`[Clip] Wan 2.7 dialog failed for scene ${sceneIndex}, falling back to Seedance:`, msg);
      await updateProgress(`Clip Szene ${sceneIndex + 1}: Fallback Seedance...`, 45);

      // Seedance-Fallback — exakt derselbe Code wie der Legacy-Pfad unten,
      // nur mit usedProvider-Praefix "wan-fallback-" fuer Tracking.
      const imageRefs: Buffer[] = [];
      if (portraitBuffer) imageRefs.push(portraitBuffer);
      for (const ref of characterRefs) {
        if (ref !== portraitBuffer && imageRefs.length < 9) imageRefs.push(ref);
      }
      if (imageRefs.length === 0) {
        throw new Error(
          `Szene ${sceneIndex + 1}: Wan 2.7 fehlgeschlagen UND keine Character-Refs fuer Seedance-Fallback. ` +
          `Original-Wan-Fehler: ${msg}`,
        );
      }
      const charName = character?.name || "the character";
      const consistencyRefs = imageRefs.length > 1
        ? ` Reference ${Array.from({ length: imageRefs.length - 1 }, (_, i) => `@Image${i + 2}`).join(" / ")} for consistency.`
        : "";
      const seedancePrompt =
        `Character @Image1 (${charName}).${consistencyRefs} ` +
        `${charName} speaking with lip-sync to @Audio1. ${prompt}`;
      const dialogDurSec = Math.min(15, Math.max(4, usedDurSec));

      videoUrl = await seedance2RefToVideo({
        prompt: seedancePrompt,
        imageBuffers: imageRefs,
        audioBuffers: [dialogAudioBuffer],
        duration: dialogDurSec,
        aspectRatio: "9:16",
        resolution: "720p",
        generateAudio: true,
      });
      usedProvider = "wan-fallback-seedance";
      usedDurSec = dialogDurSec;
    }
  } else if (isDialog && scene.dialogAudioUrl) {
    // ── LEGACY DIALOG PATH: Seedance 2.0 (wenn clipProvider !== "wan-2.7") ──
    await updateProgress(`Clip Szene ${sceneIndex + 1}: Seedance Dialog...`, 35);

    // Preload dialog audio — fail early if the blob is unreachable
    const dialogAudioBuffer = await loadBlobBuffer(scene.dialogAudioUrl);
    if (!dialogAudioBuffer) {
      throw new Error(
        `Szene ${sceneIndex + 1}: Dialog-Audio konnte nicht geladen werden ` +
        `(${scene.dialogAudioUrl}). Ohne Audio kein Lip-Sync — bitte Audio neu generieren.`,
      );
    }

    // Build image ref list: portrait as @Image1 (main identity anchor),
    // then character sheet angles (front/profile/fullBody) for consistency.
    // Max 9 per Seedance API; de-dup to avoid uploading the same buffer twice.
    const imageRefs: Buffer[] = [];
    if (portraitBuffer) imageRefs.push(portraitBuffer);
    for (const ref of characterRefs) {
      if (ref !== portraitBuffer && imageRefs.length < 9) imageRefs.push(ref);
    }
    if (imageRefs.length === 0) {
      throw new Error(
        `Szene ${sceneIndex + 1}: Keine Character-Referenzbilder verfuegbar. ` +
        `Stelle sicher, dass der Charakter ein Portrait oder Character Sheet hat.`,
      );
    }

    // Build Seedance prompt using the EXACT pattern that succeeded in the
    // 2026-04-17 side-by-side test (app/api/studio/test-lipsync-spike/route.ts
    // variant D). Three things have to be explicit or Seedance gets it wrong:
    //   1. @Image1 is the character by name (identity anchor)
    //   2. @Image2..N are declared as "for consistency" so Seedance knows
    //      they're the SAME character — otherwise it treats the character
    //      sheet angles as DIFFERENT characters and picks one at random
    //      (this is what caused the "wrong koala" in an earlier run)
    //   3. @Audio1 must be named in the prompt for lip-sync to trigger.
    //      Just passing audio_urls without mentioning @Audio1 in the prompt
    //      makes Seedance silently ignore it → no audio, no lip-sync.
    const charName = character?.name || "the character";
    const consistencyRefs = imageRefs.length > 1
      ? ` Reference ${Array.from({ length: imageRefs.length - 1 }, (_, i) => `@Image${i + 2}`).join(" / ")} for consistency.`
      : "";
    const seedancePrompt =
      `Character @Image1 (${charName}).${consistencyRefs} ` +
      `${charName} speaking with lip-sync to @Audio1. ${prompt}`;

    const dialogDurSec = Math.min(15, Math.max(4, usedDurSec));
    console.log(
      `[Clip] Seedance 2.0 dialog scene ${sceneIndex}: ` +
      `${imageRefs.length} image refs, audio=${dialogAudioBuffer.byteLength}B, ${dialogDurSec}s`,
    );

    try {
      videoUrl = await seedance2RefToVideo({
        prompt: seedancePrompt,
        imageBuffers: imageRefs,
        audioBuffers: [dialogAudioBuffer],
        duration: dialogDurSec,
        aspectRatio: "9:16",
        resolution: "720p",
        // MUST be true — Seedance 2.0 Ref-to-Video produces native audio track
        // when this flag is on, and the @Audio1 prompt reference drives
        // lip-sync onto that track. With this flag off, audio_urls are
        // silently ignored and the output is a stumm video.
        generateAudio: true,
      });
      usedProvider = "seedance-2.0-ref";
      usedDurSec = dialogDurSec;
    } catch (seedanceErr) {
      const msg = seedanceErr instanceof Error ? seedanceErr.message : String(seedanceErr);
      throw new Error(
        `Szene ${sceneIndex + 1}: Seedance 2.0 Dialog-Generation fehlgeschlagen. ` +
        `Kein Fallback aktiv (Alternativen liefern unbrauchbaren Lip-Sync). ` +
        `Original-Fehler: ${msg}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // REVERT PATH — old Kling O3 + klingLipSync dialog pipeline.
    // Disabled 2026-04-17 after Seedance 2.0 won the side-by-side test.
    // Video quality was great, only lip-sync was broken (face_detection_error
    // on cartoon koala faces). If Seedance breaks:
    //   1. Comment out the try/catch block above
    //   2. Un-comment the block below
    //   3. Add `klingLipSync` to the import near line 546
    // ─────────────────────────────────────────────────────────────────
    // try {
    //   videoUrl = await klingO3({
    //     imageBuffer: imageSource,
    //     prompt,
    //     durationSeconds: usedDurSec,
    //     characterElements: characterRefs.length > 0 ? characterRefs : undefined,
    //     generateAudio: false,
    //   });
    //   usedProvider = "kling-o3-standard";
    // } catch (o3Err) {
    //   console.warn("[Clip] O3 failed, trying I2V Pro:", o3Err);
    //   await updateProgress(`Clip Szene ${sceneIndex + 1}: Fallback I2V...`, 50);
    //   usedDurSec = Math.ceil(Math.min(10, durSec));
    //   videoUrl = await klingI2V({
    //     imageBuffer: imageSource,
    //     prompt,
    //     durationSeconds: usedDurSec,
    //     aspectRatio,
    //     quality: "pro",
    //     characterElements: characterRefs.length > 0 ? characterRefs : undefined,
    //     generateAudio: false,
    //   });
    //   usedProvider = "kling-i2v-pro";
    // }
    // // Download the Kling video, then post-process with klingLipSync
    // const klingVideoRes = await fetch(videoUrl);
    // let klingVideoBuf = Buffer.from(await klingVideoRes.arrayBuffer());
    // try {
    //   const lipSyncUrl = await klingLipSync(klingVideoBuf, dialogAudioBuffer);
    //   const lipSyncRes = await fetch(lipSyncUrl);
    //   if (lipSyncRes.ok) {
    //     klingVideoBuf = Buffer.from(await lipSyncRes.arrayBuffer());
    //     usedProvider += "+lipsync";
    //     // NOTE: videoBuffer assignment below needs to pick up klingVideoBuf
    //     //       instead of fetching videoUrl again (URL may have expired).
    //     //       This is why the revert isn't a drop-in — requires a small
    //     //       refactor of the download path around line ~648.
    //   }
    // } catch (lsErr) {
    //   console.warn(`[Clip] Lip-sync failed for scene ${sceneIndex}:`, lsErr);
    // }
  } else if (clipProvider === "wan-2.7" && !isDialog && hasCharacterSheet) {
    // ── WAN REF-TO-VIDEO (silent scene MIT Character) ────────────────
    // 2026-04-18: I2V ist ein Single-Image-Model — ohne Character-Anchor
    // erfindet Wan den Character aus dem Text + driftet. Ref-to-Video nimmt
    // bis zu 9 Referenzbilder, ideal fuer: Character-Sheet (Front/Profil/
    // FullBody) als Identity-Lock + prevFrame (Komposition/Lighting) +
    // Location-Foto (wenn kein prevFrame).
    //
    // Tradeoff: KEIN echter Pixel-seamless (RefToVideo hat keinen
    // image_url-Startframe wie I2V). Dafuer Identity konsistent ueber alle
    // Clips, weil jede Szene frisch aufs Sheet anchort. Komposition-
    // Kontinuitaet kommt durch prevFrame-Ref.
    //
    // Duration-Cap bei RefToVideo: [2, 10] statt [2, 15] bei I2V.
    const refImages: Buffer[] = [];
    if (prevFrame) refImages.push(prevFrame);           // composition/lighting ref
    for (const ref of characterRefs) {                    // identity (sheet)
      if (refImages.length < 9 && !refImages.includes(ref)) refImages.push(ref);
    }
    if (!prevFrame && landscapeBuffer && refImages.length < 9) {
      refImages.push(landscapeBuffer);                    // location when no prevFrame
    }

    const wanRefDur = Math.min(10, Math.max(2, usedDurSec));
    console.log(
      `[Clip] Wan 2.7 Ref-to-Video scene ${sceneIndex}: ` +
      `${refImages.length} refs (prev=${!!prevFrame}, sheet=${characterRefs.length}, ` +
      `loc=${!prevFrame && !!landscapeBuffer}), ${wanRefDur}s`,
    );

    try {
      const r = await wan27RefToVideo({
        prompt: wanPrompt,
        referenceImageBuffers: refImages,
        aspectRatio: "9:16",
        durationSeconds: wanRefDur,
        resolution: "1080p", // Wan flat-rate → mehr Detail kostenfrei
        negativePrompt: wanNegativePromptFor(scene.type),
      });
      videoUrl = r.url;
      usedProvider = prevFrame
        ? "wan-2.7-ref+character+prev"
        : "wan-2.7-ref+character";
      usedDurSec = wanRefDur;
    } catch (wanErr) {
      const msg = wanErr instanceof Error ? wanErr.message : String(wanErr);
      if (CLIP_PROVIDER_STRICT) {
        console.error(`[Clip] Wan Ref-to-Video failed for scene ${sceneIndex} (STRICT — no fallback):`, msg);
        throw new Error(
          `Szene ${sceneIndex + 1}: Wan 2.7 Ref-to-Video (landscape+character) fehlgeschlagen ` +
          `(STRICT-Mode aktiv, CLIP_PROVIDER_STRICT=true — kein Fallback). ` +
          `Original-Fehler: ${msg}`,
        );
      }
      console.warn(`[Clip] Wan Ref-to-Video failed for scene ${sceneIndex}, falling back to Kling-O3:`, msg);
      await updateProgress(`Clip Szene ${sceneIndex + 1}: Fallback Kling-O3...`, 45);
      usedDurSec = Math.ceil(Math.min(15, durSec));

      try {
        videoUrl = await klingO3({
          imageBuffer: imageSource,
          prompt,
          durationSeconds: usedDurSec,
          characterElements: characterRefs.length > 0 ? characterRefs : undefined,
          generateAudio: false,
        });
        usedProvider = "wan-fallback-kling-o3";
      } catch (o3Err) {
        console.warn("[Clip] Kling-O3 also failed, trying I2V Pro:", o3Err);
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
          usedProvider = "wan-fallback-kling-i2v-pro";
        } catch {
          videoUrl = await klingI2V({
            imageBuffer: imageSource,
            prompt,
            durationSeconds: usedDurSec,
            aspectRatio,
            quality: "standard",
            generateAudio: false,
          });
          usedProvider = "wan-fallback-kling-i2v-standard";
        }
      }
    }
  } else if (clipProvider === "wan-2.7") {
    // ── WAN I2V LANDSCAPE/SILENT (kein Character) ─────────────────────
    // Nutzt wan27I2V OHNE audio_url. imageSource ist der Start-Anker:
    //   - prevFrame → seamless chain (letzter Frame vom Vorgaenger-Clip)
    //   - landscapeBuffer → Variant-G-Anker (Location-Foto als image_url)
    // Nur reine Landscape-/Environment-Szenen OHNE Character. Szenen mit
    // Character gehen durch den Ref-to-Video-Branch oben.
    const wanDurSec = Math.min(15, Math.max(2, usedDurSec));
    const wanLabel = prevFrame
      ? "seamless"
      : isLandscapeFromImage
        ? "landscape-anchor"
        : (scene.type || "landscape");
    console.log(
      `[Clip] Wan 2.7 silent scene ${sceneIndex}: ` +
      `image=${imageSource.byteLength}B, ${wanDurSec}s, ${wanLabel}`,
    );

    try {
      const r = await wan27I2V({
        imageBuffer: imageSource,
        prompt: wanPrompt,
        durationSeconds: wanDurSec,
        resolution: quality === "premium" ? "1080p" : "720p",
        negativePrompt: wanNegativePromptFor(scene.type),
      });
      videoUrl = r.url;
      usedProvider = prevFrame
        ? "wan-2.7-i2v+seamless"
        : isLandscapeFromImage
          ? "wan-2.7-i2v (landscape-anchor)"
          : `wan-2.7-i2v (${scene.type || "landscape"})`;
      usedDurSec = wanDurSec;
    } catch (wanErr) {
      // Wan-Fehler → in STRICT-Mode hart werfen, sonst Kling-O3-Fallback-
      // Kette. "wan-fallback-*" Praefix in usedProvider macht es per
      // DB-Query auffindbar.
      const msg = wanErr instanceof Error ? wanErr.message : String(wanErr);
      if (CLIP_PROVIDER_STRICT) {
        console.error(`[Clip] Wan 2.7 silent failed for scene ${sceneIndex} (STRICT — no fallback):`, msg);
        throw new Error(
          `Szene ${sceneIndex + 1}: Wan 2.7 ${scene.type || "silent"}-Generation fehlgeschlagen ` +
          `(STRICT-Mode aktiv, CLIP_PROVIDER_STRICT=true — kein Fallback). ` +
          `Original-Fehler: ${msg}`,
        );
      }
      console.warn(`[Clip] Wan 2.7 silent failed for scene ${sceneIndex}, falling back to Kling-O3:`, msg);
      await updateProgress(`Clip Szene ${sceneIndex + 1}: Fallback Kling-O3...`, 45);
      usedDurSec = Math.ceil(Math.min(15, durSec));

      try {
        videoUrl = await klingO3({
          imageBuffer: imageSource,
          prompt,
          durationSeconds: usedDurSec,
          characterElements: characterRefs.length > 0 ? characterRefs : undefined,
          generateAudio: false,
        });
        usedProvider = "wan-fallback-kling-o3";
      } catch (o3Err) {
        console.warn("[Clip] Kling-O3 also failed, trying I2V Pro:", o3Err);
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
          usedProvider = "wan-fallback-kling-i2v-pro";
        } catch {
          videoUrl = await klingI2V({
            imageBuffer: imageSource,
            prompt,
            durationSeconds: usedDurSec,
            aspectRatio,
            quality: "standard",
            generateAudio: false,
          });
          usedProvider = "wan-fallback-kling-i2v-standard";
        }
      }
    }
  } else {
    // ── LEGACY LANDSCAPE / TRANSITION PATH: Kling O3 with I2V fallback ──
    // (wird nur erreicht, wenn clipProvider === "seedance" | "kling")
    usedProvider = "kling-o3-standard";
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
  }

  await updateProgress(`Clip Szene ${sceneIndex + 1}: Speichere...`, 80);

  // Save clip to Blob FIRST (download while URL is fresh)
  const videoRes = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // NOTE: No separate lip-sync post-processing step —
  // Seedance 2.0 produces lip-synced video natively for dialog scenes.

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

  // Cost per second by provider (fal.ai pricing, ~as of 2026-04)
  const COST_PER_SEC: Record<string, number> = {
    "kling-o3-standard": 0.084,
    "kling-i2v-pro": 0.168,
    "kling-i2v-standard": 0.028,
    "kling-avatar-standard": 0.056,
    "kling-avatar-pro": 0.115,
    "seedance-2.0-ref": 0.102, // measured 2026-04-17: $0.51 for 5s clip → ~$0.102/s
    // Wan 2.7 — Default-Provider seit 2026-04-17, $0.10/s flat
    "wan-2.7-i2v+audio": 0.10,
    "wan-2.7-i2v+seamless": 0.10,
    "wan-2.7-i2v (landscape)": 0.10,
    "wan-2.7-i2v (landscape-anchor)": 0.10, // image_url = landscape photo (Variant G)
    "wan-2.7-i2v (transition)": 0.10,
    "wan-2.7-i2v (intro)": 0.10,
    "wan-2.7-i2v (outro)": 0.10,
    // Ref-to-Video: silent scenes MIT Character-Sheet (Identity-Lock)
    "wan-2.7-ref+character": 0.10,
    "wan-2.7-ref+character+prev": 0.10,
    // Dialog + Flux-Kontext-Pre-Step (location-passender Hintergrund)
    // Per-Sekunde weiterhin $0.10/s Wan — die $0.04 Flux-Einmalkosten
    // werden ueber dialogContextExtraCost additiv auf estimatedCost draufaddiert.
    "wan-2.7-i2v+audio+flux-context": 0.10,
    "wan-2.7-i2v+seamless+flux-context": 0.10,
    // Scene-Anchor (Pre-Production Setup-Image via Nano Banana Pro, $0.15 einmalig
    // beim Approve-Flow — wird NICHT per Clip nochmal verrechnet). Clip-Cron
    // zahlt nur die Wan-Runtime, daher identisch zu +audio / +seamless.
    "wan-2.7-i2v+anchor": 0.10,
    // Fallback-Pfade — identischer Preis wie der fallbackete Provider,
    // Key-Unterscheidung nur fuer DB-Query-Debugging
    "wan-fallback-seedance": 0.102,
    "wan-fallback-kling-o3": 0.084,
    "wan-fallback-kling-i2v-pro": 0.168,
    "wan-fallback-kling-i2v-standard": 0.028,
  };
  const providerName = usedProvider;
  const clipDurSec = hasAudio ? (scene.audioEndMs - scene.audioStartMs) / 1000 : scene.durationHint || 5;
  const actualDurationMs = Math.round(clipDurSec * 1000);
  // Per-Sekunde-Kosten vom Hauptprovider + einmalige Extras (z.B. Flux
  // Kontext Pro Pre-Step bei Dialog, $0.04 one-time wenn dialogContextFrame
  // verwendet wurde). Extras sind nicht mehrdimensional — einfach additiv.
  const estimatedCost = usedDurSec * (COST_PER_SEC[usedProvider] || 0.084) + dialogContextExtraCost;

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

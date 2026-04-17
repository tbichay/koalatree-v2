/**
 * Wan 2.7 Spike — PRESET MODE (no existing scene required).
 *
 * Single-provider test: runs Wan 2.7 through hardcoded test scripts for each
 * variant defined in /docs/clip-provider-requirements.md. User only picks a
 * character — prompt + dialog text are baked in here.
 *
 * Audio is generated fresh via ElevenLabs on each run using the character's
 * voiceId/voiceSettings (from castSnapshot, falling back to character direct).
 *
 * Variants:
 *   A — Dialog + Prop + Audio lip-sync   (H3, H3b, H8, W5c, W3)
 *   B — Seamless continuation from A     (H4)  [runs after A]
 *   C — Action / Dance (no audio)        (W3, W5d)
 *   D — Singing / Music setting          (W2 video, H3b)
 *   E — Real portrait (opt-in)           (H1b)
 *   F — Location-Orbit (silent, prompt-only)  (W4, W5b, W5d, H2b prompt-only)
 *   G — Landscape-Animation from location image (H2b pixel-anchored, W4, W5d, W3 nature motion)
 *
 * POST /api/studio/test-wan-spike
 * Body: {
 *   projectId: string,
 *   characterId: string,
 *   variants?: Array<"A"|"B"|"C"|"D"|"E"|"F"|"G">,
 *   realPortraitUrl?: string,           // only for E
 *   locationUrl?: string,               // only for G — existing landscape asset URL
 *   maxCostUsd?: number,                // default 5
 *   resolution?: "720p" | "1080p",      // default 720p
 * }
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import { generateSingleTTS } from "@/lib/elevenlabs";
import type { CharacterVoiceSettings } from "@/lib/types";

export const maxDuration = 800;

type Variant = "A" | "B" | "C" | "D" | "E" | "F" | "G";

interface Preset {
  label: string;
  requirements: string;
  /** If set, we TTS this via ElevenLabs and use as audio for Wan lip-sync. */
  dialogText?: string;
  /** Target clip length. Actual clamped by Wan [2,15]. */
  targetClipSec: number;
  /** Build the Wan prompt given the character's context. */
  buildPrompt: (ctx: {
    characterName: string;
    characterDescription: string;
  }) => string;
  /** Built-in negative prompt for this variant. */
  negativePrompt: string;
}

const PRESETS: Record<Variant, Preset> = {
  A: {
    label: "Dialog + Prop + Audio lip-sync",
    requirements: "H3, H3b, H8, W5c, W3",
    dialogText:
      "Hallo Freund! Schau mal, ich habe eine magische Eichel gefunden, die sanft in meiner Pfote leuchtet.",
    targetClipSec: 9,
    buildPrompt: ({ characterName, characterDescription }) => [
      `${characterName} (${characterDescription})`,
      `is holding a small glowing golden acorn in one paw,`,
      `looking directly at the camera, speaking warmly and happily to the viewer in German.`,
      `Setting: a soft warm forest clearing with dappled sunlight.`,
      `Gentle idle motion, expressive face, natural lip movement synced to the audio.`,
      `Single continuous shot. No text, no subtitles, no captions, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, words, letters, writing, watermark, logo, extra fingers, deformed hands, blurry, static frozen pose, speech bubble",
  },

  B: {
    label: "Seamless continuation from A",
    requirements: "H4",
    // No dialog — pure motion-continuity test
    targetClipSec: 6,
    buildPrompt: ({ characterName, characterDescription }) => [
      `${characterName} (${characterDescription}),`,
      `continuing from the previous shot, slowly turns the head slightly to the right`,
      `and looks off-camera with a thoughtful expression, still holding the same acorn.`,
      `Match the previous shot's lighting, camera framing, clothing, and character pose exactly at the start frame.`,
      `Subtle, continuous motion. Single shot, no cuts. No text, no subtitles, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, watermark, hard cut, scene change, new background, different lighting, different clothing, character swap",
  },

  C: {
    label: "Action / Dance (silent)",
    requirements: "W3, W5d",
    // No dialog — expression/motion test
    targetClipSec: 7,
    buildPrompt: ({ characterName, characterDescription }) => [
      `${characterName} (${characterDescription})`,
      `dances happily, twirling and laughing with pure joy,`,
      `arms raised, full-body rhythmic movement, expressive face with a big open-mouth smile.`,
      `Setting: a sunny forest meadow, bright cheerful lighting.`,
      `Dynamic gentle follow-camera, no cuts. Cinematic quality.`,
      `No text, no subtitles, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, watermark, extra limbs, deformed hands, static frozen pose, sad, crying, standing still",
  },

  D: {
    label: "Singing / Music setting",
    requirements: "W2 (Video), H3b",
    dialogText:
      "La la la, die Sonne scheint so schön heute, die Vögel singen auf dem alten Baum. La la la.",
    targetClipSec: 9,
    buildPrompt: ({ characterName, characterDescription }) => [
      `${characterName} (${characterDescription})`,
      `sings softly into an old-fashioned vintage microphone on a small wooden stage,`,
      `warm amber stage lighting, a cozy cafe in the blurred background with a few patrons,`,
      `eyes half-closed with emotion, expressive singing mouth movements synced to the audio,`,
      `gentle swaying to the rhythm of their own voice.`,
      `Mood: warm, intimate, nostalgic. Single shot, no cuts.`,
      `No text, no subtitles, no captions, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, watermark, extra limbs, speech bubble, empty stage, no microphone",
  },

  E: {
    label: "Real portrait + dialog audio",
    requirements: "H1b",
    dialogText:
      "Hallo, schön dich zu sehen. Ich wollte dir nur kurz etwas über meinen Tag heute erzählen.",
    targetClipSec: 7,
    buildPrompt: () => [
      `The real human in this photograph`,
      `speaks warmly and directly to the camera with a friendly, engaged expression, in German.`,
      `Soft natural light. Subtle natural idle motion — breathing, blinking, micro-expressions.`,
      `Preserve identity, clothing, hair, and skin tone exactly as in the photograph.`,
      `Single continuous shot. No text, no subtitles, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, watermark, cartoon, illustration, style change, different person, extra fingers, deformed face, animal features",
  },

  // Location-Fidelity (prompt-only): zwingt Wan, dieselbe A-Location aus
  // mehreren Winkeln zu zeigen — aber nur ueber Prompt-Text, ohne Bild-Anker.
  // Dadurch sieht man ehrlich, wie weit Prompt-Semantik allein traegt.
  // Kein Audio → isoliert die Location-/Kamera-/Spatial-Dimensionen.
  F: {
    label: "Location-Orbit (prompt-only, silent)",
    requirements: "W4, W5b, W5d, H2b prompt-only",
    targetClipSec: 8,
    buildPrompt: ({ characterName, characterDescription }) => [
      `${characterName} (${characterDescription})`,
      `stands calmly holding a small glowing golden acorn in one paw,`,
      `located in a soft warm forest clearing with dappled sunlight — the exact same forest clearing as in the previous dialog scene,`,
      `same trees, same ground, same time of day, same warm amber lighting.`,
      `The camera performs a slow cinematic 180-degree dolly orbit around the character, smooth and continuous,`,
      `revealing the surrounding trees, forest floor, and light rays from multiple angles.`,
      `Natural parallax and depth — the camera moves around the scene and respects spatial geometry, never clipping through trees or the character.`,
      `Single continuous take, no cuts. No text, no subtitles, no captions, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, watermark, hard cut, scene change, new location, character walking, character swap, jump cut, teleport, different time of day, different lighting",
  },

  // Landscape-Animation: Location-Bild wird als image_url an Wan gegeben
  // (statt Character-Portrait). Wan soll daraus eine lebendige Kulisse
  // machen — Kamera faehrt langsam durch die Szene, Blaetter wiegen im
  // Wind, Licht flackert, Partikel treiben. KEIN Character im Clip.
  // Das ist der eigentliche Production-Use-Case fuer Landschafts-Shots
  // und der EHRLICHE H2b-Test, weil das Bild der Pixel-Anker ist.
  G: {
    label: "Landscape-Animation aus Location-Bild",
    requirements: "H2b (Bild-Anker), W4, W5d, W3 (Natur-Bewegung)",
    targetClipSec: 8,
    buildPrompt: () => [
      `A cinematic nature scene based on this exact location photograph —`,
      `preserve the composition, lighting, color palette, and every element of the reference image.`,
      `The camera slowly dollies forward through the scene with a gentle push-in,`,
      `revealing depth and atmosphere.`,
      `Subtle natural ambient motion everywhere:`,
      `leaves gently swaying in a soft breeze, dappled sunlight flickering through branches,`,
      `tiny drifting particles of pollen or dust catching the light rays,`,
      `distant foliage moving softly, atmospheric haze slowly shifting.`,
      `Cinematic photorealistic quality, natural depth of field.`,
      `No characters, no people, no animals — pure environmental cinematography.`,
      `Single continuous shot. No text, no subtitles, no captions, no watermark.`,
    ].join(" "),
    negativePrompt: "text, subtitles, captions, watermark, characters, people, humans, animals, birds, creatures, cartoon style change, different location, new scene, jump cut, static frozen frame, unnatural motion, camera shake, handheld jitter",
  },
};

interface VariantResult {
  label: string;
  provider: string;
  url?: string;
  cost?: number;
  durationSec?: number;
  durationMs: number;
  promptUsed?: string;
  dialogText?: string;
  actualPrompt?: string;
  seed?: number;
  error?: string;
  failedStep?: string;
  errorStack?: string;
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    const result = await fn();
    console.log(`[WanSpike] ✓ ${label} (${Date.now() - t}ms)`);
    return result;
  } catch (err) {
    console.error(`[WanSpike] ✗ ${label} (${Date.now() - t}ms):`, err);
    const wrapped = new Error(`[step: ${label}] ${(err as Error).message}`);
    (wrapped as { originalStack?: string }).originalStack = (err as Error).stack;
    (wrapped as { failedStep?: string }).failedStep = label;
    throw wrapped;
  }
}

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
    }
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json() as {
    projectId: string;
    characterId: string;
    variants?: Variant[];
    realPortraitUrl?: string;
    locationUrl?: string;
    maxCostUsd?: number;
    resolution?: "720p" | "1080p";
  };

  const { projectId, characterId, realPortraitUrl, locationUrl } = body;
  const maxCostUsd = body.maxCostUsd ?? 5;
  const resolution = body.resolution ?? "720p";
  const allVariants: Variant[] = body.variants && body.variants.length > 0
    ? body.variants
    : ["A", "B", "C", "D", "F"];

  if (!projectId || !characterId) {
    return Response.json({ error: "projectId + characterId erforderlich" }, { status: 400 });
  }
  if (allVariants.includes("E") && !realPortraitUrl) {
    return Response.json({ error: "Variante E braucht realPortraitUrl" }, { status: 400 });
  }
  if (allVariants.includes("G") && !locationUrl) {
    return Response.json({ error: "Variante G braucht locationUrl (Location-Asset)" }, { status: 400 });
  }

  // ── Load character (project-scoped) ──
  const character = await prisma.studioCharacter.findFirst({
    where: { id: characterId, project: { id: projectId, userId } },
    include: { actor: true },
  });
  if (!character) return Response.json({ error: "Character nicht gefunden" }, { status: 404 });

  const characterName = character.name;
  const characterDescription =
    character.description
    || character.actor?.description
    || `${characterName}, a character`;

  // ── Resolve portrait (for cartoon/koala variants A/B/C/D) ──
  const actor = character.actor as (typeof character.actor & {
    characterSheet?: { front?: string; profile?: string; fullBody?: string };
  });
  const castSnapshot = character.castSnapshot as {
    portraitUrl?: string;
    voiceId?: string;
    voiceSettings?: CharacterVoiceSettings;
  } | null;

  const portraitUrl =
    actor?.characterSheet?.front
    || castSnapshot?.portraitUrl
    || character.portraitUrl
    || undefined;
  // Portrait ist nur fuer Character-Varianten noetig; E nutzt realPortraitUrl,
  // G nutzt locationUrl — beide kein Character-Portrait.
  const variantsNeedingCharacterPortrait = allVariants.filter(
    (v) => v !== "E" && v !== "G",
  );
  if (variantsNeedingCharacterPortrait.length > 0 && !portraitUrl) {
    return Response.json({
      error: `Character "${characterName}" hat kein Portrait (characterSheet.front oder castSnapshot.portraitUrl) — noetig fuer ${variantsNeedingCharacterPortrait.join(", ")}`,
    }, { status: 400 });
  }

  // ── Resolve voice config (only needed if any variant has dialogText) ──
  const voiceId = castSnapshot?.voiceId || character.voiceId || actor?.voiceId;
  const voiceSettings = (castSnapshot?.voiceSettings
    || character.voiceSettings
    || actor?.voiceSettings) as CharacterVoiceSettings | undefined;

  const variantsNeedingAudio = allVariants.filter((v) => !!PRESETS[v].dialogText);
  if (variantsNeedingAudio.length > 0 && (!voiceId || !voiceSettings)) {
    return Response.json({
      error: `Character "${characterName}" hat keine Voice-Config (voiceId + voiceSettings). Benötigt für Varianten: ${variantsNeedingAudio.join(", ")}`,
    }, { status: 400 });
  }

  // ── Preload portrait + (optional) real portrait + (optional) location ──
  const [portraitBuffer, realPortraitBuffer, locationBuffer] = await Promise.all([
    portraitUrl ? loadBlobBuffer(portraitUrl) : Promise.resolve(undefined),
    realPortraitUrl ? loadBlobBuffer(realPortraitUrl) : Promise.resolve(undefined),
    locationUrl ? loadBlobBuffer(locationUrl) : Promise.resolve(undefined),
  ]);
  if (variantsNeedingCharacterPortrait.length > 0 && !portraitBuffer) {
    return Response.json({ error: "Portrait konnte nicht geladen werden" }, { status: 500 });
  }
  if (allVariants.includes("E") && !realPortraitBuffer) {
    return Response.json({ error: "realPortraitUrl konnte nicht geladen werden" }, { status: 500 });
  }
  if (allVariants.includes("G") && !locationBuffer) {
    return Response.json({ error: "locationUrl konnte nicht geladen werden" }, { status: 500 });
  }

  // ── Generate audios in parallel for all variants that need them ──
  // Cache per-variant so A and D can share audio generation concurrently.
  console.log(`[WanSpike] Generating ${variantsNeedingAudio.length} TTS clip(s) via ElevenLabs...`);
  const audioByVariant: Partial<Record<Variant, Buffer>> = {};
  await Promise.all(
    variantsNeedingAudio.map(async (v) => {
      const preset = PRESETS[v];
      const tts = await step(`tts:${v}`, () => generateSingleTTS(
        preset.dialogText!,
        voiceId!,
        voiceSettings!,
      ));
      audioByVariant[v] = Buffer.from(tts.mp3);
      console.log(`[WanSpike] ${v}: TTS ${(tts.durationMs / 1000).toFixed(1)}s (${Math.round(tts.mp3.byteLength / 1024)}KB)`);
    }),
  );

  // ── Clip duration: match TTS length where possible, else preset target ──
  const clipSecByVariant: Record<Variant, number> = {
    A: PRESETS.A.targetClipSec,
    B: PRESETS.B.targetClipSec,
    C: PRESETS.C.targetClipSec,
    D: PRESETS.D.targetClipSec,
    E: PRESETS.E.targetClipSec,
    F: PRESETS.F.targetClipSec,
    G: PRESETS.G.targetClipSec,
  };
  for (const v of variantsNeedingAudio) {
    const buf = audioByVariant[v];
    if (!buf) continue;
    // Rough audio duration estimate: pcmToMp3 derives from 24kHz mono PCM → mp3 bitrate ~48kbps
    // Better to just trust TTS durationMs, but we already dropped it. Use preset target + padding.
    // For safety, clamp to [preset.target, preset.target + 3]
    clipSecByVariant[v] = Math.min(15, Math.max(PRESETS[v].targetClipSec, 4));
  }

  // ── Hard budget check ($0.10/s) ──
  const costPerSec = 0.10;
  const totalEstimatedCost = allVariants.reduce(
    (sum, v) => sum + clipSecByVariant[v] * costPerSec, 0,
  );
  if (totalEstimatedCost > maxCostUsd) {
    return Response.json({
      error: `Est. cost $${totalEstimatedCost.toFixed(2)} > cap $${maxCostUsd.toFixed(2)}. Reduce variants or raise cap.`,
      estimatedSeconds: clipSecByVariant,
      totalEstimatedCost,
    }, { status: 400 });
  }
  console.log(`[WanSpike] Estimated Wan cost: $${totalEstimatedCost.toFixed(2)} (cap $${maxCostUsd}) — OK`);

  // ── Helper: save variant video to blob ──
  const testRunId = Date.now();
  async function saveVariant(variant: Variant, videoBuffer: Buffer): Promise<string> {
    const path = `studio/${projectId}/tests/wan/${characterId}/${variant}-${testRunId}.mp4`;
    const blob = await put(path, videoBuffer, { access: "private", contentType: "video/mp4" });
    return blob.url;
  }

  function errorToResult(
    label: string, provider: string, start: number, err: unknown,
  ): VariantResult {
    const e = err as Error & { failedStep?: string; originalStack?: string };
    return {
      label,
      provider,
      error: e.message,
      failedStep: e.failedStep,
      errorStack: (e.originalStack || e.stack || "").split("\n").slice(0, 5).join("\n"),
      durationMs: Date.now() - start,
    };
  }

  // ── Shared prompt context ──
  const promptCtx = { characterName, characterDescription };

  // State shared across variants: A's raw fal URL (for B's seamless test)
  let variantALastFrameUrl: string | undefined;

  // ── Runner factory: single pattern for all preset-based variants ──
  function buildRunner(
    variant: Variant,
    opts: {
      imageBufferGetter: () => Buffer;
      audioBufferGetter?: () => Buffer | undefined;
      storeLastFrameUrl?: boolean;
    },
  ): () => Promise<VariantResult> {
    return async () => {
      const start = Date.now();
      const preset = PRESETS[variant];
      const provider = preset.dialogText ? "wan-2.7-i2v+audio" : "wan-2.7-i2v (silent)";
      const prompt = preset.buildPrompt(promptCtx);
      try {
        const { wan27I2V } = await step(`${variant}:import fal`, () => import("@/lib/fal"));
        const audio = opts.audioBufferGetter?.();
        const r = await step(`${variant}:wan27I2V`, () => wan27I2V({
          imageBuffer: opts.imageBufferGetter(),
          prompt,
          audioBuffer: audio,
          durationSeconds: clipSecByVariant[variant],
          resolution,
          negativePrompt: preset.negativePrompt,
        }));
        const videoBuf = await step(`${variant}:fetch video`, async () => {
          const res = await fetch(r.url);
          return Buffer.from(await res.arrayBuffer());
        });
        const finalUrl = await step(`${variant}:saveVariant`, () => saveVariant(variant, videoBuf));
        if (opts.storeLastFrameUrl) variantALastFrameUrl = r.url;
        return {
          label: preset.label,
          provider,
          url: finalUrl,
          cost: clipSecByVariant[variant] * costPerSec,
          durationSec: clipSecByVariant[variant],
          promptUsed: prompt,
          dialogText: preset.dialogText,
          actualPrompt: r.actualPrompt,
          seed: r.seed,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return errorToResult(preset.label, provider, start, err);
      }
    };
  }

  const runVariantA = buildRunner("A", {
    imageBufferGetter: () => portraitBuffer!,
    audioBufferGetter: () => audioByVariant.A,
    storeLastFrameUrl: true,
  });

  const runVariantC = buildRunner("C", {
    imageBufferGetter: () => portraitBuffer!,
  });

  const runVariantD = buildRunner("D", {
    imageBufferGetter: () => portraitBuffer!,
    audioBufferGetter: () => audioByVariant.D,
  });

  const runVariantE = buildRunner("E", {
    imageBufferGetter: () => realPortraitBuffer!,
    audioBufferGetter: () => audioByVariant.E,
  });

  const runVariantF = buildRunner("F", {
    imageBufferGetter: () => portraitBuffer!,
  });

  const runVariantG = buildRunner("G", {
    imageBufferGetter: () => locationBuffer!,
  });

  // ── Variant B — special: extracts A's last frame, needs custom flow ──
  async function runVariantB(): Promise<VariantResult> {
    const start = Date.now();
    const preset = PRESETS.B;
    const provider = "wan-2.7-i2v (seamless)";
    const prompt = preset.buildPrompt(promptCtx);
    try {
      if (!variantALastFrameUrl) {
        throw new Error("Variante A hat kein Video produziert — seamless-Test nicht möglich");
      }
      const { extractLastFrame, wan27I2V } = await step("B:import fal", () => import("@/lib/fal"));
      const lastFrameBuffer = await step("B:extractLastFrame", () => extractLastFrame(variantALastFrameUrl!));
      const r = await step("B:wan27I2V", () => wan27I2V({
        imageBuffer: lastFrameBuffer,
        prompt,
        durationSeconds: clipSecByVariant.B,
        resolution,
        negativePrompt: preset.negativePrompt,
      }));
      const videoBuf = await step("B:fetch video", async () => {
        const res = await fetch(r.url);
        return Buffer.from(await res.arrayBuffer());
      });
      const finalUrl = await step("B:saveVariant", () => saveVariant("B", videoBuf));
      return {
        label: preset.label,
        provider,
        url: finalUrl,
        cost: clipSecByVariant.B * costPerSec,
        durationSec: clipSecByVariant.B,
        promptUsed: prompt,
        actualPrompt: r.actualPrompt,
        seed: r.seed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return errorToResult(preset.label, provider, start, err);
    }
  }

  const runners: Record<Variant, () => Promise<VariantResult>> = {
    A: runVariantA,
    B: runVariantB,
    C: runVariantC,
    D: runVariantD,
    E: runVariantE,
    F: runVariantF,
    G: runVariantG,
  };

  // ── Execution: A/C/D/E parallel, B sequential after A ──
  const parallelList = allVariants.filter((v) => v !== "B");

  console.log(`[WanSpike] Phase 1: ${parallelList.join(", ")} in parallel`);
  const parallelResults = await Promise.all(
    parallelList.map(async (v) => [v, await runners[v]()] as const),
  );

  let bResult: [Variant, VariantResult] | undefined;
  if (allVariants.includes("B")) {
    console.log(`[WanSpike] Phase 2: B (seamless, depends on A)`);
    bResult = ["B", await runVariantB()];
  }

  const results = Object.fromEntries([
    ...parallelResults,
    ...(bResult ? [bResult] : []),
  ]) as Record<Variant, VariantResult>;

  const totalCost = Object.values(results).reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const anyFailed = Object.values(results).some((r) => r.error);

  return Response.json({
    characterId,
    characterName,
    resolution,
    testRunId,
    totalCostUsd: totalCost,
    maxCostUsd,
    anyFailed,
    results,
  });
}

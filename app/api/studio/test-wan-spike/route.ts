/**
 * Wan 2.7 Spike (following the Clip-Provider Requirements Checklist).
 *
 * Single-provider test: puts Wan 2.7 through the 5-clip protocol to decide
 * if it satisfies ALL hard requirements (H1a-H9) before we commit it to
 * production. Runs cheap, batched, parallelizable — hard budget cap.
 *
 * Variants (per /docs/clip-provider-requirements.md Teil 4):
 *   A — Dialog + Prop + Audio lip-sync   (H3, H3b, H8, W5c, W3)
 *   B — Seamless continuation from A     (H4)  [runs after A]
 *   C — Action / Dance (no audio)        (W3, W5d)
 *   D — Singing/Music (audio + setting)  (W2 video, H3b)
 *   E — Real portrait (optional)         (H1b)
 *
 * POST /api/studio/test-wan-spike
 * Body: {
 *   projectId: string,
 *   sequenceId: string,
 *   sceneIndex: number,
 *   variants?: Array<"A"|"B"|"C"|"D"|"E">,
 *   realPortraitUrl?: string,           // only needed for variant E
 *   maxCostUsd?: number,                // hard cap, default 5
 *   resolution?: "720p" | "1080p",      // default 720p (halve spike cost)
 * }
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 800;

type Variant = "A" | "B" | "C" | "D" | "E";

interface VariantResult {
  label: string;
  provider: string;
  url?: string;
  cost?: number;
  durationSec?: number;
  durationMs: number;
  promptUsed?: string;
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
    sequenceId: string;
    sceneIndex: number;
    variants?: Variant[];
    realPortraitUrl?: string;
    maxCostUsd?: number;
    resolution?: "720p" | "1080p";
  };

  const { projectId, sequenceId, sceneIndex, realPortraitUrl } = body;
  const maxCostUsd = body.maxCostUsd ?? 5;
  const resolution = body.resolution ?? "720p";
  const allVariants: Variant[] = body.variants && body.variants.length > 0
    ? body.variants
    : ["A", "B", "C", "D"]; // E is opt-in via explicit request or realPortraitUrl

  if (allVariants.includes("E") && !realPortraitUrl) {
    return Response.json({
      error: "Variant E requires realPortraitUrl in body",
    }, { status: 400 });
  }

  if (!projectId || !sequenceId || typeof sceneIndex !== "number") {
    return Response.json({
      error: "projectId, sequenceId, sceneIndex erforderlich",
    }, { status: 400 });
  }

  // ── Load sequence + scene + character ──
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId } },
    include: {
      project: { include: { characters: { include: { actor: true } } } },
    },
  });
  if (!sequence) return Response.json({ error: "Sequenz nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const scene = scenes[sceneIndex];
  if (!scene) return Response.json({ error: `Szene ${sceneIndex} nicht gefunden` }, { status: 404 });
  if (!scene.dialogAudioUrl) {
    return Response.json({
      error: "Szene hat keine dialogAudioUrl — Dialog-Audio zuerst generieren",
    }, { status: 400 });
  }
  if (!scene.characterId) {
    return Response.json({ error: "Szene hat keinen characterId" }, { status: 400 });
  }

  const character = sequence.project.characters.find((c) => c.id === scene.characterId);
  if (!character) return Response.json({ error: "Character nicht gefunden" }, { status: 404 });
  const characterName = character.name;

  // ── Resolve portrait & character sheet ──
  const actor = (character as unknown as {
    actor?: { characterSheet?: { front?: string; profile?: string; fullBody?: string } };
  }).actor;
  const portraitUrl = actor?.characterSheet?.front
    || (character as unknown as { castSnapshot?: { portraitUrl?: string } }).castSnapshot?.portraitUrl
    || character.portraitUrl
    || undefined;
  if (!portraitUrl) {
    return Response.json({
      error: "Character hat kein Portrait (characterSheet.front)",
    }, { status: 400 });
  }

  // ── Preload buffers in parallel ──
  console.log(`[WanSpike] Preloading assets...`);
  const [portraitBuffer, audioBuffer, realPortraitBuffer] = await Promise.all([
    loadBlobBuffer(portraitUrl),
    loadBlobBuffer(scene.dialogAudioUrl),
    realPortraitUrl ? loadBlobBuffer(realPortraitUrl) : Promise.resolve(undefined),
  ]);

  if (!portraitBuffer) return Response.json({ error: "Portrait konnte nicht geladen werden" }, { status: 500 });
  if (!audioBuffer) return Response.json({ error: "Audio konnte nicht geladen werden" }, { status: 500 });
  if (allVariants.includes("E") && !realPortraitBuffer) {
    return Response.json({ error: "realPortraitUrl konnte nicht geladen werden" }, { status: 500 });
  }

  // ── Clip duration derives from dialog audio ──
  const dialogDurSec = (scene.audioEndMs - scene.audioStartMs) / 1000;
  // Wan 2.7 i2v allows up to 15s. Add 0.5s tail padding, clamp.
  const dialogClipSec = Math.min(15, Math.max(3, Math.ceil(dialogDurSec + 0.5)));
  // Silent variants (C, B continuation) can be shorter.
  const silentClipSec = 6;

  // ── Hard budget check ($0.10/s) ──
  const costPerSec = 0.10;
  const estimatedSeconds: Record<Variant, number> = {
    A: dialogClipSec,
    B: silentClipSec,
    C: silentClipSec,
    D: dialogClipSec,
    E: dialogClipSec,
  };
  const totalEstimatedCost = allVariants.reduce((sum, v) => sum + estimatedSeconds[v] * costPerSec, 0);
  if (totalEstimatedCost > maxCostUsd) {
    return Response.json({
      error: `Estimated cost $${totalEstimatedCost.toFixed(2)} exceeds cap $${maxCostUsd.toFixed(2)}. Reduce variants or raise maxCostUsd.`,
      estimatedSeconds,
      totalEstimatedCost,
    }, { status: 400 });
  }
  console.log(`[WanSpike] Estimated cost: $${totalEstimatedCost.toFixed(2)} (cap $${maxCostUsd}) — OK`);

  // ── Build shared context strings ──
  const charDesc = (character as unknown as { description?: string }).description
    || (actor as unknown as { description?: string })?.description
    || `${characterName}, a character`;
  const location = scene.location || (sequence.location as string | undefined) || "a natural outdoor setting";
  const mood = scene.mood || (sequence.atmosphereText as string | undefined) || "warm, cinematic";

  // ── Helper: save variant video to blob ──
  const testRunId = Date.now();
  async function saveVariant(variant: Variant, videoBuffer: Buffer): Promise<string> {
    const path = `studio/${projectId}/tests/wan/${sequenceId}/scene-${String(sceneIndex).padStart(3, "0")}-${variant}-${testRunId}.mp4`;
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

  // ── Variant A: Dialog + Prop + Audio lip-sync ──
  // Shared state: A's last frame is needed for B's seamless test.
  let variantALastFrameUrl: string | undefined;

  async function runVariantA(): Promise<VariantResult> {
    const start = Date.now();
    const label = "Wan 2.7 — Dialog + Prop + Audio lip-sync";
    const provider = "wan-2.7-i2v+audio";
    const prompt = [
      `${characterName} (${charDesc})`,
      `is holding a small glowing acorn in one paw,`,
      `looking directly at the camera, speaking warmly to the viewer in German.`,
      `Location: ${location}. Mood: ${mood}.`,
      `Soft natural light. Gentle idle motion, expressive face, natural lip movement.`,
      `Single continuous shot. No text, no subtitles, no captions, no watermark.`,
    ].join(" ");
    try {
      const { wan27I2V } = await step("A:import fal", () => import("@/lib/fal"));
      const r = await step("A:wan27I2V", () => wan27I2V({
        imageBuffer: portraitBuffer!,
        prompt,
        audioBuffer: audioBuffer!,
        durationSeconds: dialogClipSec,
        resolution,
        negativePrompt: "text, subtitles, captions, words, letters, writing, watermark, logo, extra fingers, deformed hands, blurry, static frozen pose",
      }));
      const buf = await step("A:fetch video", async () => {
        const res = await fetch(r.url);
        return Buffer.from(await res.arrayBuffer());
      });
      const finalUrl = await step("A:saveVariant", () => saveVariant("A", buf));
      variantALastFrameUrl = r.url; // remember for B
      return {
        label, provider, url: finalUrl,
        cost: dialogClipSec * costPerSec,
        durationSec: dialogClipSec,
        promptUsed: prompt,
        actualPrompt: r.actualPrompt,
        seed: r.seed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return errorToResult(label, provider, start, err);
    }
  }

  // ── Variant B: Seamless continuation from A's last frame ──
  async function runVariantB(): Promise<VariantResult> {
    const start = Date.now();
    const label = "Wan 2.7 — Seamless continuation from A";
    const provider = "wan-2.7-i2v (seamless)";
    try {
      if (!variantALastFrameUrl) {
        throw new Error("Variant A did not produce a video — cannot test seamless continuation");
      }
      const { extractLastFrame, wan27I2V } = await step("B:import fal", () => import("@/lib/fal"));
      const lastFrameBuffer = await step("B:extractLastFrame", () => extractLastFrame(variantALastFrameUrl!));
      const prompt = [
        `${characterName} (${charDesc}),`,
        `continuing from the previous shot, slowly turns head slightly to the right`,
        `and looks off-camera with a thoughtful expression.`,
        `Location: ${location}. Mood: ${mood}.`,
        `Match the previous shot's lighting, camera framing, and character pose exactly at the start.`,
        `Subtle, continuous motion. Single shot, no cuts. No text, no subtitles, no watermark.`,
      ].join(" ");
      const r = await step("B:wan27I2V", () => wan27I2V({
        imageBuffer: lastFrameBuffer,
        prompt,
        // No audio — pure H4 seamless test
        durationSeconds: silentClipSec,
        resolution,
        negativePrompt: "text, subtitles, captions, watermark, hard cut, scene change, new background, different lighting, different clothing",
      }));
      const buf = await step("B:fetch video", async () => {
        const res = await fetch(r.url);
        return Buffer.from(await res.arrayBuffer());
      });
      const finalUrl = await step("B:saveVariant", () => saveVariant("B", buf));
      return {
        label, provider, url: finalUrl,
        cost: silentClipSec * costPerSec,
        durationSec: silentClipSec,
        promptUsed: prompt,
        actualPrompt: r.actualPrompt,
        seed: r.seed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return errorToResult(label, provider, start, err);
    }
  }

  // ── Variant C: Action / Dance (no audio) ──
  async function runVariantC(): Promise<VariantResult> {
    const start = Date.now();
    const label = "Wan 2.7 — Action / Dance (silent)";
    const provider = "wan-2.7-i2v (no audio)";
    const prompt = [
      `${characterName} (${charDesc})`,
      `dances happily, twirling and laughing with pure joy,`,
      `arms raised, full-body movement, expressive face with a big open-mouth smile.`,
      `Location: ${location}. Mood: bright, playful, joyful.`,
      `Dynamic camera — slight follow, no cuts. Cinematic lighting.`,
      `No text, no subtitles, no watermark.`,
    ].join(" ");
    try {
      const { wan27I2V } = await step("C:import fal", () => import("@/lib/fal"));
      const r = await step("C:wan27I2V", () => wan27I2V({
        imageBuffer: portraitBuffer!,
        prompt,
        // No audio — pure expressive-range test
        durationSeconds: silentClipSec,
        resolution,
        negativePrompt: "text, subtitles, captions, watermark, extra limbs, deformed hands, static frozen pose, sad, crying",
      }));
      const buf = await step("C:fetch video", async () => {
        const res = await fetch(r.url);
        return Buffer.from(await res.arrayBuffer());
      });
      const finalUrl = await step("C:saveVariant", () => saveVariant("C", buf));
      return {
        label, provider, url: finalUrl,
        cost: silentClipSec * costPerSec,
        durationSec: silentClipSec,
        promptUsed: prompt,
        actualPrompt: r.actualPrompt,
        seed: r.seed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return errorToResult(label, provider, start, err);
    }
  }

  // ── Variant D: Singing / Music setting with audio ──
  async function runVariantD(): Promise<VariantResult> {
    const start = Date.now();
    const label = "Wan 2.7 — Singing / Music (audio + music-setting prompt)";
    const provider = "wan-2.7-i2v+audio (music setting)";
    const prompt = [
      `${characterName} (${charDesc})`,
      `sings softly into an old-fashioned microphone on a small wooden stage,`,
      `warm stage lighting, cozy cafe in the background with blurred patrons,`,
      `eyes half-closed with emotion, expressive singing mouth movements,`,
      `gentle swaying to the rhythm of their own voice.`,
      `Mood: warm, intimate, nostalgic. Single shot, no cuts.`,
      `No text, no subtitles, no watermark.`,
    ].join(" ");
    try {
      const { wan27I2V } = await step("D:import fal", () => import("@/lib/fal"));
      const r = await step("D:wan27I2V", () => wan27I2V({
        imageBuffer: portraitBuffer!,
        prompt,
        audioBuffer: audioBuffer!,
        durationSeconds: dialogClipSec,
        resolution,
        negativePrompt: "text, subtitles, captions, watermark, extra limbs, speech bubble",
      }));
      const buf = await step("D:fetch video", async () => {
        const res = await fetch(r.url);
        return Buffer.from(await res.arrayBuffer());
      });
      const finalUrl = await step("D:saveVariant", () => saveVariant("D", buf));
      return {
        label, provider, url: finalUrl,
        cost: dialogClipSec * costPerSec,
        durationSec: dialogClipSec,
        promptUsed: prompt,
        actualPrompt: r.actualPrompt,
        seed: r.seed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return errorToResult(label, provider, start, err);
    }
  }

  // ── Variant E: Real portrait (optional, H1b test) ──
  async function runVariantE(): Promise<VariantResult> {
    const start = Date.now();
    const label = "Wan 2.7 — Real portrait + dialog audio (H1b)";
    const provider = "wan-2.7-i2v+audio (real portrait)";
    const prompt = [
      `A real human from this photograph`,
      `speaks warmly and directly to the camera with a friendly, engaged expression.`,
      `Location: ${location}. Mood: ${mood}.`,
      `Soft natural light. Subtle natural idle motion — breathing, blinking, micro-expressions.`,
      `Preserve identity, clothing, hair, and skin tone exactly as in the photograph.`,
      `Single continuous shot. No text, no subtitles, no watermark.`,
    ].join(" ");
    try {
      const { wan27I2V } = await step("E:import fal", () => import("@/lib/fal"));
      const r = await step("E:wan27I2V", () => wan27I2V({
        imageBuffer: realPortraitBuffer!,
        prompt,
        audioBuffer: audioBuffer!,
        durationSeconds: dialogClipSec,
        resolution,
        negativePrompt: "text, subtitles, captions, watermark, cartoon, illustration, style change, different person, extra fingers, deformed face",
      }));
      const buf = await step("E:fetch video", async () => {
        const res = await fetch(r.url);
        return Buffer.from(await res.arrayBuffer());
      });
      const finalUrl = await step("E:saveVariant", () => saveVariant("E", buf));
      return {
        label, provider, url: finalUrl,
        cost: dialogClipSec * costPerSec,
        durationSec: dialogClipSec,
        promptUsed: prompt,
        actualPrompt: r.actualPrompt,
        seed: r.seed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return errorToResult(label, provider, start, err);
    }
  }

  // ── Execution plan ──
  // A, C, D, E are fully parallel.
  // B must run AFTER A (needs A's last frame).
  // Run the parallel group first; then B (if selected).
  const parallelList = allVariants.filter((v) => v !== "B");
  const runsBinParallel: Record<Variant, () => Promise<VariantResult>> = {
    A: runVariantA,
    B: runVariantB,
    C: runVariantC,
    D: runVariantD,
    E: runVariantE,
  };

  console.log(`[WanSpike] Phase 1: running ${parallelList.join(", ")} in parallel`);
  const parallelResults = await Promise.all(
    parallelList.map(async (v) => [v, await runsBinParallel[v]()] as const),
  );

  let bResult: [Variant, VariantResult] | undefined;
  if (allVariants.includes("B")) {
    console.log(`[WanSpike] Phase 2: running B (seamless, depends on A)`);
    bResult = ["B", await runVariantB()];
  }

  const results = Object.fromEntries([
    ...parallelResults,
    ...(bResult ? [bResult] : []),
  ]) as Record<Variant, VariantResult>;

  const totalCost = Object.values(results).reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const anyFailed = Object.values(results).some((r) => r.error);

  return Response.json({
    sequenceId,
    sceneIndex,
    character: characterName,
    audioSec: dialogDurSec,
    dialogClipSec,
    silentClipSec,
    resolution,
    testRunId,
    totalCostUsd: totalCost,
    maxCostUsd,
    anyFailed,
    results,
  });
}

/**
 * KoalaTree Film Renderer — Remotion Lambda
 *
 * Renders films on AWS Lambda via Remotion:
 * - Per-scene dialog + SFX audio tracks
 * - Continuous ambience layer
 * - Background music layer
 * - Crossfade transitions between scenes
 * - Title/outro cards
 *
 * Requires: REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY
 * Deploy: npx remotion lambda functions deploy && npx remotion lambda sites create remotion/index.ts
 */

import type { FilmScene } from "../remotion/FilmComposition";

const FPS = 30;

export interface RenderFilmOptions {
  geschichteId: string;
  scenes: Array<{
    videoUrl: string;
    dialogAudioUrl?: string;   // Per-scene TTS dialog
    sfxAudioUrl?: string;      // Per-scene SFX
    durationMs: number;
    type: string;
    characterId?: string;
    clipTransition?: "seamless" | "hard-cut" | "fade-to-black" | "match-cut";
  }>;
  ambienceUrl?: string;          // V2: looped ambience per sequence
  storyAudioUrl?: string;        // V1 fallback: single story audio
  backgroundMusicUrl?: string;
  title?: string;
  subtitle?: string;
  musicVolume?: number;
  credits?: string[];
  format?: "portrait" | "wide" | "cinema";
  onProgress?: (percent: number, message: string) => void;
}

/**
 * Render a film on AWS Lambda via Remotion.
 * Returns the URL of the rendered video (S3 bucket URL).
 */
export async function renderFilmOnLambda(options: RenderFilmOptions): Promise<string> {
  const {
    scenes,
    ambienceUrl,
    storyAudioUrl,
    backgroundMusicUrl,
    title = "KoalaTree",
    subtitle = "praesentiert",
    musicVolume = 0.08,
    credits,
    format = "portrait",
  } = options;

  // Dynamic import to avoid Next.js bundling issues
  const {
    renderMediaOnLambda,
    getRenderProgress,
    getFunctions,
  } = await import("@remotion/lambda/client");

  console.log(`[Lambda Render] Starting render (${scenes.length} scenes, ${format})...`);

  // 1. Get deployed Lambda function
  const functions = await getFunctions({
    region: "eu-central-1",
    compatibleOnly: true,
  });

  if (functions.length === 0) {
    throw new Error(
      "No Remotion Lambda function deployed. Run: npx remotion lambda functions deploy --region=eu-central-1"
    );
  }

  const functionName = functions[0].functionName;
  console.log(`[Lambda Render] Using function: ${functionName}`);

  // 2. Prepare input props
  const FADE_TO_BLACK_GAP_FRAMES = 30; // 1 second black gap for fade-to-black transitions
  const filmScenes: FilmScene[] = scenes.map((s) => ({
    videoUrl: s.videoUrl,
    dialogAudioUrl: s.dialogAudioUrl,
    sfxAudioUrl: s.sfxAudioUrl,
    durationFrames: Math.max(FPS, Math.ceil((s.durationMs / 1000) * FPS)),
    type: s.type as FilmScene["type"],
    characterId: s.characterId,
    clipTransition: s.clipTransition,
  }));

  // Calculate total duration — transition-aware (no overlap, gap for fade-to-black)
  let totalFrames = title ? 3 * FPS : 0;
  for (let i = 0; i < filmScenes.length; i++) {
    totalFrames += filmScenes[i].durationFrames;
    // Add gap frames for fade-to-black transitions
    if (i < filmScenes.length - 1) {
      const nextTransition = filmScenes[i + 1].clipTransition || "seamless";
      if (nextTransition === "fade-to-black") {
        totalFrames += FADE_TO_BLACK_GAP_FRAMES;
      }
    }
  }
  // Add credits duration (5s)
  if (credits && credits.length > 0) {
    totalFrames += 5 * FPS;
  }

  const compositionId = format === "wide" ? "KoalaTreeFilmWide" : format === "cinema" ? "KoalaTreeFilmCinema" : "KoalaTreeFilm";

  const inputProps = {
    scenes: filmScenes,
    ambienceUrl,
    storyAudioUrl,       // V1 fallback
    backgroundMusicUrl,
    musicVolume,
    title,
    subtitle,
    credits,
    showCredits: credits && credits.length > 0,
  };

  // 3. Trigger Lambda render
  console.log(`[Lambda Render] Total frames: ${totalFrames} (${(totalFrames / FPS).toFixed(1)}s at ${FPS}fps)`);

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: "eu-central-1",
    functionName,
    serveUrl: process.env.REMOTION_SERVE_URL || "",
    composition: compositionId,
    inputProps,
    codec: "h264",
    framesPerLambda: totalFrames, // Single Lambda — avoids AWS concurrency limit
    forceDurationInFrames: totalFrames, // Override the 900-frame (30s) placeholder
    downloadBehavior: { type: "download", fileName: "koalatree-film.mp4" },
    overwrite: true,
  });

  console.log(`[Lambda Render] Render started: ${renderId} (bucket: ${bucketName})`);

  // 4. Poll for completion (max 5 minutes)
  const maxPolls = 150; // 150 * 2s = 5 min
  for (let poll = 0; poll < maxPolls; poll++) {
    const status = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region: "eu-central-1",
    });

    if (status.fatalErrorEncountered) {
      throw new Error(`Lambda render failed: ${JSON.stringify(status.errors)}`);
    }

    const pct = Math.round(status.overallProgress * 100);
    const msg = pct < 10 ? "Starte Rendering..." : pct < 50 ? "Frames werden gerendert..." : pct < 90 ? "Clips werden zusammengefuegt..." : "Finalisierung...";
    console.log(`[Lambda Render] Progress: ${pct}% (poll ${poll + 1})`);
    options.onProgress?.(pct, msg);

    if (status.done) {
      if (status.outputFile) {
        console.log(`[Lambda Render] Done! Output: ${status.outputFile}`);
        return status.outputFile;
      }
      // done but no output — wait a bit more, might be finalizing
      if (poll > 0) {
        console.warn(`[Lambda Render] Done but no outputFile yet, waiting...`);
      }
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Lambda render timed out after 5 minutes");
}

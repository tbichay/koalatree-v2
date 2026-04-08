/**
 * KoalaTree Film Renderer — Remotion Lambda
 *
 * Renders films on AWS Lambda via Remotion:
 * - Crossfade transitions between scenes
 * - Continuous story audio
 * - Background music layer
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
    durationMs: number;
    type: string;
    characterId?: string;
  }>;
  storyAudioUrl?: string;
  backgroundMusicUrl?: string;
  title?: string;
  subtitle?: string;
  musicVolume?: number;
  format?: "portrait" | "wide";
  onProgress?: (percent: number, message: string) => void;
}

/**
 * Render a film on AWS Lambda via Remotion.
 * Returns the URL of the rendered video (S3 bucket URL).
 */
export async function renderFilmOnLambda(options: RenderFilmOptions): Promise<string> {
  const {
    scenes,
    storyAudioUrl,
    backgroundMusicUrl,
    title = "KoalaTree",
    subtitle = "praesentiert",
    musicVolume = 0.08,
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
  const crossfadeDurationFrames = 30; // 1 second crossfade
  const filmScenes: FilmScene[] = scenes.map((s) => ({
    videoUrl: s.videoUrl,
    durationFrames: Math.max(FPS, Math.ceil((s.durationMs / 1000) * FPS)),
    type: s.type as FilmScene["type"],
    characterId: s.characterId,
  }));

  // Calculate total duration
  let totalFrames = title ? 3 * FPS : 0;
  for (let i = 0; i < filmScenes.length; i++) {
    totalFrames += filmScenes[i].durationFrames;
    if (i < filmScenes.length - 1) totalFrames -= crossfadeDurationFrames;
  }

  const compositionId = format === "wide" ? "KoalaTreeFilmWide" : "KoalaTreeFilm";

  const inputProps = {
    scenes: filmScenes,
    storyAudioUrl,
    backgroundMusicUrl,
    musicVolume,
    crossfadeDurationFrames,
    title,
    subtitle,
  };

  // 3. Trigger Lambda render
  const { renderId, bucketName } = await renderMediaOnLambda({
    region: "eu-central-1",
    functionName,
    serveUrl: process.env.REMOTION_SERVE_URL || "",
    composition: compositionId,
    inputProps,
    codec: "h264",
    framesPerLambda: 200, // High value = fewer parallel Lambdas (stays within 10 concurrency limit)
    downloadBehavior: { type: "download", fileName: "koalatree-film.mp4" },
    overwrite: true,
  });

  console.log(`[Lambda Render] Render started: ${renderId} (bucket: ${bucketName})`);

  // 4. Poll for completion
  let progress = 0;
  while (progress < 1) {
    const status = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region: "eu-central-1",
    });

    if (status.fatalErrorEncountered) {
      throw new Error(`Lambda render failed: ${JSON.stringify(status.errors)}`);
    }

    progress = status.overallProgress;
    const pct = Math.round(progress * 100);
    const msg = pct < 10 ? "Starte Rendering..." : pct < 50 ? "Frames werden gerendert..." : pct < 90 ? "Clips werden zusammengefuegt..." : "Finalisierung...";
    console.log(`[Lambda Render] Progress: ${pct}%`);
    options.onProgress?.(pct, msg);

    if (status.done && status.outputFile) {
      console.log(`[Lambda Render] Done! Output: ${status.outputFile}`);
      return status.outputFile;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Lambda render completed but no output file found");
}

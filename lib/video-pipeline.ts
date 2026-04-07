/**
 * KoalaTree Video Pipeline — Incremental Scene Processing
 *
 * Designed for Vercel's 5-minute function limit:
 * Each cron run processes ONE scene, then exits.
 * The cron runs every 2 minutes, so scenes are processed sequentially.
 *
 * Flow:
 * 1. First run: AI Director analyzes story → saves scenes to DB
 * 2. Each subsequent run: Generate one scene video (Hedra/Kling)
 * 3. When all scenes done: Mark as COMPLETED
 */

import { prisma } from "./db";
import { analyzeStoryForFilm, type FilmScene, type TimelineEntry } from "./video-director";
import { generateVideo, generateSceneVideo, downloadVideo } from "./hedra";
import { put, get, list } from "@vercel/blob";

// --- Helpers ---

async function loadPortraitBuffer(characterId: string): Promise<Buffer> {
  const filename = `${characterId}-portrait.png`;
  const { blobs } = await list({ prefix: `images/${filename}`, limit: 1 });

  if (blobs.length > 0) {
    const result = await get(blobs[0].url, { access: "private" });
    if (result?.stream) {
      const chunks: Uint8Array[] = [];
      const reader = result.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
  }

  const baseUrl = process.env.AUTH_URL || "https://www.koalatree.ai";
  const res = await fetch(`${baseUrl}/api/images/${filename}`);
  if (!res.ok) throw new Error(`Portrait not found: ${characterId}`);
  return Buffer.from(await res.arrayBuffer());
}

async function loadAudioBuffer(audioUrl: string): Promise<Buffer> {
  const result = await get(audioUrl, { access: "private" });
  if (!result?.stream) throw new Error("Could not load audio");
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// --- Step 1: Analyze Story → Create Scenes ---

export async function analyzeAndSaveScenes(geschichteId: string): Promise<FilmScene[]> {
  const geschichte = await prisma.geschichte.findUnique({
    where: { id: geschichteId },
    select: { text: true, timeline: true },
  });

  if (!geschichte?.text) throw new Error("Story has no text");

  const timeline = (geschichte.timeline as unknown as TimelineEntry[]) || [];
  const scenes = await analyzeStoryForFilm(geschichte.text, timeline);

  // Save scenes to the Geschichte
  await prisma.geschichte.update({
    where: { id: geschichteId },
    data: { filmScenes: JSON.parse(JSON.stringify(scenes)) },
  });

  return scenes;
}

// --- Step 2: Generate ONE Scene Video ---

export async function generateOneScene(
  geschichteId: string,
  sceneIndex: number,
  scene: FilmScene,
  fullAudioBuffer: Buffer
): Promise<string> {
  console.log(`[Film] Scene ${sceneIndex}: ${scene.type} — ${scene.sceneDescription.substring(0, 60)}...`);

  let videoUrl: string;

  if (scene.type === "dialog" && scene.characterId) {
    // Lip-sync via Hedra Character-3 with SEGMENTED audio (not full!)
    const portraitBuffer = await loadPortraitBuffer(scene.characterId);

    // Slice the MP3 buffer based on timeline position
    // MP3 at 128 kbps = 16,000 bytes/second
    const bytesPerMs = 16; // 16,000 bytes/s = 16 bytes/ms
    const startByte = Math.max(0, Math.floor(scene.audioStartMs * bytesPerMs));
    const endByte = Math.min(fullAudioBuffer.byteLength, Math.ceil(scene.audioEndMs * bytesPerMs));
    const audioSegment = fullAudioBuffer.subarray(startByte, endByte);

    const segmentDuration = (scene.audioEndMs - scene.audioStartMs) / 1000;
    console.log(`[Film] Audio segment: ${scene.audioStartMs}ms-${scene.audioEndMs}ms (${segmentDuration.toFixed(1)}s, ${(audioSegment.byteLength / 1024).toFixed(0)}KB)`);

    videoUrl = await generateVideo({
      imageBuffer: portraitBuffer,
      audioBuffer: Buffer.from(audioSegment),
      prompt: scene.sceneDescription,
      aspectRatio: "9:16",
      resolution: "720p",
    });
  } else {
    // Landscape/Transition via Kling
    const sceneImageBuffer = await loadPortraitBuffer(scene.characterId || "koda");
    videoUrl = await generateSceneVideo({
      imageBuffer: sceneImageBuffer,
      prompt: `${scene.sceneDescription}. ${scene.mood}. Camera: ${scene.camera}. KoalaTree animated style, warm colors, magical forest.`,
      aspectRatio: "9:16",
      resolution: "720p",
    });
  }

  // Download and store
  const videoBuffer = await downloadVideo(videoUrl);
  const blob = await put(
    `films/${geschichteId}/scene-${String(sceneIndex).padStart(3, "0")}.mp4`,
    videoBuffer,
    { access: "private", contentType: "video/mp4", allowOverwrite: true }
  );

  console.log(`[Film] Scene ${sceneIndex} stored: ${videoBuffer.byteLength} bytes`);
  return blob.url;
}

// --- Step 3: Process Next Pending Scene (called by cron) ---

export async function processNextScene(jobId: string): Promise<{
  done: boolean;
  sceneIndex: number;
  scenesTotal: number;
}> {
  const job = await prisma.filmJob.findUnique({
    where: { id: jobId },
    include: {
      geschichte: {
        select: { id: true, text: true, audioUrl: true, filmScenes: true, timeline: true },
      },
    },
  });

  if (!job) throw new Error("Job not found");

  const geschichteId = job.geschichteId;

  // Step 1: If no scenes yet, run Director
  let scenes = job.geschichte.filmScenes as unknown as FilmScene[] | null;

  if (!scenes || scenes.length === 0) {
    console.log("[Film] Running AI Director...");
    await prisma.filmJob.update({
      where: { id: jobId },
      data: { progress: "Szenen werden analysiert..." },
    });

    scenes = await analyzeAndSaveScenes(geschichteId);

    await prisma.filmJob.update({
      where: { id: jobId },
      data: { scenesTotal: scenes.length, progress: `${scenes.length} Szenen geplant` },
    });

    console.log(`[Film] Director: ${scenes.length} scenes`);
    // Return — next cron run will process scene 0
    return { done: false, sceneIndex: -1, scenesTotal: scenes.length };
  }

  // Step 2: Find next unprocessed scene
  const nextIndex = job.scenesComplete;

  if (nextIndex >= scenes.length) {
    // All scenes done — mastering step
    await prisma.filmJob.update({
      where: { id: jobId },
      data: { progress: "🎬 Mastering: Film wird zusammengeschnitten..." },
    });

    // Note: Full mastering with ffmpeg (color grading, transitions, music)
    // runs via the local script: node scripts/master-film.mjs <geschichteId>
    // On Vercel, we just mark the individual clips as done.
    // The mastering script downloads clips, processes, and re-uploads.

    return { done: true, sceneIndex: nextIndex, scenesTotal: scenes.length };
  }

  const scene = scenes[nextIndex];

  // Update progress
  const charName = scene.characterId
    ? scene.characterId.charAt(0).toUpperCase() + scene.characterId.slice(1)
    : "Szene";
  await prisma.filmJob.update({
    where: { id: jobId },
    data: { progress: `Szene ${nextIndex + 1}/${scenes.length}: ${charName} — ${scene.type}` },
  });

  // Load audio
  if (!job.geschichte.audioUrl) throw new Error("No audio URL");
  const audioBuffer = await loadAudioBuffer(job.geschichte.audioUrl);

  // Generate this scene
  await generateOneScene(geschichteId, nextIndex, scene, audioBuffer);

  // Update progress
  const newComplete = nextIndex + 1;
  await prisma.filmJob.update({
    where: { id: jobId },
    data: {
      scenesComplete: newComplete,
      progress: newComplete >= scenes.length
        ? "Alle Szenen fertig!"
        : `${newComplete}/${scenes.length} Szenen fertig`,
    },
  });

  return {
    done: newComplete >= scenes.length,
    sceneIndex: nextIndex,
    scenesTotal: scenes.length,
  };
}

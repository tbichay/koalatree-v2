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
import { generateVideo, generateSceneVideo, downloadVideo as downloadHedraVideo } from "./hedra";
import { klingAvatar, klingI2V, downloadVideo as downloadFalVideo } from "./fal";
import { put, get, list } from "@vercel/blob";
import { loadCharacterReferences } from "./references";
import { segmentMp3 } from "./audio-segment";

// --- Helpers ---

// loadPortraitBuffer replaced by loadCharacterReferences from lib/references.ts

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
    select: { text: true, timeline: true, audioDauerSek: true },
  });

  if (!geschichte?.text) throw new Error("Story has no text");

  const timeline = (geschichte.timeline as unknown as TimelineEntry[]) || [];
  const scenes = await analyzeStoryForFilm(geschichte.text, timeline, geschichte.audioDauerSek || undefined);

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

  const isDialogLike = (scene.type === "dialog" || scene.type === "intro" || scene.type === "outro") && scene.characterId;
  const hasAudio = scene.audioStartMs !== scene.audioEndMs && scene.audioEndMs > 0;

  if (isDialogLike && scene.characterId) {
    const charRefs = await loadCharacterReferences(scene.characterId);
    const portraitBuffer = charRefs[0];

    let audioSegment: Buffer = Buffer.alloc(0);
    if (hasAudio) {
      audioSegment = segmentMp3(fullAudioBuffer, scene.audioStartMs, scene.audioEndMs);
      const segDur = (scene.audioEndMs - scene.audioStartMs) / 1000;
      console.log(`[Film] Audio segment: ${scene.audioStartMs}-${scene.audioEndMs}ms (${segDur.toFixed(1)}s, ${(audioSegment.byteLength / 1024).toFixed(0)}KB)`);
    }

    // Use fal.ai Kling Avatar if available, else Hedra
    if (process.env.FAL_KEY && audioSegment.byteLength > 0) {
      try {
        videoUrl = await klingAvatar(portraitBuffer, audioSegment, scene.sceneDescription, "standard");
        console.log(`[Film] Generated with Kling Avatar v2 Standard (fal.ai)`);
      } catch (falErr) {
        console.warn(`[Film] fal.ai failed, falling back to Hedra:`, falErr);
        videoUrl = await generateVideo({
          imageBuffer: portraitBuffer,
          audioBuffer: audioSegment,
          prompt: scene.sceneDescription,
          aspectRatio: "9:16",
          resolution: "720p",
        });
      }
    } else {
      videoUrl = await generateVideo({
        imageBuffer: portraitBuffer,
        audioBuffer: audioSegment.byteLength > 0 ? audioSegment : fullAudioBuffer.subarray(0, 1000),
        prompt: scene.sceneDescription,
        aspectRatio: "9:16",
        resolution: "720p",
      });
    }
  } else {
    // Landscape/Transition
    const sceneRefs = await loadCharacterReferences(scene.characterId || "koda", 3);
    const prompt = `${scene.sceneDescription}. ${scene.mood || ""}. Camera: ${scene.camera || "wide"}. Smooth natural animation, warm colors.`;

    if (process.env.FAL_KEY) {
      try {
        videoUrl = await klingI2V({
          imageBuffer: sceneRefs[0],
          prompt,
          durationSeconds: 5,
          aspectRatio: "9:16",
          quality: "standard",
          characterElements: sceneRefs.length > 1 ? sceneRefs.slice(1) : undefined,
          generateAudio: !hasAudio,
        });
        console.log(`[Film] Generated landscape with Kling 3.0 (fal.ai)`);
      } catch (falErr) {
        console.warn(`[Film] fal.ai landscape failed, falling back to Hedra:`, falErr);
        videoUrl = await generateSceneVideo({
          imageBuffer: sceneRefs[0],
          prompt,
          aspectRatio: "9:16",
          resolution: "720p",
          referenceImages: sceneRefs.length > 1 ? sceneRefs.slice(1) : undefined,
        });
      }
    } else {
      videoUrl = await generateSceneVideo({
        imageBuffer: sceneRefs[0],
        prompt,
        aspectRatio: "9:16",
        resolution: "720p",
        referenceImages: sceneRefs.length > 1 ? sceneRefs.slice(1) : undefined,
      });
    }
  }

  // Download and store
  const videoBuffer = videoUrl.includes("fal.media") || videoUrl.includes("fal.run")
    ? await downloadFalVideo(videoUrl)
    : await downloadHedraVideo(videoUrl);
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

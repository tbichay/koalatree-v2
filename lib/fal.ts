/**
 * fal.ai API Integration — Kling LipSync + Kling 3.0 I2V
 *
 * Used for:
 * - Standard quality lip-sync ($0.014/s via Kling LipSync)
 * - Kling Avatar v2 Pro lip-sync ($0.115/s)
 * - Kling 3.0 Image-to-Video for landscape scenes
 */

import { fal } from "@fal-ai/client";

const POLL_TIMEOUT = 600000; // 10 minutes

function ensureConfigured() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  fal.config({ credentials: key });
}

// ── File Upload Helper ─────────────────────────────────────────────

export async function uploadToFal(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  ensureConfigured();
  const file = new File([new Uint8Array(buffer)], filename, { type: contentType });
  const url = await fal.storage.upload(file);
  return url;
}

// ── WAV Helper ─────────────────────────────────────────────────────

function wrapAsWav(pcmData: Buffer, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM format chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

// ── Run Helper (subscribe with timeout) ────────────────────────────

async function runFal<T>(modelId: string, input: Record<string, unknown>): Promise<T> {
  ensureConfigured();
  console.log(`[fal.ai] Starting ${modelId}...`);

  try {
    const result = await fal.subscribe(modelId, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        console.log(`[fal.ai] ${modelId}: ${update.status}`);
      },
    });

    return result.data as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const body = (err as { body?: unknown })?.body;
    const detail = body ? JSON.stringify(body).substring(0, 300) : "";
    console.error(`[fal.ai] ${modelId} failed:`, msg, detail ? `Body: ${detail}` : "");
    throw new Error(`fal.ai ${modelId}: ${msg}${detail ? ` (${detail})` : ""}`);
  }
}

// ── Kling LipSync ($0.014/s) ───────────────────────────────────────

interface LipSyncResult {
  video: { url: string; content_type: string; file_size: number };
}

/**
 * Apply lip-sync to a video using Kling LipSync.
 * Takes an existing VIDEO + audio and syncs the mouth movements.
 * This is the cheapest lip-sync option at $0.014/s.
 */
export async function klingLipSync(
  videoBuffer: Buffer,
  audioBuffer: Buffer,
): Promise<string> {
  console.log("[fal.ai] Kling LipSync: uploading video + audio...");

  const videoUrl = await uploadToFal(videoBuffer, "scene.mp4", "video/mp4");
  const audioUrl = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");

  const result = await runFal<LipSyncResult>(
    "fal-ai/kling-video/lipsync/audio-to-video",
    { video_url: videoUrl, audio_url: audioUrl },
  );

  console.log(`[fal.ai] Kling LipSync done: ${result.video.url}`);
  return result.video.url;
}

// ── Kling Avatar v2 ($0.056-0.115/s) ──────────────────────────────

interface AvatarResult {
  video: { url: string };
}

/**
 * Generate a talking avatar video from a portrait image + audio.
 * Better quality than LipSync, as it generates the full video from scratch.
 */
export async function klingAvatar(
  imageBuffer: Buffer,
  audioBuffer: Buffer,
  prompt?: string,
  quality: "standard" | "pro" = "pro",
): Promise<string> {
  const modelId = quality === "pro"
    ? "fal-ai/kling-video/ai-avatar/v2/pro"
    : "fal-ai/kling-video/ai-avatar/v2/standard";

  console.log(`[fal.ai] Kling Avatar v2 ${quality}: uploading image + audio (${(audioBuffer.byteLength / 1024).toFixed(0)}KB)...`);

  const imageUrl = await uploadToFal(imageBuffer, "portrait.png", "image/png");

  // Upload audio as MP3 — segmentMp3 guarantees valid MP3 output
  const audioUrl = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");
  console.log(`[fal.ai] Audio uploaded: ${audioUrl} (${(audioBuffer.byteLength / 1024).toFixed(0)}KB, starts with ${audioBuffer.subarray(0, 2).toString("hex")})`);

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    audio_url: audioUrl,
  };
  if (prompt) input.prompt = prompt;

  const result = await runFal<AvatarResult>(modelId, input);
  console.log(`[fal.ai] Kling Avatar v2 ${quality} done: ${result.video.url}`);
  return result.video.url;
}

// ── Kling 3.0 Image-to-Video ($0.084-0.168/s) ─────────────────────

interface I2VResult {
  video: { url: string };
}

interface KlingElement {
  frontal_image_url: string;
  reference_image_urls?: string[];
}

interface KlingI2VOptions {
  imageBuffer: Buffer;
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  quality?: "standard" | "pro";
  /** End frame image — Kling morphs from start to end, creating smooth transitions */
  endImageBuffer?: Buffer;
  /** Character reference images for Element Binding (@Element1 in prompt) */
  characterElements?: Buffer[];
  /** Generate native audio (ambient sounds) */
  generateAudio?: boolean;
}

/**
 * Generate an animated video from a still image using Kling 3.0.
 * Supports:
 * - Element Binding for character consistency (Pro)
 * - End frame for seamless transitions between scenes
 * - Native audio for ambient sounds
 */
export async function klingI2V(options: KlingI2VOptions): Promise<string> {
  const {
    imageBuffer,
    prompt,
    durationSeconds = 5,
    aspectRatio = "9:16",
    quality = "standard",
    endImageBuffer,
    characterElements,
    generateAudio = false,
  } = options;

  const modelId = quality === "pro"
    ? "fal-ai/kling-video/v3/pro/image-to-video"
    : "fal-ai/kling-video/v3/standard/image-to-video";

  console.log(`[fal.ai] Kling 3.0 ${quality} I2V: uploading...`);

  const startImageUrl = await uploadToFal(imageBuffer, "start.png", "image/png");

  const input: Record<string, unknown> = {
    start_image_url: startImageUrl,
    prompt,
    duration: durationSeconds,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
  };

  // End frame for smooth transitions
  if (endImageBuffer) {
    input.end_image_url = await uploadToFal(endImageBuffer, "end.png", "image/png");
    console.log(`[fal.ai] End frame uploaded for transition`);
  }

  // Character elements for consistency (Pro only)
  // Kling Pro requires BOTH frontal_image_url AND reference_image_urls
  if (characterElements && characterElements.length > 0 && quality === "pro") {
    const elements: KlingElement[] = [];
    for (let i = 0; i < Math.min(characterElements.length, 4); i++) {
      const url = await uploadToFal(characterElements[i], `element-${i}.png`, "image/png");
      elements.push({
        frontal_image_url: url,
        reference_image_urls: [url], // Same image as reference (required by API)
      });
    }
    input.elements = elements;
    console.log(`[fal.ai] ${elements.length} character element(s) uploaded`);
  }

  const result = await runFal<I2VResult>(modelId, input);
  console.log(`[fal.ai] Kling 3.0 ${quality} I2V done: ${result.video.url}`);
  return result.video.url;
}

/**
 * Generate a sequence of visually consistent scenes using Kling 3.0.
 * Each scene uses the previous scene's end frame as its start frame,
 * creating seamless transitions.
 *
 * @param scenes - Array of { imageBuffer, prompt, durationSeconds }
 * @param characterRefs - Character reference images used across all scenes
 * @returns Array of video URLs
 */
export async function klingMultiScene(
  scenes: Array<{
    imageBuffer: Buffer;
    prompt: string;
    durationSeconds?: number;
  }>,
  characterRefs?: Buffer[],
  aspectRatio: "16:9" | "9:16" | "1:1" = "9:16",
): Promise<string[]> {
  const videoUrls: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const prevScene = i > 0 ? scenes[i] : undefined;

    console.log(`[fal.ai] Multi-scene ${i + 1}/${scenes.length}: ${scene.prompt.substring(0, 50)}...`);

    // Use previous scene's start image as context (the end frame would be ideal
    // but we don't extract it — the start image provides visual continuity)
    const url = await klingI2V({
      imageBuffer: scene.imageBuffer,
      prompt: scene.prompt,
      durationSeconds: scene.durationSeconds || 5,
      aspectRatio,
      quality: "pro",
      characterElements: characterRefs,
      generateAudio: true,
    });

    videoUrls.push(url);
  }

  return videoUrls;
}

// ── Frame Extraction ($0.0002/s — practically free) ────────────────

interface FrameResult {
  images: Array<{ url: string; content_type: string }>;
}

/**
 * Extract the last frame from a video using fal.ai's ffmpeg API.
 * Returns the frame image as a Buffer (PNG).
 * Cost: ~$0.0002 per video second = practically free.
 */
export async function extractLastFrame(videoUrl: string): Promise<Buffer> {
  ensureConfigured();
  console.log(`[fal.ai] Extracting last frame from video...`);

  const result = await runFal<FrameResult>("fal-ai/ffmpeg-api/extract-frame", {
    video_url: videoUrl,
    frame_type: "last",
  });

  if (!result.images || result.images.length === 0) {
    throw new Error("No frame extracted");
  }

  const frameUrl = result.images[0].url;
  console.log(`[fal.ai] Last frame extracted: ${frameUrl}`);

  const res = await fetch(frameUrl);
  if (!res.ok) throw new Error(`Failed to download frame: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Download Helper ────────────────────────────────────────────────

export async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

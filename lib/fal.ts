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

// Cache uploaded URLs with timestamp — URLs expire after ~10 minutes
const uploadCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (conservative, URLs last ~10min)

function bufferHash(buffer: Buffer): string {
  return `${buffer.subarray(0, 32).toString("hex")}_${buffer.byteLength}`;
}

export async function uploadToFal(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  const hash = bufferHash(buffer);
  const cached = uploadCache.get(hash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[fal.ai] Using cached upload for ${filename} (${((Date.now() - cached.timestamp) / 1000).toFixed(0)}s old)`);
    return cached.url;
  }
  ensureConfigured();
  const file = new File([new Uint8Array(buffer)], filename, { type: contentType });
  const url = await fal.storage.upload(file);
  uploadCache.set(hash, { url, timestamp: Date.now() });
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
    negative_prompt: "text, subtitles, captions, words, letters, writing, watermark",
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
    negative_prompt: "text, subtitles, captions, titles, words, letters, writing, watermark, logo, text overlay, text morphing, speech bubble, extra fingers, deformed hands, duplicate limbs, blurry, low quality, static frozen pose",
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

// ── VEED Fabric 1.0 — Image + Audio → Lip-Sync Video ($0.08-0.15/s) ──

interface FabricResult {
  video: { url: string };
}

/**
 * Generate a talking video from portrait + audio using VEED Fabric 1.0.
 * Single API call with lip-sync — no separate LipSync step needed.
 * Preserves cartoon/illustrated style faithfully.
 *
 * KEY ADVANTAGE: Accepts ANY image (not just portrait) as start frame.
 * So we can pass the last frame from the previous clip → seamless transition.
 *
 * Cost: $0.08/s (480p), $0.15/s (720p)
 */
export async function fabricDialog(
  imageBuffer: Buffer,
  audioBuffer: Buffer,
  resolution: "480p" | "720p" = "480p",
): Promise<string> {
  console.log(`[fal.ai] VEED Fabric 1.0: uploading image + audio (${resolution})...`);

  const imageUrl = await uploadToFal(imageBuffer, "frame.png", "image/png");
  const audioUrl = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");

  const result = await runFal<FabricResult>("veed/fabric-1.0", {
    image_url: imageUrl,
    audio_url: audioUrl,
    resolution,
  });

  console.log(`[fal.ai] VEED Fabric done: ${result.video.url}`);
  return result.video.url;
}

// ── Seedance 1.5 Pro Image-to-Video ($0.26/5s) ────────────────────

interface SeedanceResult {
  video: { url: string };
  seed: number;
}

/**
 * Generate a video from a still image using Seedance 1.5 Pro.
 * Produces native audio (ambient sounds, foley) but NOT custom voice.
 * For lip-sync with custom audio, combine with klingLipSync().
 *
 * Cost: ~$0.26 per 5s clip (720p with audio)
 * Much cheaper than Kling Avatar ($0.60) or Kling 3.0 Pro ($0.97)
 */
export async function seedanceI2V(options: {
  imageBuffer: Buffer;
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  endImageBuffer?: Buffer;
  generateAudio?: boolean;
}): Promise<string> {
  const {
    imageBuffer,
    prompt,
    durationSeconds = 5,
    aspectRatio = "9:16",
    endImageBuffer,
    generateAudio = true,
  } = options;

  console.log(`[fal.ai] Seedance 1.5 Pro I2V: uploading...`);

  const imageUrl = await uploadToFal(imageBuffer, "start.png", "image/png");

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    prompt,
    duration: Math.min(12, Math.max(4, durationSeconds)),
    aspect_ratio: aspectRatio,
    resolution: "720p",
    generate_audio: generateAudio,
  };

  if (endImageBuffer) {
    input.end_image_url = await uploadToFal(endImageBuffer, "end.png", "image/png");
    console.log(`[fal.ai] Seedance end frame uploaded`);
  }

  const result = await runFal<SeedanceResult>("fal-ai/bytedance/seedance/v1.5/pro/image-to-video", input);
  console.log(`[fal.ai] Seedance 1.5 done: ${result.video.url}`);
  return result.video.url;
}

/**
 * Generate a dialog clip using Seedance 1.5 + Kling LipSync.
 * 1. Seedance generates video from portrait (~$0.26)
 * 2. Kling LipSync syncs our audio onto it (~$0.07)
 * Total: ~$0.33 per 5s clip (vs $0.60 with Kling Avatar)
 */
export async function seedanceDialog(
  imageBuffer: Buffer,
  audioBuffer: Buffer,
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "9:16",
): Promise<string> {
  console.log(`[fal.ai] Seedance Dialog: generating video + lip-sync...`);

  // 1. Generate video from portrait (no audio — Seedance generates its own)
  const videoUrl = await seedanceI2V({
    imageBuffer,
    prompt: `${prompt}. Character speaking naturally with expressive gestures.`,
    durationSeconds: 5,
    aspectRatio,
    generateAudio: false, // We'll add our own audio via LipSync
  });

  // 2. Download the video
  const videoBuffer = await downloadVideo(videoUrl);

  // 3. Apply our audio via Kling LipSync
  const lipSyncUrl = await klingLipSync(videoBuffer, audioBuffer);
  console.log(`[fal.ai] Seedance Dialog done with lip-sync`);

  return lipSyncUrl;
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

// ── Seedance 2.0 — Native Lip-Sync ───────────────────────────────

/**
 * Seedance 2.0 Image-to-Video with native lip-sync.
 * Accepts audio input for phoneme-level lip-sync in 8+ languages.
 * Cost: ~$0.30/s (720p) — higher than 1.5 but with built-in lip-sync.
 */
export async function seedance2I2V(options: {
  imageBuffer: Buffer;
  prompt: string;
  audioBuffer?: Buffer;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  endImageBuffer?: Buffer;
  generateAudio?: boolean;
}): Promise<string> {
  const {
    imageBuffer, prompt, audioBuffer,
    durationSeconds = 5, aspectRatio = "9:16",
    endImageBuffer, generateAudio = false,
  } = options;

  ensureConfigured();
  console.log(`[fal.ai] Seedance 2.0 I2V: uploading...`);

  const imageUrl = await uploadToFal(imageBuffer, "start.png", "image/png");
  const input: Record<string, unknown> = {
    image_url: imageUrl,
    prompt,
    duration: Math.min(15, Math.max(4, durationSeconds)),
    aspect_ratio: aspectRatio,
    resolution: "720p",
    generate_audio: generateAudio,
  };

  if (audioBuffer && audioBuffer.byteLength > 0) {
    input.audio_url = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");
    input.generate_audio = false; // Use provided audio for lip-sync
    console.log(`[fal.ai] Seedance 2.0 audio uploaded for lip-sync`);
  }

  if (endImageBuffer) {
    input.end_image_url = await uploadToFal(endImageBuffer, "end.png", "image/png");
  }

  const result = await runFal<SeedanceResult>("bytedance/seedance-2.0/image-to-video", input);
  console.log(`[fal.ai] Seedance 2.0 done: ${result.video.url}`);
  return result.video.url;
}

/**
 * Seedance 2.0 Reference-to-Video.
 * Uses a reference image for character consistency across clips.
 */
export async function seedance2Ref(options: {
  referenceBuffer: Buffer;
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}): Promise<string> {
  const { referenceBuffer, prompt, durationSeconds = 5, aspectRatio = "9:16" } = options;

  ensureConfigured();
  console.log(`[fal.ai] Seedance 2.0 Reference-to-Video...`);

  const refUrl = await uploadToFal(referenceBuffer, "ref.png", "image/png");
  const result = await runFal<SeedanceResult>("bytedance/seedance-2.0/reference-to-video", {
    reference_image_url: refUrl,
    prompt,
    duration: Math.min(15, Math.max(4, durationSeconds)),
    aspect_ratio: aspectRatio,
    resolution: "720p",
  });

  console.log(`[fal.ai] Seedance 2.0 ref done: ${result.video.url}`);
  return result.video.url;
}

// ── Kling O3 (Omni) — Multi-Shot + Longer Clips ($0.084-0.168/s) ──

interface KlingO3Options {
  /** Start frame image */
  imageBuffer: Buffer;
  /** Main prompt describing the scene */
  prompt: string;
  /** Duration 3-15s (longer than v3!) */
  durationSeconds?: number;
  /** Multi-shot prompts — each describes a different shot/angle within the video */
  multiPrompt?: string[];
  /** Shot type hint (close-up, wide, etc.) */
  shotType?: string;
  /** End frame for smooth transitions */
  endImageBuffer?: Buffer;
  /** Generate native ambient audio */
  generateAudio?: boolean;
  /** Negative prompt */
  negativePrompt?: string;
  /** CFG scale (guidance strength) */
  cfgScale?: number;
  /** Character reference elements for consistency */
  characterElements?: Buffer[];
}

/**
 * Generate video using Kling O3 (Omni) Standard.
 *
 * Key advantages over Kling v3:
 * - Longer clips: 3-15s (vs 1-10s)
 * - Multi-shot support via multi_prompt (multiple shots in one video!)
 * - Better character consistency
 * - generate_audio for native ambient sounds
 *
 * Model: fal-ai/kling-video/o3/standard/image-to-video
 * Cost: Similar to Kling v3 standard (~$0.084/s)
 */
export async function klingO3(options: KlingO3Options): Promise<string> {
  const {
    imageBuffer,
    prompt,
    durationSeconds = 5,
    multiPrompt,
    shotType,
    endImageBuffer,
    generateAudio = false,
    negativePrompt,
    cfgScale,
    characterElements,
  } = options;

  const modelId = "fal-ai/kling-video/o3/standard/image-to-video";
  console.log(`[fal.ai] Kling O3 Standard: uploading... (duration: ${durationSeconds}s, shots: ${multiPrompt?.length || 1})`);

  const imageUrl = await uploadToFal(imageBuffer, "start.png", "image/png");

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    prompt,
    negative_prompt: negativePrompt || "text, subtitles, captions, titles, words, letters, writing, watermark, logo, text overlay, speech bubble, extra fingers, deformed hands, duplicate limbs, blurry, low quality, static frozen pose, morphing tree roots, moving rocks, melting structures, face on tree, anthropomorphic tree, tree with eyes, tree with hands",
    duration: Math.min(15, Math.max(3, durationSeconds)),
    generate_audio: generateAudio,
  };

  // Multi-shot prompts (key O3 feature!)
  if (multiPrompt && multiPrompt.length > 0) {
    input.multi_prompt = multiPrompt;
    console.log(`[fal.ai] O3 multi_prompt: ${multiPrompt.length} shots`);
  }

  // Shot type hint
  if (shotType) {
    input.shot_type = shotType;
  }

  // End frame for transitions
  if (endImageBuffer) {
    input.end_image_url = await uploadToFal(endImageBuffer, "end.png", "image/png");
    console.log(`[fal.ai] O3 end frame uploaded`);
  }

  // CFG scale
  if (cfgScale !== undefined) {
    input.cfg_scale = cfgScale;
  }

  // Character elements for consistency
  if (characterElements && characterElements.length > 0) {
    const elements: KlingElement[] = [];
    for (let i = 0; i < Math.min(characterElements.length, 4); i++) {
      const url = await uploadToFal(characterElements[i], `element-${i}.png`, "image/png");
      elements.push({
        frontal_image_url: url,
        reference_image_urls: [url],
      });
    }
    input.elements = elements;
    console.log(`[fal.ai] O3 ${elements.length} character element(s) uploaded`);
  }

  const result = await runFal<I2VResult>(modelId, input);
  console.log(`[fal.ai] Kling O3 Standard done: ${result.video.url}`);
  return result.video.url;
}

// ── Flux Kontext Pro — Character-Consistent Scene Generation ($0.04/img) ──

interface FluxKontextResult {
  images: Array<{ url: string; width: number; height: number; content_type: string }>;
  seed: number;
}

interface FluxKontextOptions {
  /** Reference image (character portrait) — identity will be preserved */
  imageBuffer: Buffer;
  /** Scene description — what to generate with this character */
  prompt: string;
  /** Aspect ratio */
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Generate a scene with a character using Flux Kontext Pro.
 *
 * KEY ADVANTAGE: Maintains character identity (face, hair, body) across
 * completely different scenes. Perfect for storyboard frames.
 *
 * Takes a character portrait → generates a new scene with the SAME person.
 * Cost: $0.04 per image (same as GPT-Image).
 *
 * Model: fal-ai/flux-pro/kontext
 */
export async function fluxKontext(options: FluxKontextOptions): Promise<{ url: string; width: number; height: number }> {
  const { imageBuffer, prompt, aspectRatio = "16:9", seed } = options;

  console.log(`[fal.ai] Flux Kontext Pro: uploading reference + generating scene...`);
  const imageUrl = await uploadToFal(imageBuffer, "reference.png", "image/png");

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    prompt,
    aspect_ratio: aspectRatio,
  };
  if (seed !== undefined) input.seed = seed;

  const result = await runFal<FluxKontextResult>("fal-ai/flux-pro/kontext", input);

  if (!result.images || result.images.length === 0) {
    throw new Error("Flux Kontext: no image generated");
  }

  const img = result.images[0];
  console.log(`[fal.ai] Flux Kontext done: ${img.url} (${img.width}x${img.height})`);
  return { url: img.url, width: img.width, height: img.height };
}

// ── Nano Banana Pro Edit — Multi-Ref Character-Consistent Edit ($0.15/img) ──

interface NanoBananaProResult {
  images: Array<{ url: string; width?: number; height?: number; content_type?: string }>;
  description?: string;
}

interface NanoBananaProEditOptions {
  /**
   * Reference images (1-N). First image is the "subject"; weiter Referenzen
   * dienen als Kontext (Location-Foto, Outfit, Character-Sheets).
   * Nano Banana Pro kombiniert die Referenzen und haelt die Charakter-
   * Identitaet konsistent (Best-in-Class 2026).
   */
  imageBuffers: Buffer[];
  /**
   * Edit prompt. Beschreibt WAS geaendert werden soll. Der Anti-Drift-
   * Pattern lautet: "change ONLY the background/pose, keep everything else
   * identical". Wird vom Caller gebaut.
   */
  prompt: string;
  /** Aspect ratio for the output image */
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  /** Number of images to generate (default 1 — fuer sequential candidates) */
  numImages?: number;
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Nano Banana Pro (Gemini 3 Pro Image) — Multi-Reference Character-ID Edit.
 *
 * KEY ADVANTAGE ueber Flux Kontext Pro: Nano Banana Pro bewahrt Charakter-
 * Identitaet auch bei stilisierten 3D-Cartoon-Charakteren (5/5 vs Flux 3/5).
 * Flux Kontext drifted zu photoreal — Nano Banana Pro respektiert den Style.
 *
 * Use-case in KoalaTree: Scene-Anchor-Image-Generation. Nimmt Portrait +
 * Location-Foto + Character-Sheets (front/profile/fullBody) als Refs und
 * generiert ein Setup-Bild: "Koda sitzt vor dem KoalaTree, frontal, Mund
 * neutral, bereit fuer Lip-Sync". User approbiert das Bild einmal (Pre-Production),
 * Cron nutzt es als imageSource beim Clip-Rendering (Production).
 *
 * Model: fal-ai/nano-banana-pro/edit
 * Cost: $0.15 per generated image
 */
export async function nanoBananaProEdit(
  options: NanoBananaProEditOptions,
): Promise<{ url: string; width?: number; height?: number }> {
  const { imageBuffers, prompt, aspectRatio = "9:16", numImages = 1, seed } = options;

  if (!imageBuffers.length) throw new Error("nanoBananaProEdit: no reference images");

  console.log(`[fal.ai] Nano Banana Pro Edit: uploading ${imageBuffers.length} refs + generating...`);
  const imageUrls = await Promise.all(
    imageBuffers.map((buf, i) => uploadToFal(buf, `nbp-ref-${i}.png`, "image/png")),
  );

  const input: Record<string, unknown> = {
    prompt,
    image_urls: imageUrls,
    aspect_ratio: aspectRatio,
    num_images: numImages,
  };
  if (seed !== undefined) input.seed = seed;

  const result = await runFal<NanoBananaProResult>("fal-ai/nano-banana-pro/edit", input);

  if (!result.images || result.images.length === 0) {
    throw new Error("Nano Banana Pro Edit: no image generated");
  }

  const img = result.images[0];
  console.log(`[fal.ai] Nano Banana Pro Edit done: ${img.url}`);
  return { url: img.url, width: img.width, height: img.height };
}

// ── Download Helper ────────────────────────────────────────────────

export async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Sync Labs sync-3 ($0.133/s) ────────────────────────────────────

interface SyncV3Result {
  video: { url: string; content_type?: string; file_size?: number };
}

/**
 * Sync Labs sync-3 — global-context lip-sync post-processing.
 * Unlike chunk-based inpainters (Kling LipSync, Wav2Lip), sync-3 builds a
 * shot-wide identity prior and generates all frames jointly → no chunk flicker.
 * 4K native, handles profile angles and partial occlusions.
 *
 * Model: fal-ai/sync-lipsync/v3
 * Cost: $0.133/s
 */
export async function syncLipsyncV3(
  videoBuffer: Buffer,
  audioBuffer: Buffer,
  syncMode: "cut_off" | "loop" | "bounce" | "silence" | "remap" = "cut_off",
): Promise<string> {
  console.log("[fal.ai] Sync v3: uploading video + audio...");

  const videoUrl = await uploadToFal(videoBuffer, "scene.mp4", "video/mp4");
  const audioUrl = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");

  const result = await runFal<SyncV3Result>(
    "fal-ai/sync-lipsync/v3",
    { video_url: videoUrl, audio_url: audioUrl, sync_mode: syncMode },
  );

  console.log(`[fal.ai] Sync v3 done: ${result.video.url}`);
  return result.video.url;
}

// ── ByteDance OmniHuman 1.5 ($0.16/s, talking head from portrait + audio) ──

interface OmniHumanResult {
  video: { url: string };
  duration?: number;
}

/**
 * ByteDance OmniHuman 1.5 — portrait + audio → full talking head video.
 * Regenerates the entire face coherently per shot (Camp B), no chunk flicker.
 * Up to 30s @1080p, 60s @720p. Handles body + gesture + lip-sync.
 *
 * Model: fal-ai/bytedance/omnihuman/v1.5
 */
export async function omniHuman15(options: {
  imageBuffer: Buffer;
  audioBuffer: Buffer;
  prompt?: string;
  resolution?: "720p" | "1080p";
  turboMode?: boolean;
}): Promise<string> {
  const { imageBuffer, audioBuffer, prompt, resolution = "1080p", turboMode } = options;

  console.log(`[fal.ai] OmniHuman 1.5: uploading portrait + audio (${resolution})...`);

  const imageUrl = await uploadToFal(imageBuffer, "portrait.png", "image/png");
  const audioUrl = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    audio_url: audioUrl,
    resolution,
  };
  if (prompt) input.prompt = prompt;
  if (turboMode) input.turbo_mode = true;

  const result = await runFal<OmniHumanResult>("fal-ai/bytedance/omnihuman/v1.5", input);
  console.log(`[fal.ai] OmniHuman 1.5 done: ${result.video.url}`);
  return result.video.url;
}

// ── Seedance 2.0 Reference-to-Video (multimodal: images + audio + prompt) ──

interface Seedance2Result {
  video: { url: string; content_type?: string; file_size?: number };
  seed?: number;
}

/**
 * ByteDance Seedance 2.0 Reference-to-Video — one-call multimodal generator.
 * Accepts up to 9 reference images + 3 reference audio clips + prompt.
 * References are addressed in prompt as @Image1, @Image2, @Audio1 etc.
 * Native audio output with lip-sync, cinematic camera control, multi-shot.
 *
 * Model: bytedance/seedance-2.0/reference-to-video
 * Constraints: images up to 30MB each, audio max 15s combined (15MB each),
 *              max 15s output duration.
 */
export async function seedance2RefToVideo(options: {
  prompt: string;
  imageBuffers?: Buffer[];
  audioBuffers?: Buffer[];
  videoBuffers?: Buffer[];
  resolution?: "480p" | "720p";
  duration?: number | "auto";
  aspectRatio?: "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  generateAudio?: boolean;
  seed?: number;
}): Promise<string> {
  const {
    prompt,
    imageBuffers = [],
    audioBuffers = [],
    videoBuffers = [],
    resolution = "720p",
    duration = "auto",
    aspectRatio = "auto",
    generateAudio = true,
    seed,
  } = options;

  if (imageBuffers.length > 9) throw new Error("Seedance 2.0: max 9 images");
  if (audioBuffers.length > 3) throw new Error("Seedance 2.0: max 3 audio clips");
  if (videoBuffers.length > 3) throw new Error("Seedance 2.0: max 3 video clips");

  console.log(`[fal.ai] Seedance 2.0 ref-to-video: uploading ${imageBuffers.length} imgs + ${audioBuffers.length} audio + ${videoBuffers.length} vids...`);

  const imageUrls = await Promise.all(
    imageBuffers.map((buf, i) => uploadToFal(buf, `ref-image-${i}.png`, "image/png")),
  );
  const audioUrls = await Promise.all(
    audioBuffers.map((buf, i) => uploadToFal(buf, `ref-audio-${i}.mp3`, "audio/mpeg")),
  );
  const videoUrls = await Promise.all(
    videoBuffers.map((buf, i) => uploadToFal(buf, `ref-video-${i}.mp4`, "video/mp4")),
  );

  const input: Record<string, unknown> = {
    prompt,
    resolution,
    duration,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
  };
  if (imageUrls.length) input.image_urls = imageUrls;
  if (audioUrls.length) input.audio_urls = audioUrls;
  if (videoUrls.length) input.video_urls = videoUrls;
  if (seed !== undefined) input.seed = seed;

  const result = await runFal<Seedance2Result>(
    "bytedance/seedance-2.0/reference-to-video",
    input,
  );
  console.log(`[fal.ai] Seedance 2.0 done: ${result.video.url}`);
  return result.video.url;
}

// ── Wan 2.7 Image-to-Video ($0.10/s, native audio-driven lip-sync) ──

interface Wan27Result {
  video: { url: string; content_type?: string; file_size?: number; duration?: number };
  seed?: number;
  actual_prompt?: string;
}

/**
 * Alibaba Wan 2.7 Image-to-Video via fal.ai.
 *
 * KEY FEATURES for KoalaTree:
 * - `image_url` (start) + `end_image_url` (end) → SEAMLESS chains by passing
 *   last frame of previous clip as start of the next.
 * - `audio_url` (MP3/WAV, 2–30s, max 15MB) → native audio-driven lip-sync
 *   in a SINGLE call (no separate lip-sync pass needed). Language-agnostic,
 *   so German ElevenLabs voice works directly (H8 satisfied).
 * - Duration enum: 2,3,...,15 seconds (longer than Seedance 1.5's 12s cap).
 * - 720p or 1080p. Aspect ratio derives from the input image.
 * - Apache 2.0 upstream license — commercial use via fal.ai subscription.
 *
 * Model: fal-ai/wan/v2.7/image-to-video
 * Cost: $0.10 per second of output
 */
export async function wan27I2V(options: {
  imageBuffer: Buffer;
  prompt: string;
  /** Optional: last-frame image to constrain the final frame (seamless chains) */
  endImageBuffer?: Buffer;
  /** Optional: audio for native lip-sync (MP3/WAV, 2–30s, max 15MB) */
  audioBuffer?: Buffer;
  /** Optional: reference video to transfer motion (MP4/MOV, 2–10s, max 100MB) */
  videoBuffer?: Buffer;
  /** Clip length in seconds. Clamped to the [2,15] enum; fractional values are rounded up. */
  durationSeconds?: number;
  resolution?: "720p" | "1080p";
  negativePrompt?: string;
  seed?: number;
  /** fal.ai default is true; we usually keep it on unless testing bypass. */
  enableSafetyChecker?: boolean;
  /** fal.ai default is true (prompt gets rewritten). Disable for exact-prompt tests. */
  enablePromptExpansion?: boolean;
}): Promise<{ url: string; actualPrompt?: string; seed?: number }> {
  const {
    imageBuffer,
    prompt,
    endImageBuffer,
    audioBuffer,
    videoBuffer,
    durationSeconds = 5,
    resolution = "1080p",
    negativePrompt,
    seed,
    enableSafetyChecker,
    enablePromptExpansion,
  } = options;

  // Duration must match the enum exactly — clamp and round up.
  const durClamped = Math.min(15, Math.max(2, Math.ceil(durationSeconds)));

  console.log(
    `[fal.ai] Wan 2.7 I2V: uploading ` +
    `(start, end=${!!endImageBuffer}, audio=${!!audioBuffer}, ` +
    `video=${!!videoBuffer}, ${durClamped}s, ${resolution})...`,
  );

  const imageUrl = await uploadToFal(imageBuffer, "start.png", "image/png");

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    prompt,
    duration: durClamped, // integer enum (2..15), not string
    resolution,
  };

  if (endImageBuffer) {
    input.end_image_url = await uploadToFal(endImageBuffer, "end.png", "image/png");
    console.log(`[fal.ai] Wan 2.7 end frame uploaded (seamless chain)`);
  }

  if (audioBuffer && audioBuffer.byteLength > 0) {
    if (audioBuffer.byteLength > 15 * 1024 * 1024) {
      throw new Error(`Wan 2.7 audio too large (${audioBuffer.byteLength} bytes, max 15MB)`);
    }
    input.audio_url = await uploadToFal(audioBuffer, "audio.mp3", "audio/mpeg");
    console.log(`[fal.ai] Wan 2.7 audio uploaded (${(audioBuffer.byteLength / 1024).toFixed(0)}KB) for lip-sync`);
  }

  if (videoBuffer && videoBuffer.byteLength > 0) {
    input.video_url = await uploadToFal(videoBuffer, "ref.mp4", "video/mp4");
  }

  if (negativePrompt) input.negative_prompt = negativePrompt;
  if (seed !== undefined) input.seed = seed;
  if (enableSafetyChecker !== undefined) input.enable_safety_checker = enableSafetyChecker;
  if (enablePromptExpansion !== undefined) input.enable_prompt_expansion = enablePromptExpansion;

  const result = await runFal<Wan27Result>("fal-ai/wan/v2.7/image-to-video", input);
  console.log(`[fal.ai] Wan 2.7 I2V done: ${result.video.url}`);
  return {
    url: result.video.url,
    actualPrompt: result.actual_prompt,
    seed: result.seed,
  };
}

// ── Wan 2.7 Reference-to-Video ($0.10/s, multi-ref character+object binding) ──

/**
 * Wan 2.7 Reference-to-Video.
 * Accepts multiple reference images (character sheets + props + locations)
 * and/or reference videos (motion transfer). NO audio input — for lip-sync
 * pair with a downstream lip-sync pass (e.g. syncLipsyncV3) or use wan27I2V
 * which DOES accept audio_url.
 *
 * Model: fal-ai/wan/v2.7/reference-to-video
 * Cost: $0.10 per second of output
 */
export async function wan27RefToVideo(options: {
  prompt: string;
  referenceImageBuffers?: Buffer[];
  referenceVideoBuffers?: Buffer[];
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  /** Clip length in seconds. Clamped to [2,10] for this endpoint. */
  durationSeconds?: number;
  resolution?: "720p" | "1080p";
  negativePrompt?: string;
  /** Let Wan split the prompt into multiple shots automatically */
  multiShots?: boolean;
  seed?: number;
  enableSafetyChecker?: boolean;
}): Promise<{ url: string; seed?: number }> {
  const {
    prompt,
    referenceImageBuffers = [],
    referenceVideoBuffers = [],
    aspectRatio = "9:16",
    durationSeconds = 5,
    resolution = "1080p",
    negativePrompt,
    multiShots,
    seed,
    enableSafetyChecker,
  } = options;

  const durClamped = Math.min(10, Math.max(2, Math.ceil(durationSeconds)));

  console.log(
    `[fal.ai] Wan 2.7 Ref-to-Video: ${referenceImageBuffers.length} imgs + ` +
    `${referenceVideoBuffers.length} vids, ${durClamped}s, ${aspectRatio}, ${resolution}`,
  );

  const referenceImageUrls = await Promise.all(
    referenceImageBuffers.map((buf, i) => uploadToFal(buf, `ref-img-${i}.png`, "image/png")),
  );
  const referenceVideoUrls = await Promise.all(
    referenceVideoBuffers.map((buf, i) => uploadToFal(buf, `ref-vid-${i}.mp4`, "video/mp4")),
  );

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    duration: durClamped,
    resolution,
  };

  if (referenceImageUrls.length) input.reference_image_urls = referenceImageUrls;
  if (referenceVideoUrls.length) input.reference_video_urls = referenceVideoUrls;
  if (negativePrompt) input.negative_prompt = negativePrompt;
  if (multiShots !== undefined) input.multi_shots = multiShots;
  if (seed !== undefined) input.seed = seed;
  if (enableSafetyChecker !== undefined) input.enable_safety_checker = enableSafetyChecker;

  const result = await runFal<Wan27Result>("fal-ai/wan/v2.7/reference-to-video", input);
  console.log(`[fal.ai] Wan 2.7 Ref-to-Video done: ${result.video.url}`);
  return {
    url: result.video.url,
    seed: result.seed,
  };
}

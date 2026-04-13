/**
 * Runway ML API Client — Complete Video Generation Suite
 *
 * Features:
 * - Image-to-Video (Gen-4 Turbo $0.05/s, Gen-4.5 $0.12/s)
 * - Camera Motion Control (6 axes, -10 to +10)
 * - Character Reference Images (up to 3)
 * - Lip-Sync from Audio + Portrait
 * - Text-to-Video
 *
 * All generation is async: submit task → poll → get result.
 */

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

function getApiKey(): string {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error("RUNWAY_API_KEY is not set");
  return key;
}

// ── Types ──────────────────────────────────────────────────────

interface RunwayTask {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  output?: string[];
  failure?: string;
}

/** Camera motion control — 6 axes, each -10 to +10 */
export interface RunwayCameraMotion {
  /** Truck left (-) / right (+) */
  horizontal?: number;
  /** Pedestal down (-) / up (+) */
  vertical?: number;
  /** Rotate camera left (-) / right (+) */
  pan?: number;
  /** Tilt camera down (-) / up (+) */
  tilt?: number;
  /** Zoom out (-) / in (+) */
  zoom?: number;
  /** Dutch angle left (-) / right (+) */
  roll?: number;
}

export interface RunwayI2VOptions {
  /** Start image (public URL or data URI) */
  imageUrl: string;
  /** Scene description */
  prompt: string;
  /** Duration: 5 or 10 seconds */
  duration?: 5 | 10;
  /** Aspect ratio */
  ratio?: "1280:720" | "720:1280" | "960:960";
  /** Model: gen4_turbo ($0.05/s) or gen4.5 ($0.12/s) */
  model?: "gen4_turbo" | "gen4.5";
  /** Camera motion (6 axes) */
  camera?: RunwayCameraMotion;
  /** Reference images for character consistency (up to 3, as URLs or data URIs) */
  referenceImages?: Array<{ uri: string; tag?: string }>;
  /** Disable watermark */
  watermark?: boolean;
}

export interface RunwayLipSyncOptions {
  /** Portrait image (URL or data URI) */
  imageUrl: string;
  /** Audio file URL or data URI (MP3/WAV) */
  audioUrl: string;
  /** Max duration (auto-trimmed to audio length, max 45s) */
  maxDuration?: number;
}

// ── API Helpers ────────────────────────────────────────────────

async function runwayFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${RUNWAY_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "X-Runway-Version": RUNWAY_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

async function pollTask(taskId: string, timeoutMs = 600000): Promise<RunwayTask> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const res = await runwayFetch(`/tasks/${taskId}`);
    if (!res.ok) throw new Error(`Runway poll failed: ${res.status} ${await res.text()}`);

    const task: RunwayTask = await res.json();
    console.log(`[Runway] Task ${taskId}: ${task.status}`);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") throw new Error(`Runway failed: ${task.failure || "unknown"}`);

    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Runway timed out after ${timeoutMs / 1000}s`);
}

// ── Image to Video (with Camera + References) ──────────────────

/**
 * Generate video from image with full control.
 *
 * Features:
 * - Camera motion (pan, tilt, zoom, dolly, roll)
 * - Character references (up to 3 images for consistency)
 * - Gen-4 Turbo ($0.05/s) or Gen-4.5 ($0.12/s)
 */
export async function runwayI2V(options: RunwayI2VOptions): Promise<string> {
  const {
    imageUrl, prompt, duration = 5, ratio = "1280:720",
    model = "gen4_turbo", camera, referenceImages, watermark = false,
  } = options;

  const cameraStr = camera ? ` [cam: h=${camera.horizontal||0} v=${camera.vertical||0} p=${camera.pan||0} t=${camera.tilt||0} z=${camera.zoom||0}]` : "";
  console.log(`[Runway] ${model} I2V: ${prompt.slice(0, 50)}...${cameraStr} (${duration}s)`);

  const body: Record<string, unknown> = {
    model,
    promptImage: imageUrl,
    promptText: prompt,
    ratio,
    duration,
  };

  if (watermark === false) body.watermark = false;

  // Camera motion control
  if (camera) {
    const motionParams: Record<string, number> = {};
    if (camera.horizontal) motionParams.horizontal = clamp(camera.horizontal, -10, 10);
    if (camera.vertical) motionParams.vertical = clamp(camera.vertical, -10, 10);
    if (camera.pan) motionParams.pan = clamp(camera.pan, -10, 10);
    if (camera.tilt) motionParams.tilt = clamp(camera.tilt, -10, 10);
    if (camera.zoom) motionParams.zoom = clamp(camera.zoom, -10, 10);
    if (camera.roll) motionParams.roll = clamp(camera.roll, -10, 10);
    if (Object.keys(motionParams).length > 0) {
      body.motion = motionParams;
    }
  }

  // Character reference images (up to 3)
  if (referenceImages && referenceImages.length > 0) {
    body.referenceImages = referenceImages.slice(0, 3).map((ref) => ({
      uri: ref.uri,
      ...(ref.tag && { tag: ref.tag }),
    }));
    console.log(`[Runway] ${referenceImages.length} character reference(s) attached`);
  }

  const res = await runwayFetch("/image_to_video", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Runway I2V: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error("Runway: no task ID");
  console.log(`[Runway] Task: ${data.id}`);

  const task = await pollTask(data.id);
  if (!task.output?.length) throw new Error("Runway: no video output");

  console.log(`[Runway] Done: ${task.output[0]}`);
  return task.output[0];
}

// ── Lip-Sync (Portrait + Audio → Talking Video) ────────────────

/**
 * Generate a talking video from portrait + audio.
 *
 * Takes a portrait image and audio file → produces video with lip-sync.
 * Cost: $0.05/s (5 credits/sec)
 * Max duration: 45 seconds
 *
 * This replaces Kling Avatar for dialog scenes.
 */
export async function runwayLipSync(options: RunwayLipSyncOptions): Promise<string> {
  const { imageUrl, audioUrl, maxDuration = 30 } = options;

  console.log(`[Runway] Lip-Sync: portrait + audio → talking video (max ${maxDuration}s)...`);

  const body: Record<string, unknown> = {
    model: "gen4_turbo",
    promptImage: imageUrl,
    audio: audioUrl,
  };

  const res = await runwayFetch("/avatar_videos", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Runway Lip-Sync: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error("Runway Lip-Sync: no task ID");
  console.log(`[Runway] Lip-Sync task: ${data.id}`);

  const task = await pollTask(data.id);
  if (!task.output?.length) throw new Error("Runway Lip-Sync: no video output");

  console.log(`[Runway] Lip-Sync done: ${task.output[0]}`);
  return task.output[0];
}

// ── Text to Video ──────────────────────────────────────────────

export async function runwayT2V(options: {
  prompt: string;
  duration?: 5 | 10;
  ratio?: "1280:720" | "720:1280" | "960:960";
  model?: "gen4_turbo" | "gen4.5";
}): Promise<string> {
  const { prompt, duration = 5, ratio = "1280:720", model = "gen4_turbo" } = options;
  console.log(`[Runway] ${model} T2V: ${prompt.slice(0, 50)}... (${duration}s)`);

  const res = await runwayFetch("/text_to_video", {
    method: "POST",
    body: JSON.stringify({ model, promptText: prompt, ratio, duration }),
  });

  if (!res.ok) throw new Error(`Runway T2V: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const task = await pollTask(data.id);
  return task.output![0];
}

// ── Helpers ────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function bufferToDataUri(buffer: Buffer, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Map our cameraMotion values to Runway's numeric camera parameters.
 * Our values: "static", "pan-left", "pan-right", "tilt-up", "dolly-forward", etc.
 * Runway values: numeric -10 to +10 per axis.
 */
export function mapCameraMotion(motion?: string): RunwayCameraMotion | undefined {
  if (!motion || motion === "static") return undefined;

  const presets: Record<string, RunwayCameraMotion> = {
    "pan-left": { pan: -5 },
    "pan-right": { pan: 5 },
    "tilt-up": { tilt: 5 },
    "tilt-down": { tilt: -5 },
    "zoom-in": { zoom: 6 },
    "zoom-out": { zoom: -5 },
    "dolly-forward": { zoom: 4, tilt: -1 },
    "dolly-back": { zoom: -4, tilt: 1 },
    "tracking": { horizontal: 6, pan: 2 },
    "rotation": { pan: 8 },
  };

  return presets[motion] || undefined;
}

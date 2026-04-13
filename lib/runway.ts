/**
 * Runway ML API Client — Video Generation
 *
 * REST client for Runway's image-to-video API.
 * Supports Gen-4 Turbo ($0.05/s) and Gen-4.5 ($0.12/s).
 *
 * Usage:
 *   const url = await runwayI2V({ imageUrl, prompt, duration: 5 });
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
  output?: string[]; // Video URLs
  failure?: string;
  createdAt?: string;
}

interface RunwayI2VOptions {
  /** Image URL (public) or base64 data URI */
  imageUrl: string;
  /** Scene description */
  prompt: string;
  /** Video duration in seconds (5 or 10) */
  duration?: 5 | 10;
  /** Aspect ratio */
  ratio?: "1280:720" | "720:1280" | "960:960";
  /** Model: gen4_turbo (cheap, $0.05/s) or gen4.5 (quality, $0.12/s) */
  model?: "gen4_turbo" | "gen4.5";
  /** Disable watermark (requires paid plan) */
  watermark?: boolean;
}

// ── API Helpers ────────────────────────────────────────────────

async function runwayFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${RUNWAY_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "X-Runway-Version": RUNWAY_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res;
}

async function pollTask(taskId: string, timeoutMs = 300000): Promise<RunwayTask> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const res = await runwayFetch(`/tasks/${taskId}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Runway task poll failed: ${res.status} ${body}`);
    }

    const task: RunwayTask = await res.json();
    console.log(`[Runway] Task ${taskId}: ${task.status}`);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") throw new Error(`Runway generation failed: ${task.failure || "unknown error"}`);

    // Wait 3s between polls
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Runway task timed out after ${timeoutMs / 1000}s`);
}

// ── Image to Video ─────────────────────────────────────────────

/**
 * Generate a video from an image using Runway.
 *
 * Models:
 * - gen4_turbo: $0.05/s, fast, good quality (Standard)
 * - gen4.5: $0.12/s, best quality (Premium)
 *
 * @returns URL of the generated video
 */
export async function runwayI2V(options: RunwayI2VOptions): Promise<string> {
  const {
    imageUrl,
    prompt,
    duration = 5,
    ratio = "1280:720",
    model = "gen4_turbo",
    watermark = false,
  } = options;

  console.log(`[Runway] ${model} I2V: ${prompt.slice(0, 60)}... (${duration}s, ${ratio})`);

  const body = {
    model,
    promptImage: imageUrl,
    promptText: prompt,
    ratio,
    duration,
    ...(watermark === false && { watermark: false }),
  };

  const res = await runwayFetch("/image_to_video", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Runway I2V failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  const taskId = data.id;
  if (!taskId) throw new Error("Runway: no task ID returned");

  console.log(`[Runway] Task created: ${taskId}`);

  // Poll until complete
  const task = await pollTask(taskId);

  if (!task.output || task.output.length === 0) {
    throw new Error("Runway: no video output");
  }

  const videoUrl = task.output[0];
  console.log(`[Runway] Done: ${videoUrl}`);
  return videoUrl;
}

// ── Text to Video ──────────────────────────────────────────────

/**
 * Generate a video from text only (no image input).
 */
export async function runwayT2V(options: {
  prompt: string;
  duration?: 5 | 10;
  ratio?: "1280:720" | "720:1280" | "960:960";
  model?: "gen4_turbo" | "gen4.5";
}): Promise<string> {
  const { prompt, duration = 5, ratio = "1280:720", model = "gen4_turbo" } = options;

  console.log(`[Runway] ${model} T2V: ${prompt.slice(0, 60)}... (${duration}s)`);

  const res = await runwayFetch("/text_to_video", {
    method: "POST",
    body: JSON.stringify({ model, promptText: prompt, ratio, duration }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Runway T2V failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  const task = await pollTask(data.id);
  return task.output![0];
}

// ── Helper: Convert Buffer to data URI ─────────────────────────

export function bufferToDataUri(buffer: Buffer, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Runway ML API Client — Video Generation
 *
 * IMPORTANT: REST API uses snake_case field names (prompt_image, not promptImage).
 * The Runway SDKs convert automatically, but we use raw fetch.
 *
 * Endpoint: https://api.dev.runwayml.com/v1 (Developer API — "dev" = Developer Portal, not Development)
 *
 * Accepted fields for /v1/image_to_video:
 *   model, prompt_image, prompt_text, ratio, duration, seed, webhook_url
 *   NOTHING ELSE (no watermark, motion, referenceImages)
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

export interface RunwayI2VOptions {
  /** Image: HTTPS URL or data:image/png;base64,... */
  imageUrl: string;
  /** Scene description */
  prompt: string;
  /** 5 or 10 seconds */
  duration?: 5 | 10;
  /** Aspect ratio */
  ratio?: "1280:720" | "720:1280" | "960:960";
  /** gen4_turbo ($0.05/s) or gen4.5 ($0.12/s) */
  model?: "gen4_turbo" | "gen4.5";
  /** Reproducibility seed */
  seed?: number;
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
    if (!res.ok) throw new Error(`Runway poll: ${res.status} ${await res.text()}`);

    const task: RunwayTask = await res.json();
    console.log(`[Runway] Task ${taskId}: ${task.status}`);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") throw new Error(`Runway failed: ${task.failure || "unknown"}`);

    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Runway timed out after ${timeoutMs / 1000}s`);
}

// ── Image to Video ─────────────────────────────────────────────

/**
 * Generate video from image using Runway Gen-4 Turbo or Gen-4.5.
 *
 * CRITICAL: Uses snake_case field names (prompt_image, prompt_text).
 */
export async function runwayI2V(options: RunwayI2VOptions): Promise<string> {
  const {
    imageUrl, prompt, duration = 5, ratio = "1280:720",
    model = "gen4_turbo", seed,
  } = options;

  console.log(`[Runway] ${model} I2V: "${prompt.slice(0, 60)}..." (${duration}s, ${ratio})`);

  // Runway API accepts camelCase (confirmed by successful 200 request)
  const body: Record<string, unknown> = {
    model,
    promptImage: imageUrl,
    promptText: prompt,
    ratio,
    duration,
  };
  if (seed !== undefined) body.seed = seed;

  const res = await runwayFetch("/image_to_video", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[Runway] I2V Error ${res.status}:`, errBody.slice(0, 300));
    throw new Error(`Runway I2V: ${res.status} ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error("Runway: no task ID");
  console.log(`[Runway] Task created: ${data.id}`);

  const task = await pollTask(data.id);
  if (!task.output?.length) throw new Error("Runway: no video output");

  console.log(`[Runway] Done: ${task.output[0]}`);
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
  console.log(`[Runway] ${model} T2V: "${prompt.slice(0, 50)}..." (${duration}s)`);

  const res = await runwayFetch("/text_to_video", {
    method: "POST",
    body: JSON.stringify({
      model,
      promptText: prompt,
      ratio,
      duration,
    }),
  });

  if (!res.ok) throw new Error(`Runway T2V: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const task = await pollTask(data.id);
  return task.output![0];
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Convert buffer to data URI for Runway API.
 */
export function bufferToDataUri(buffer: Buffer, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Upload image to Runway's own ephemeral storage.
 * Returns a runway:// URI that works directly as promptImage.
 *
 * This avoids ALL external URL issues (private Blob, rate limits, data URI size).
 * The runway:// URI is valid for 24 hours.
 */
export async function uploadForRunway(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  const apiKey = getApiKey();

  // Step 1: Create ephemeral upload slot
  const createRes = await fetch(`${RUNWAY_BASE}/uploads`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-Runway-Version": RUNWAY_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename, type: "ephemeral" }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Runway upload create failed: ${createRes.status} ${err}`);
  }

  const { uploadUrl, fields, runwayUri } = await createRes.json();

  // Step 2: Upload file to Runway's S3 via multipart form
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value as string);
  }
  formData.append("file", new Blob([buffer], { type: contentType }), filename);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok && uploadRes.status !== 204) {
    throw new Error(`Runway S3 upload failed: ${uploadRes.status}`);
  }

  console.log(`[Runway] Ephemeral upload: ${filename} (${(buffer.byteLength / 1024).toFixed(0)}KB) → runway://...`);
  return runwayUri;
}

/**
 * Map our cameraMotion strings to text descriptions for Runway prompt.
 * (Runway REST API doesn't have numeric camera params — only via web UI)
 */
export function mapCameraMotion(motion?: string): string {
  if (!motion || motion === "static") return "";

  const descriptions: Record<string, string> = {
    "pan-left": "Camera pans smoothly to the left",
    "pan-right": "Camera pans smoothly to the right",
    "tilt-up": "Camera tilts upward slowly",
    "tilt-down": "Camera tilts downward slowly",
    "zoom-in": "Camera slowly zooms in closer",
    "zoom-out": "Camera slowly zooms out wider",
    "dolly-forward": "Camera moves forward toward the subject",
    "dolly-back": "Camera pulls back from the subject",
    "tracking": "Camera tracks alongside the moving subject",
    "rotation": "Camera slowly rotates around the subject",
  };

  return descriptions[motion] || "";
}

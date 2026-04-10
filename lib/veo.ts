/**
 * Google Veo 3.1 API Integration
 *
 * Premium quality video generation with native lip-sync and audio.
 * Used for high-quality dialog scenes with broadcast-level lip-sync.
 *
 * Pricing: Veo 3.1 Fast = $0.15/s, Veo 3.1 Standard = $0.40/s
 */

const VEO_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 600000; // 10 minutes

function getApiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");
  return key;
}

// ── Types ──────────────────────────────────────────────────────────

interface VeoGenerateRequest {
  prompt: string;
  generationConfig: {
    durationSeconds: number;
    aspectRatio: "16:9" | "9:16" | "1:1";
    resolution: "720p" | "1080p";
    generateAudio?: boolean;
    audioConfig?: {
      includeDialogue?: boolean;
      includeAmbient?: boolean;
      includeMusic?: boolean;
    };
    referenceImage?: {
      mimeType: string;
      data: string; // base64
    };
    seed?: number;
    negativePrompt?: string;
  };
}

// ── Veo 3.1 Video Generation ───────────────────────────────────────

/**
 * Generate a video with Veo 3.1 — best-in-class lip-sync and visual quality.
 * Supports reference images for character consistency.
 *
 * @param prompt - Scene description including character dialog
 * @param referenceImage - Character/scene reference image for consistency
 * @param durationSeconds - Video duration (1-8s)
 * @param quality - "lite" ($0.05/s), "fast" ($0.15/s) or "standard" ($0.40/s)
 */
export async function generateVeoVideo(options: {
  prompt: string;
  referenceImage?: Buffer;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "720p" | "1080p";
  quality?: "lite" | "fast" | "standard";
  generateAudio?: boolean;
}): Promise<string> {
  const {
    prompt,
    referenceImage,
    durationSeconds = 6,
    aspectRatio = "9:16",
    resolution = "720p",
    quality = "lite",
    generateAudio = true,
  } = options;

  const modelId = quality === "lite"
    ? "veo-3.1-lite-generate-preview"
    : quality === "fast"
    ? "veo-3.1-fast-generate-preview"
    : "veo-3.1-generate-preview";

  console.log(`[Veo 3.1] Starting ${quality} generation (${durationSeconds}s, ${resolution})...`);

  const body: VeoGenerateRequest = {
    prompt,
    generationConfig: {
      durationSeconds,
      aspectRatio,
      resolution,
      generateAudio,
      audioConfig: generateAudio ? {
        includeDialogue: true,
        includeAmbient: true,
        includeMusic: false,
      } : undefined,
    },
  };

  // Add reference image if provided
  if (referenceImage) {
    body.generationConfig.referenceImage = {
      mimeType: "image/png",
      data: referenceImage.toString("base64"),
    };
    console.log(`[Veo 3.1] Reference image included (${(referenceImage.byteLength / 1024).toFixed(0)}KB)`);
  }

  // Submit generation
  const res = await fetch(
    `${VEO_BASE}/models/${modelId}:generateVideo`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getApiKey(),
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Veo 3.1] Generation error: ${res.status} — ${errText}`);
    throw new Error(`Veo 3.1 error: ${res.status} — ${errText}`);
  }

  const operation = await res.json();
  const operationName = operation.name;
  console.log(`[Veo 3.1] Operation started: ${operationName}`);

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT) {
    const statusRes = await fetch(
      `${VEO_BASE}/${operationName}`,
      { headers: { "x-goog-api-key": getApiKey() } },
    );

    if (!statusRes.ok) {
      throw new Error(`Veo 3.1 status error: ${statusRes.status}`);
    }

    const status = await statusRes.json();

    if (status.done) {
      if (status.error) {
        throw new Error(`Veo 3.1 failed: ${JSON.stringify(status.error)}`);
      }

      // Extract video URL from response
      const videoUrl = status.response?.generatedVideos?.[0]?.video?.uri
        || status.response?.video?.uri
        || status.response?.uri;

      if (!videoUrl) {
        console.error("[Veo 3.1] No video URL in response:", JSON.stringify(status.response).substring(0, 300));
        throw new Error("Veo 3.1: No video URL in completed response");
      }

      console.log(`[Veo 3.1] Done!`);
      return videoUrl;
    }

    console.log(`[Veo 3.1] Status: ${status.metadata?.state || "processing"}...`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error("Veo 3.1 generation timed out after 10 minutes");
}

// ── Download Helper ────────────────────────────────────────────────

export async function downloadVeoVideo(url: string): Promise<Buffer> {
  // Veo URLs may need the API key
  const fetchUrl = url.includes("googleapis.com")
    ? `${url}${url.includes("?") ? "&" : "?"}key=${getApiKey()}`
    : url;

  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`Failed to download Veo video: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

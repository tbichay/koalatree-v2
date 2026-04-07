/**
 * Hedra Character-3 API Integration
 * Generates talking-head videos from portrait images + audio.
 */

const BASE_URL = "https://api.hedra.com/web-app/public";
const POLL_INTERVAL = 5000; // 5 seconds
const POLL_TIMEOUT = 600000; // 10 minutes

function getApiKey(): string {
  const key = process.env.HEDRA_API_KEY;
  if (!key) throw new Error("HEDRA_API_KEY is not set");
  return key;
}

function headers(contentType = true): Record<string, string> {
  const h: Record<string, string> = { "x-api-key": getApiKey() };
  if (contentType) h["Content-Type"] = "application/json";
  return h;
}

// --- Get available model ---

async function getModelId(): Promise<string> {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`Hedra models error: ${res.status} — ${await res.text()}`);
  const models = await res.json() as Array<{ id: string; name: string; type: string; requires_audio_input: boolean }>;
  if (!models?.length) throw new Error("No Hedra models available");

  // Find Hedra Character 3 (talking head with audio) — the best model for lip-sync
  const character3 = models.find((m) => m.name.includes("Character 3") && m.requires_audio_input);
  if (character3) return character3.id;

  // Fallback: any video model that requires audio
  const audioModel = models.find((m) => m.type === "video" && m.requires_audio_input);
  if (audioModel) return audioModel.id;

  throw new Error("No suitable Hedra video model found (need audio-capable model)");
}

// --- Asset upload ---

async function createAsset(name: string, type: "image" | "audio"): Promise<string> {
  const res = await fetch(`${BASE_URL}/assets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, type }),
  });
  if (!res.ok) throw new Error(`Hedra asset creation error: ${res.status} — ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function uploadAsset(assetId: string, file: Buffer, filename: string, mimeType: string): Promise<void> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(file)], { type: mimeType });
  formData.append("file", blob, filename);

  const res = await fetch(`${BASE_URL}/assets/${assetId}/upload`, {
    method: "POST",
    headers: { "x-api-key": getApiKey() },
    body: formData,
  });
  if (!res.ok) throw new Error(`Hedra upload error: ${res.status} — ${await res.text()}`);
}

// --- Video generation ---

interface GenerateVideoOptions {
  imageBuffer: Buffer;
  audioBuffer: Buffer;
  prompt?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "540p" | "720p";
}

interface GenerationStatus {
  status: string;
  url?: string;
  error_message?: string;
}

export async function generateVideo(options: GenerateVideoOptions): Promise<string> {
  const {
    imageBuffer,
    audioBuffer,
    prompt = "A warm, friendly animated character speaking naturally with gentle expressions",
    aspectRatio = "9:16",
    resolution = "720p",
  } = options;

  console.log("[Hedra] Starting video generation...");

  // 1. Get model
  const modelId = await getModelId();
  console.log(`[Hedra] Model: ${modelId}`);

  // 2. Upload image
  const imageAssetId = await createAsset("portrait.png", "image");
  await uploadAsset(imageAssetId, imageBuffer, "portrait.png", "image/png");
  console.log(`[Hedra] Image uploaded: ${imageAssetId}`);

  // 3. Upload audio
  const audioAssetId = await createAsset("audio.mp3", "audio");
  await uploadAsset(audioAssetId, audioBuffer, "audio.mp3", "audio/mpeg");
  console.log(`[Hedra] Audio uploaded: ${audioAssetId}`);

  // 4. Create generation
  const genRes = await fetch(`${BASE_URL}/generations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "video",
      ai_model_id: modelId,
      start_keyframe_id: imageAssetId,
      audio_id: audioAssetId,
      generated_video_inputs: {
        text_prompt: prompt,
        resolution,
        aspect_ratio: aspectRatio,
      },
    }),
  });

  if (!genRes.ok) throw new Error(`Hedra generation error: ${genRes.status} — ${await genRes.text()}`);
  const genData = await genRes.json();
  const generationId = genData.id;
  console.log(`[Hedra] Generation started: ${generationId}`);

  // 5. Poll for completion
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT) {
    const statusRes = await fetch(`${BASE_URL}/generations/${generationId}/status`, {
      headers: headers(),
    });

    if (!statusRes.ok) throw new Error(`Hedra status error: ${statusRes.status}`);
    const statusData: GenerationStatus = await statusRes.json();

    console.log(`[Hedra] Status: ${statusData.status}`);

    if (statusData.status === "complete" && statusData.url) {
      console.log(`[Hedra] Video ready!`);
      return statusData.url;
    }

    if (statusData.status === "error") {
      throw new Error(`Hedra generation failed: ${statusData.error_message || "Unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error("Hedra generation timed out after 10 minutes");
}

/**
 * Download a video from URL and return as Buffer
 */
export async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// --- Kling Scene Video (Image-to-Video, no audio) ---

async function getKlingModelId(withReference = false): Promise<string> {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`Hedra models error: ${res.status}`);
  const models = await res.json() as Array<{ id: string; name: string; type: string; requires_audio_input: boolean }>;

  // If reference images needed, use IR2V models (Image + Reference to Video)
  if (withReference) {
    const ir2v = models.find((m) => m.name.includes("Kling O1 IR2V") && m.type === "video");
    if (ir2v) return ir2v.id;
    const anyIR2V = models.find((m) => m.name.includes("IR2V") && m.type === "video");
    if (anyIR2V) return anyIR2V.id;
  }

  // Prefer Kling V3 Pro Image-to-Video
  const klingV3 = models.find((m) => m.name.includes("Kling V3 Pro I") && m.type === "video" && !m.requires_audio_input);
  if (klingV3) return klingV3.id;

  // Fallback: Kling 2.1 Master I2V
  const kling21 = models.find((m) => m.name.includes("Kling 2.1") && m.name.includes("I2V") && !m.requires_audio_input);
  if (kling21) return kling21.id;

  // Fallback: any Kling I2V model
  const anyKling = models.find((m) => m.name.includes("Kling") && m.name.includes("I2V") && !m.requires_audio_input);
  if (anyKling) return anyKling.id;

  throw new Error("No Kling Image-to-Video model found");
}

interface GenerateSceneOptions {
  imageBuffer: Buffer;
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "540p" | "720p";
  /** Reference images for character consistency (max 3) */
  referenceImages?: Buffer[];
}

/**
 * Generate an animated scene video from a still image using Kling via Hedra API.
 * No audio — just visual animation (camera movement, environment animation).
 */
export async function generateSceneVideo(options: GenerateSceneOptions): Promise<string> {
  const {
    imageBuffer,
    prompt,
    aspectRatio = "16:9",
    resolution = "720p",
    referenceImages,
  } = options;

  const hasRefs = referenceImages && referenceImages.length > 0;
  console.log(`[Kling] Starting scene video generation... ${hasRefs ? `(${referenceImages.length} reference images)` : "(no references)"}`);

  // 1. Get Kling model (IR2V if reference images, I2V otherwise)
  const modelId = await getKlingModelId(hasRefs);
  console.log(`[Kling] Model: ${modelId}`);

  // 2. Upload scene image (start frame)
  const imageAssetId = await createAsset("scene.png", "image");
  await uploadAsset(imageAssetId, imageBuffer, "scene.png", "image/png");
  console.log(`[Kling] Scene image uploaded: ${imageAssetId}`);

  // 3. Upload reference images (character portraits for consistency)
  const referenceImageIds: string[] = [];
  if (hasRefs) {
    for (let i = 0; i < Math.min(referenceImages.length, 3); i++) {
      const refId = await createAsset(`reference-${i}.png`, "image");
      await uploadAsset(refId, referenceImages[i], `reference-${i}.png`, "image/png");
      referenceImageIds.push(refId);
      console.log(`[Kling] Reference ${i + 1} uploaded: ${refId}`);
    }
  }

  // 4. Create generation
  const genBody: Record<string, unknown> = {
    type: "video",
    ai_model_id: modelId,
    start_keyframe_id: imageAssetId,
    generated_video_inputs: {
      text_prompt: prompt,
      resolution,
      aspect_ratio: aspectRatio,
      duration_ms: 5000, // Required by Kling models (valid: 3000-10000)
    },
  };

  // Add reference images if available
  if (referenceImageIds.length > 0) {
    genBody.reference_image_ids = referenceImageIds;
  }

  const genRes = await fetch(`${BASE_URL}/generations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(genBody),
  });

  if (!genRes.ok) throw new Error(`Kling generation error: ${genRes.status} — ${await genRes.text()}`);
  const genData = await genRes.json();
  const generationId = genData.id;
  console.log(`[Kling] Generation started: ${generationId}`);

  // 4. Poll for completion
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT) {
    const statusRes = await fetch(`${BASE_URL}/generations/${generationId}/status`, {
      headers: headers(),
    });

    if (!statusRes.ok) throw new Error(`Kling status error: ${statusRes.status}`);
    const statusData = await statusRes.json() as { status: string; url?: string; error_message?: string };

    if (statusData.status === "complete" && statusData.url) {
      console.log(`[Kling] Scene video ready!`);
      return statusData.url;
    }

    if (statusData.status === "error") {
      throw new Error(`Kling generation failed: ${statusData.error_message || "Unknown"}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error("Kling generation timed out");
}

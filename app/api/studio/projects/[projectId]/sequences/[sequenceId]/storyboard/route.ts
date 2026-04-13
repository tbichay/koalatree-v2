/**
 * Studio Storyboard API — Generate visual storyboard frames per scene
 *
 * POST: Generate a storyboard frame for a specific scene
 *   Body: { sceneIndex: number, prompt?: string }
 *   Returns: { imageUrl: string }
 *
 * Each frame shows the scene composition before expensive clip generation.
 * Cost: ~$0.04 per frame (vs ~$0.60 per clip)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 800;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as {
    sceneIndex: number;
    prompt?: string;
    generateAll?: boolean;
  };

  // Load sequence with project
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, projectId },
    include: {
      project: {
        include: {
          characters: {
            include: {
              actor: true,
            },
          },
        },
      },
    },
  });

  if (!sequence) return Response.json({ error: "Sequenz nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];

  // Generate all frames or just one
  const indices = body.generateAll
    ? scenes.map((_, i) => i)
    : [body.sceneIndex];

  const results: { sceneIndex: number; imageUrl: string; qualityIssues?: string[] }[] = [];

  // ── Helper: load buffer from blob or HTTP URL ──
  async function loadImageBuffer(url: string): Promise<Buffer | undefined> {
    try {
      if (url.includes(".blob.vercel-storage.com")) {
        const blob = await get(url, { access: "private" });
        if (!blob?.stream) return undefined;
        const reader = blob.stream.getReader();
        const chunks: Uint8Array[] = [];
        let chunk;
        while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
        return Buffer.concat(chunks);
      } else if (url.startsWith("http")) {
        const res = await fetch(url);
        if (res.ok) return Buffer.from(await res.arrayBuffer());
      }
    } catch { /* skip */ }
    return undefined;
  }

  // ── Pre-load actor portraits (try ALL possible sources) ──
  const characterPortraitCache = new Map<string, Buffer>();
  const characters = sequence.project?.characters || [];
  for (const char of characters) {
    const actor = (char as unknown as { actor?: {
      portraitAssetId?: string;
      characterSheet?: { front?: string; profile?: string; fullBody?: string };
    } }).actor;
    const castSnapshot = (char as unknown as { castSnapshot?: { portraitUrl?: string } }).castSnapshot;

    // Try multiple sources: castSnapshot → actor.characterSheet.front → actor.portraitAssetId → char.portraitUrl
    const portraitUrl = castSnapshot?.portraitUrl
      || actor?.characterSheet?.front
      || actor?.portraitAssetId
      || char.portraitUrl;

    if (portraitUrl && !characterPortraitCache.has(char.id)) {
      const buf = await loadImageBuffer(portraitUrl);
      if (buf) {
        characterPortraitCache.set(char.id, buf);
        console.log(`[Storyboard] Portrait loaded for ${char.name}: ${portraitUrl.slice(-40)}`);
      } else {
        console.warn(`[Storyboard] Portrait FAILED for ${char.name}: ${portraitUrl.slice(-40)}`);
      }
    }
  }
  console.log(`[Storyboard] ${characterPortraitCache.size}/${characters.length} actor portraits loaded`);

  // ── Pre-load location image (try sequence ref → Library locations) ──
  let locationImageBuffer: Buffer | undefined;

  // 1. Try sequence's assigned landscape
  if (sequence.landscapeRefUrl) {
    locationImageBuffer = await loadImageBuffer(sequence.landscapeRefUrl);
    if (locationImageBuffer) console.log(`[Storyboard] Location from sequence landscapeRefUrl`);
  }

  // 2. Fallback: load first location from Library (user's locations)
  if (!locationImageBuffer) {
    try {
      const { getAssets } = await import("@/lib/assets");
      const locationAssets = await getAssets({
        type: "landscape",
        userId: session.user!.id!,
        limit: 1,
      });
      if (locationAssets.length > 0) {
        locationImageBuffer = await loadImageBuffer(locationAssets[0].blobUrl);
        if (locationImageBuffer) console.log(`[Storyboard] Location from Library: ${(locationAssets[0] as { name?: string }).name}`);
      }
    } catch { /* no locations */ }
  }

  if (!locationImageBuffer) console.log(`[Storyboard] No location image available`);

  // ── Pre-load prop images from Library ──
  const propImageCache = new Map<string, Buffer>();
  try {
    const { getAssets: getPropAssets } = await import("@/lib/assets");
    const propAssets = await getPropAssets({ type: "reference" as any, category: "prop", userId: session.user!.id!, limit: 5 });
    for (const pa of propAssets) {
      const buf = await loadImageBuffer(pa.blobUrl);
      if (buf) {
        propImageCache.set(pa.id, buf);
        console.log(`[Storyboard] Prop loaded: ${(pa as { name?: string }).name || pa.id}`);
      }
    }
  } catch { /* no props */ }

  // Build character name map for prompt
  const charNameMap = new Map<string, { name: string; description: string; outfit: string }>();
  for (const char of characters) {
    const actor = (char as unknown as { actor?: { description?: string; outfit?: string; traits?: string } }).actor;
    charNameMap.set(char.id, {
      name: char.name,
      description: actor?.description || (char as { description?: string }).description || "",
      outfit: actor?.outfit || "",
    });
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI();

  for (const sceneIndex of indices) {
    if (sceneIndex < 0 || sceneIndex >= scenes.length) continue;

    const scene = scenes[sceneIndex];
    const customPrompt = !body.generateAll ? body.prompt : undefined;

    // Build storyboard prompt
    const imagePrompt = buildStoryboardPrompt(scene, sequence, customPrompt);

    // Determine visual style from project or sequence
    const styleHint = getStyleHint(
      (sequence.directingStyle || (sequence.project as { visualStyle?: string }).visualStyle || "pixar-3d") as string,
    );

    const fullPrompt = `${styleHint}. ${imagePrompt}`;

    const format = (sequence.project as { format?: string }).format || "portrait";
    const size = format === "portrait" ? "1024x1536" : "1536x1024";

    // ── Strategy: ONLY character portrait as image reference ──
    // GPT-Image can't handle multiple reference images well (ignores face identity).
    // Solution: Character portrait = only image ref. Location + Props = detailed TEXT.
    const charInfo = scene.characterId ? charNameMap.get(scene.characterId) : undefined;
    const charPortrait = scene.characterId ? characterPortraitCache.get(scene.characterId) : undefined;

    // Build rich text description for location + props (instead of image refs)
    let contextPrompt = "";
    if (sequence.location) {
      contextPrompt += `SETTING: ${sequence.location}. `;
    }
    if (locationImageBuffer && !charPortrait) {
      // Only use location as image ref for landscape scenes WITHOUT character
    }
    // Describe props in text
    for (const [, propBuf] of propImageCache) {
      // We can't use the image, but we have prop names from earlier loading
      // The prop details should already be in the scene description from the screenplay
      break; // Props are described via sceneDescription text
    }
    if (charInfo) {
      contextPrompt += `CHARACTER: "${charInfo.name}" — ${charInfo.description}. `;
      if (charInfo.outfit) contextPrompt += `WEARING: ${charInfo.outfit}. `;
    }

    const generateParams: Record<string, unknown> = {
      model: "gpt-image-1.5",
      n: 1,
      size,
      quality: "low",
    };

    if (charPortrait && scene.type === "dialog") {
      // ── DIALOG SCENE: Character portrait as ONLY image reference ──
      // This preserves face identity (same approach as character-sheet which works)
      generateParams.image = [{ image: charPortrait.toString("base64"), detail: "high" }];
      generateParams.prompt = `This reference image shows the character "${charInfo?.name || "Character"}". Generate a new scene with THIS EXACT SAME PERSON (identical face, hair, body type).

${contextPrompt}

The character MUST look IDENTICAL to the reference photo. Same face shape, nose, eyes, jawline, hair color and style, skin tone, age. Do NOT change the person's appearance at all.

${styleHint}. ${imagePrompt}`;
      generateParams.quality = "medium";
      console.log(`[Storyboard] Scene ${sceneIndex}: DIALOG — actor portrait as sole reference + text context`);

    } else if (locationImageBuffer && scene.type !== "dialog") {
      // ── LANDSCAPE/TRANSITION: Location image as reference (no character needed) ──
      generateParams.image = [{ image: locationImageBuffer.toString("base64"), detail: "high" }];
      generateParams.prompt = `This reference image shows the LOCATION/SETTING. Generate a new scene in THIS EXACT SAME environment (same scenery, lighting, colors, atmosphere).

${styleHint}. ${imagePrompt}`;
      generateParams.quality = "medium";
      console.log(`[Storyboard] Scene ${sceneIndex}: LANDSCAPE — location as sole reference`);

    } else {
      // ── NO IMAGE REF: Text-only with detailed descriptions ──
      generateParams.prompt = `${contextPrompt}\n${styleHint}. ${imagePrompt}`;
      console.log(`[Storyboard] Scene ${sceneIndex}: TEXT-ONLY (no image refs available)`);
    }

    let b64: string | undefined;

    // Try with reference images first, fallback to text-only if it fails
    try {
      const response = await (openai.images.generate as any)(generateParams);
      b64 = response.data[0]?.b64_json;
      if (!b64 && response.data[0]?.url) {
        // Some API versions return URL instead of b64 — download it
        const imgRes = await fetch(response.data[0].url);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          b64 = buf.toString("base64");
        }
      }
    } catch (genErr) {
      console.error(`[Storyboard] Scene ${sceneIndex} generation failed with refs:`, genErr);
      // Fallback: try WITHOUT reference images (text-only)
      if (generateParams.image) {
        console.log(`[Storyboard] Scene ${sceneIndex}: retrying WITHOUT reference images...`);
        try {
          const fallbackResponse = await (openai.images.generate as any)({
            model: "gpt-image-1.5",
            prompt: fullPrompt,
            n: 1,
            size,
            quality: "low",
          });
          b64 = fallbackResponse.data[0]?.b64_json;
        } catch (fallbackErr) {
          console.error(`[Storyboard] Scene ${sceneIndex} fallback also failed:`, fallbackErr);
        }
      }
    }

    if (!b64) {
      console.warn(`[Storyboard] Scene ${sceneIndex}: no image generated, skipping`);
      continue;
    }

    // ── AI Quality Check: verify location + character consistency ──
    let qualityIssues: string[] = [];
    try {
      const { validateImage } = await import("@/lib/studio/image-quality");
      const validation = await validateImage(b64, generateParams.prompt as string, "storyboard");
      qualityIssues = validation.issues;
      console.log(`[Storyboard] Scene ${sceneIndex} quality: ${validation.score}/10${validation.issues.length > 0 ? ` — Issues: ${validation.issues.join(", ")}` : " ✓"}`);

      // If failed badly and has improved prompt: re-generate once
      if (!validation.passed && validation.improvedPrompt && validation.score < 5) {
        console.log(`[Storyboard] Scene ${sceneIndex}: re-generating with corrected prompt...`);
        try {
          const retryResponse = await (openai.images.generate as any)({
            ...generateParams,
            prompt: validation.improvedPrompt,
          });
          const retryB64 = retryResponse.data[0]?.b64_json;
          if (retryB64) {
            b64 = retryB64;
            qualityIssues = [`Auto-korrigiert: ${validation.issues[0]}`];
          }
        } catch { /* use original */ }
      }
    } catch (valErr) {
      console.warn(`[Storyboard] Quality check failed:`, valErr);
    }

    const imgBuffer = Buffer.from(b64!, "base64");
    const blobPath = `studio/${projectId}/sequences/${sequenceId}/storyboard/scene-${sceneIndex}-${Date.now()}.png`;

    const blob = await put(blobPath, imgBuffer, {
      access: "private",
      contentType: "image/png",
      addRandomSuffix: true,
    });

    // Update scene in DB
    scenes[sceneIndex] = {
      ...scene,
      storyboardImageUrl: blob.url,
      storyboardApproved: false,
      storyboardPrompt: customPrompt || undefined,
    };

    results.push({ sceneIndex, imageUrl: blob.url, qualityIssues });
  }

  // Save updated scenes back to sequence
  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { scenes: scenes as any },
  });

  if (results.length === 1) {
    return Response.json({ imageUrl: results[0].imageUrl, sceneIndex: results[0].sceneIndex });
  }

  return Response.json({ frames: results, count: results.length });
}

// ── Approve a storyboard frame ──────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { sequenceId } = await params;
  const body = await request.json() as {
    sceneIndex: number;
    approved: boolean;
  };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId },
  });

  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  if (body.sceneIndex < 0 || body.sceneIndex >= scenes.length) {
    return Response.json({ error: "Ungültiger Szenen-Index" }, { status: 400 });
  }

  scenes[body.sceneIndex] = {
    ...scenes[body.sceneIndex],
    storyboardApproved: body.approved,
  };

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { scenes: scenes as any },
  });

  return Response.json({ ok: true });
}

// ── Helper: Build storyboard image prompt ───────────────────────

function buildStoryboardPrompt(
  scene: StudioScene,
  sequence: any,
  customPrompt?: string,
): string {
  if (customPrompt) {
    return `Film storyboard frame: ${customPrompt}. Cinematic composition, detailed environment. No text, no watermarks, no subtitles.`;
  }

  const parts: string[] = [];

  // Camera angle
  const cameraMap: Record<string, string> = {
    "close-up": "Close-up shot",
    "medium": "Medium shot",
    "wide": "Wide establishing shot",
    "slow-pan": "Slow panoramic shot",
    "zoom-in": "Dramatic zoom-in",
    "zoom-out": "Pulling back wide shot",
  };
  parts.push(cameraMap[scene.camera] || "Cinematic shot");

  // Scene description (main content)
  if (scene.sceneDescription) {
    // Strip quoted dialog from scene description
    const cleaned = scene.sceneDescription.replace(/"[^"]*"/g, "").trim();
    parts.push(cleaned);
  }

  // Location
  if (scene.location || sequence.location) {
    parts.push(`Setting: ${scene.location || sequence.location}`);
  }

  // Mood/atmosphere
  if (scene.mood || sequence.atmosphereText) {
    parts.push(`Atmosphere: ${scene.mood || sequence.atmosphereText}`);
  }

  // Character (if present)
  if (scene.characterId && scene.type === "dialog") {
    // Find character info from sequence's project
    const characters = sequence.project?.characters || [];
    const char = characters.find((c: any) => c.id === scene.characterId);
    if (char) {
      const actorDesc = char.actor?.description || char.description || "";
      const outfit = char.actor?.outfit || "";
      parts.push(`Character: ${char.name}${actorDesc ? ` — ${actorDesc}` : ""}${outfit ? `, wearing ${outfit}` : ""}`);
    }
  }

  // Emotion as visual cue
  if (scene.emotion && scene.emotion !== "neutral") {
    const emotionMap: Record<string, string> = {
      tense: "tense, dramatic lighting",
      dramatic: "high contrast, dramatic shadows",
      calm: "soft lighting, peaceful mood",
      excited: "dynamic, vibrant energy",
      sad: "melancholic, muted colors",
      angry: "intense, harsh lighting",
      joyful: "bright, warm colors",
    };
    parts.push(emotionMap[scene.emotion] || "");
  }

  parts.push("Storyboard frame for animated film. Cinematic composition. No text, no watermarks, no subtitles, no speech bubbles.");

  return parts.filter(Boolean).join(". ");
}

// ── Helper: Visual style hint ───────────────────────────────────

function getStyleHint(style: string): string {
  const styles: Record<string, string> = {
    "realistic": "Photorealistic, cinematic lighting, shallow depth of field",
    "disney-2d": "2D Disney animation style, vibrant colors, hand-drawn feel",
    "pixar-3d": "Pixar 3D animation style, smooth CGI rendering, detailed textures",
    "ghibli": "Studio Ghibli anime style, soft pastel colors, hand-painted backgrounds",
    "storybook": "Storybook illustration style, warm colors, whimsical",
    "comic": "Comic book style, bold outlines, dynamic angles",
  };
  return styles[style] || styles["pixar-3d"];
}

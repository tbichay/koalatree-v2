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

    // ── STRATEGY: Flux Kontext for ANY scene with a character ──
    // Even "Szene" type frames often show the character (walking, surfing, etc.)
    // Only pure establishing shots (type=landscape, no characterId, no character in sequence) skip Flux

    // Find character for this scene — fallback to first character in sequence
    let sceneCharId = scene.characterId;
    if (!sceneCharId && scene.type !== "landscape") {
      // Use first character from this sequence
      const seqCharIds = (sequence as { characterIds?: string[] }).characterIds || [];
      sceneCharId = seqCharIds[0] || undefined;
    }
    const charInfo = sceneCharId ? charNameMap.get(sceneCharId) : undefined;
    const charPortrait = sceneCharId ? characterPortraitCache.get(sceneCharId) : undefined;

    // Clean prompt: remove "KoalaTree" references that confuse the AI into generating koalas
    const cleanImagePrompt = imagePrompt
      .replace(/koalatree/gi, "")
      .replace(/koala\s*tree/gi, "")
      .replace(/KoalaTree\.io/gi, "")
      .trim();

    let b64: string | undefined;

    if (charPortrait) {
      // ── CHARACTER SCENE: Use Flux Kontext for identity preservation ──
      // Used for ALL scenes with a character (dialog, action, reaction shots)
      console.log(`[Storyboard] Scene ${sceneIndex}: FLUX KONTEXT — character "${charInfo?.name}" (type: ${scene.type})`);
      try {
        const { fluxKontext } = await import("@/lib/fal");
        const scenePrompt = `Place this exact person into a new scene. Maintain their identical face, hair, and body. This is a HUMAN character, NOT an animal.

Scene: ${cleanImagePrompt}
${sequence.location ? `Location: ${sequence.location}.` : ""}
${charInfo?.outfit ? `The character is wearing: ${charInfo.outfit}.` : ""}
${styleHint}.
Cinematic storyboard frame. No text, no watermarks, no logos.`;

        const result = await fluxKontext({
          imageBuffer: charPortrait,
          prompt: scenePrompt,
          aspectRatio: format === "portrait" ? "9:16" : "16:9",
        });

        // Download the generated image
        const imgRes = await fetch(result.url);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          b64 = buf.toString("base64");
        }
      } catch (fluxErr) {
        console.error(`[Storyboard] Flux Kontext failed for scene ${sceneIndex}:`, fluxErr);
        // Fallback to GPT-Image
        console.log(`[Storyboard] Scene ${sceneIndex}: falling back to GPT-Image...`);
        try {
          const response = await (openai.images.generate as any)({
            model: "gpt-image-1.5",
            prompt: `${styleHint}. ${imagePrompt}`,
            image: charPortrait ? [{ image: charPortrait.toString("base64"), detail: "high" }] : undefined,
            input_fidelity: "high",
            n: 1,
            size,
            quality: "medium",
          });
          b64 = response.data[0]?.b64_json;
        } catch { /* final fallback below */ }
      }

    } else if (locationImageBuffer) {
      // ── PURE LANDSCAPE (no character): GPT-Image with input_fidelity high ──
      console.log(`[Storyboard] Scene ${sceneIndex}: GPT-IMAGE — pure landscape (no character)`);
      try {
        const response = await (openai.images.generate as any)({
          model: "gpt-image-1.5",
          prompt: `This reference shows the location. Generate a cinematic establishing shot in THIS EXACT environment. No people, no characters, no animals.

${styleHint}. ${cleanImagePrompt}
No text, no watermarks, no logos.`,
          image: [{ image: locationImageBuffer.toString("base64"), detail: "high" }],
          input_fidelity: "high",
          n: 1,
          size,
          quality: "medium",
        });
        b64 = response.data[0]?.b64_json;
      } catch (imgErr) {
        console.error(`[Storyboard] GPT-Image landscape failed:`, imgErr);
      }

    } else {
      // ── TEXT-ONLY: No references available ──
      console.log(`[Storyboard] Scene ${sceneIndex}: TEXT-ONLY`);
      try {
        const response = await (openai.images.generate as any)({
          model: "gpt-image-1.5",
          prompt: `${styleHint}. ${cleanImagePrompt}. No text, no watermarks.`,
          n: 1,
          size,
          quality: "low",
        });
        b64 = response.data[0]?.b64_json;
      } catch { /* no image */ }
    }

    // Final fallback if nothing worked
    if (!b64) {
      console.log(`[Storyboard] Scene ${sceneIndex}: trying bare text-only fallback...`);
      try {
        const response = await (openai.images.generate as any)({
          model: "gpt-image-1.5",
          prompt: `${styleHint}. ${cleanImagePrompt}. No text, no watermarks.`,
          n: 1,
          size,
          quality: "low",
        });
        b64 = response.data[0]?.b64_json;
      } catch { /* give up */ }
    }

    if (!b64) {
      console.warn(`[Storyboard] Scene ${sceneIndex}: no image generated, skipping`);
      continue;
    }

    // ── AI Quality Check: verify location + character consistency ──
    let qualityIssues: string[] = [];
    try {
      const { validateImage } = await import("@/lib/studio/image-quality");
      const validationPrompt = charInfo
        ? `${fullPrompt}\n\nEXPECTED: The character should be a HUMAN named "${charInfo.name}" — ${charInfo.description}. NOT an animal, NOT a koala, NOT a cartoon animal.`
        : fullPrompt;
      const validation = await validateImage(b64, validationPrompt, "storyboard");
      qualityIssues = validation.issues;
      console.log(`[Storyboard] Scene ${sceneIndex} quality: ${validation.score}/10${validation.issues.length > 0 ? ` — Issues: ${validation.issues.join(", ")}` : " ✓"}`);

      // If failed badly and has improved prompt: re-generate once via GPT-Image
      if (!validation.passed && validation.improvedPrompt && validation.score < 5) {
        console.log(`[Storyboard] Scene ${sceneIndex}: re-generating with corrected prompt...`);
        try {
          const retryResponse = await (openai.images.generate as any)({
            model: "gpt-image-1.5",
            prompt: validation.improvedPrompt,
            n: 1,
            size,
            quality: "medium",
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

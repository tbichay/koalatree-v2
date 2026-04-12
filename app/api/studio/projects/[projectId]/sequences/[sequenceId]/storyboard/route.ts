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

export const maxDuration = 120;

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

  const results: { sceneIndex: number; imageUrl: string }[] = [];

  // Pre-load actor portraits for character reference
  const characterPortraitCache = new Map<string, Buffer>();
  const characters = sequence.project?.characters || [];
  for (const char of characters) {
    const actor = (char as unknown as { actor?: { portraitAssetId?: string; characterSheet?: { front?: string } } }).actor;
    const portraitUrl = char.portraitUrl || actor?.portraitAssetId || actor?.characterSheet?.front;
    if (portraitUrl && !characterPortraitCache.has(char.id)) {
      try {
        let buf: Buffer | undefined;
        if (portraitUrl.includes(".blob.vercel-storage.com")) {
          const blob = await get(portraitUrl, { access: "private" });
          if (blob?.stream) {
            const reader = blob.stream.getReader();
            const chunks: Uint8Array[] = [];
            let chunk;
            while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
            buf = Buffer.concat(chunks);
          }
        } else if (portraitUrl.startsWith("http")) {
          const res = await fetch(portraitUrl);
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        }
        if (buf) characterPortraitCache.set(char.id, buf);
      } catch { /* skip */ }
    }
  }
  console.log(`[Storyboard] ${characterPortraitCache.size} actor portraits loaded for reference`);

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

    // Collect reference images for this scene (actor portraits)
    const referenceImages: Array<{ image: Buffer; mimeType: string }> = [];
    if (scene.characterId && characterPortraitCache.has(scene.characterId)) {
      referenceImages.push({ image: characterPortraitCache.get(scene.characterId)!, mimeType: "image/png" });
    }
    // Also add other characters visible in the scene (from sequence characterIds)
    const seqCharIds = (sequence as { characterIds?: string[] }).characterIds || [];
    for (const cid of seqCharIds) {
      if (cid !== scene.characterId && characterPortraitCache.has(cid) && referenceImages.length < 3) {
        referenceImages.push({ image: characterPortraitCache.get(cid)!, mimeType: "image/png" });
      }
    }

    // Build generation params
    const generateParams: Record<string, unknown> = {
      model: "gpt-image-1.5",
      prompt: fullPrompt,
      n: 1,
      size,
      quality: "low",
    };

    if (referenceImages.length > 0) {
      // Pass actor portraits as reference images for character consistency
      generateParams.image = referenceImages.map((ref) => ({
        image: ref.image.toString("base64"),
        detail: "low",
      }));
      generateParams.prompt = `CRITICAL: The character(s) in this frame MUST look EXACTLY like the reference image(s). Same face, same hair, same body type, same clothing, same art style. ${fullPrompt}`;
      generateParams.quality = "medium"; // Better quality when using references
    }

    const response = await (openai.images.generate as any)(generateParams);

    const b64 = response.data[0]?.b64_json;
    if (!b64) continue;

    const imgBuffer = Buffer.from(b64, "base64");
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

    results.push({ sceneIndex, imageUrl: blob.url });
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

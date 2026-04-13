/**
 * Studio Storyboard API — Pencil-sketch storyboard frames
 *
 * Generates simple pencil-sketch storyboard frames showing:
 * - Camera angle + framing (close-up, wide, medium)
 * - Character position + action (silhouette, no face identity needed)
 * - Scene composition (foreground, background, movement arrows)
 * - Location hints (beach, waves, car, etc.)
 *
 * NOT meant for character identity — that's handled by Kling Element Binding
 * in the actual clip generation. Storyboard is for PLANNING only.
 *
 * Cost: ~$0.02 per frame (GPT-Image quality: low, sketch style)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
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

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, projectId },
    include: {
      project: {
        include: { characters: { include: { actor: true } } },
      },
    },
  });

  if (!sequence) return Response.json({ error: "Sequenz nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const indices = body.generateAll
    ? scenes.map((_, i) => i)
    : [body.sceneIndex];

  const results: { sceneIndex: number; imageUrl: string }[] = [];

  // Character info for prompts
  const characters = sequence.project?.characters || [];
  const charNameMap = new Map<string, string>();
  for (const char of characters) {
    const actor = (char as unknown as { actor?: { description?: string } }).actor;
    charNameMap.set(char.id, `${char.name} (${actor?.description || (char as { description?: string }).description || "character"})`);
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI();

  const format = (sequence.project as { format?: string }).format || "portrait";
  const size = format === "portrait" ? "1024x1536" : "1536x1024";

  for (const sceneIndex of indices) {
    if (sceneIndex < 0 || sceneIndex >= scenes.length) continue;
    const scene = scenes[sceneIndex];

    // Skip approved frames
    if (scene.storyboardApproved && body.generateAll) {
      console.log(`[Storyboard] Scene ${sceneIndex}: SKIPPED (approved)`);
      continue;
    }

    // Build sketch prompt from scene data
    const charName = scene.characterId ? charNameMap.get(scene.characterId) : undefined;
    const actionDesc = (body.prompt || scene.sceneDescription || "")
      .replace(/"[^"]*"/g, "")
      .replace(/koalatree/gi, "")
      .trim();

    const cameraHints: Record<string, string> = {
      "close-up": "CLOSE-UP framing: character fills most of the frame, head and shoulders visible",
      "medium": "MEDIUM SHOT: character from waist up, some environment visible",
      "wide": "WIDE SHOT: full environment visible, character smaller in frame",
      "slow-pan": "SLOW PAN: horizontal panoramic view across the scene",
      "zoom-in": "ZOOM IN: camera moves closer to subject",
      "zoom-out": "ZOOM OUT: camera pulls back revealing environment",
    };

    const sketchPrompt = `Black and white pencil sketch storyboard frame for a film.
Simple hand-drawn style, loose pencil strokes, no color, minimal shading.
Like a professional film director's storyboard sketch.

${cameraHints[scene.camera] || `Camera: ${scene.camera}`}
${charName ? `Character: simple human figure representing ${charName}` : ""}
Action: ${actionDesc.slice(0, 200)}
${sequence.location ? `Setting: ${sequence.location}` : ""}
${scene.type === "landscape" ? "Establishing shot — no people, only environment" : ""}

Include frame border lines. Show movement with simple arrows if needed.
Professional storyboard sketch style. NO text, NO labels, NO color.`;

    try {
      const response = await (openai.images.generate as any)({
        model: "gpt-image-1.5",
        prompt: sketchPrompt,
        n: 1,
        size,
        quality: "low",
      });

      const b64 = response.data[0]?.b64_json;
      if (!b64) {
        console.warn(`[Storyboard] Scene ${sceneIndex}: no image generated`);
        continue;
      }

      const imgBuffer = Buffer.from(b64, "base64");
      const blobPath = `studio/${projectId}/sequences/${sequenceId}/storyboard/sketch-${sceneIndex}-${Date.now()}.png`;

      const blob = await put(blobPath, imgBuffer, {
        access: "private",
        contentType: "image/png",
        addRandomSuffix: true,
      });

      scenes[sceneIndex] = {
        ...scene,
        storyboardImageUrl: blob.url,
        storyboardApproved: false,
        storyboardPrompt: body.prompt || undefined,
      };

      results.push({ sceneIndex, imageUrl: blob.url });
      console.log(`[Storyboard] Scene ${sceneIndex}: sketch generated ✓`);
    } catch (err) {
      console.error(`[Storyboard] Scene ${sceneIndex} failed:`, err);
    }
  }

  // Save
  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { scenes: scenes as any },
  });

  if (results.length === 1) {
    return Response.json({ imageUrl: results[0].imageUrl, sceneIndex: results[0].sceneIndex });
  }
  return Response.json({ frames: results, count: results.length });
}

// ── Approve/unapprove a frame ──

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { sequenceId } = await params;
  const body = await request.json() as { sceneIndex: number; approved: boolean };

  const sequence = await prisma.studioSequence.findFirst({ where: { id: sequenceId } });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  if (body.sceneIndex < 0 || body.sceneIndex >= scenes.length) {
    return Response.json({ error: "Ungueltiger Index" }, { status: 400 });
  }

  scenes[body.sceneIndex] = { ...scenes[body.sceneIndex], storyboardApproved: body.approved };

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { scenes: scenes as any },
  });

  return Response.json({ ok: true });
}

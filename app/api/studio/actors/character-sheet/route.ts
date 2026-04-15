/**
 * Studio Actor Character Sheet API — Generate multi-angle portraits
 *
 * POST: Generate a specific angle (front, profile, fullBody) for a DigitalActor
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";

export const maxDuration = 800;

type Angle = "front" | "profile" | "fullBody";

const ANGLE_PROMPTS: Record<Angle, { suffix: string; size: string }> = {
  front: {
    suffix: "Head and shoulders portrait, facing the camera with a slight angle, expressive eyes, centered composition.",
    size: "1024x1024",
  },
  profile: {
    suffix: "Side profile view, looking to the right, showing facial profile clearly, head and shoulders, clean background.",
    size: "1024x1024",
  },
  fullBody: {
    suffix: "Full body portrait, head to toe, standing pose, showing complete outfit and body proportions, centered.",
    size: "1024x1536",
  },
};

import { getStyleHint } from "@/lib/studio/visual-styles";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    actorId: string;
    angle: Angle;
    description: string;
    style?: string;
  };

  if (!body.actorId || !body.angle || !body.description) {
    return Response.json({ error: "actorId, angle und description sind erforderlich" }, { status: 400 });
  }

  if (!ANGLE_PROMPTS[body.angle]) {
    return Response.json({ error: "Ungueltiger Winkel. Erlaubt: front, profile, fullBody" }, { status: 400 });
  }

  const actor = await prisma.digitalActor.findFirst({
    where: { id: body.actorId, userId: session.user.id },
  });
  if (!actor) return Response.json({ error: "Actor nicht gefunden" }, { status: 404 });

  const { createTask } = await import("@/lib/studio/task-tracker");
  const task = await createTask(session.user!.id!, "character-sheet", null, { actorId: body.actorId, angle: body.angle }, 8);

  try {

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI();
  const style = body.style || actor.style || "realistic";
  const styleHint = getStyleHint(style);
  const angleConfig = ANGLE_PROMPTS[body.angle];

  const outfitHint = actor.outfit ? ` WEARING: ${actor.outfit}.` : "";
  const traitsHint = actor.traits ? ` DISTINCTIVE FEATURES: ${actor.traits}.` : "";

  // Enhance prompt with AI for better anatomical accuracy
  const rawDesc = `${body.description}.${outfitHint}${traitsHint} ${angleConfig.suffix}`;
  let prompt = `${styleHint}. Character: ${rawDesc} No text, no watermarks, no logos.`;
  try {
    const { enhanceImagePrompt } = await import("@/lib/studio/image-quality");
    const enhanced = await enhanceImagePrompt(rawDesc, "character-sheet", styleHint, `Angle: ${body.angle}`);
    prompt = enhanced.prompt;
    console.log(`[CharSheet] ${body.angle} enhanced: "${prompt.slice(0, 80)}..." | ${enhanced.reasoning}`);
  } catch (enhErr) {
    console.warn(`[CharSheet] Prompt enhancement failed, using raw prompt:`, enhErr);
  }

  // Use front portrait as reference for profile/fullBody consistency
  const imageInputs: Array<{ image: string; detail: string }> = [];
  if (body.angle !== "front" && actor.portraitAssetId) {
    try {
      const blobUrl = actor.portraitAssetId;
      if (blobUrl.startsWith("http")) {
        const { getDownloadUrl } = await import("@vercel/blob");
        const downloadUrl = await getDownloadUrl(blobUrl);
        const imgRes = await fetch(downloadUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          imageInputs.push({ image: buf.toString("base64"), detail: "high" });
        }
      }
    } catch { /* reference is optional */ }
  }

  // Build consistency-focused prompt when reference image exists
  const consistencyPrompt = imageInputs.length > 0
    ? `CRITICAL: This is the SAME character as in the reference image. You MUST maintain EXACT visual consistency:
- SAME face shape, SAME nose, SAME eyes, SAME mouth
- SAME hair color, SAME hair style, SAME facial hair (beard/mustache)
- SAME skin tone, SAME age appearance
- SAME clothing and accessories
- SAME art style and rendering quality

${prompt}`
    : prompt;

  const generateParams: Record<string, unknown> = {
    model: "gpt-image-1.5",
    prompt: consistencyPrompt,
    n: 1,
    size: angleConfig.size,
    quality: "high", // Higher quality for better consistency
  };
  if (imageInputs.length > 0) {
    generateParams.image = imageInputs;
  }

  const response = await (openai.images.generate as any)(generateParams);

  const b64 = response.data[0]?.b64_json;
  if (!b64) return Response.json({ error: "Character Sheet Generierung fehlgeschlagen" }, { status: 500 });

  const imgBuffer = Buffer.from(b64, "base64");
  const timestamp = Date.now();
  const [w, h] = angleConfig.size.split("x").map(Number);

  const blob = await put(
    `studio/actors/${body.actorId}/character-sheet-${body.angle}-${timestamp}.png`,
    imgBuffer,
    { access: "private", contentType: "image/png" },
  );

  // Save as Asset
  let assetId: string | undefined;
  try {
    const { createAsset } = await import("@/lib/assets");
    const asset = await createAsset({
      type: "portrait",
      category: `actor:${body.actorId}`,
      buffer: imgBuffer,
      filename: `actor-${body.actorId}-${body.angle}-${timestamp}.png`,
      mimeType: "image/png",
      width: w,
      height: h,
      generatedBy: { model: "gpt-image-1.5", prompt },
      modelId: "gpt-image-1.5",
      costCents: 4,
      userId: session.user.id,
      tags: ["actor", `actor:${body.actorId}`, `angle:${body.angle}`],
    });
    assetId = asset?.id;
  } catch { /* asset save optional */ }

  // Update character sheet JSON on actor — always use blob URL for display
  const currentSheet = (actor.characterSheet as Record<string, string> | null) || {};
  currentSheet[body.angle] = blob.url;

  // If generating front, also update portraitAssetId
  const updateData: Record<string, unknown> = { characterSheet: currentSheet };
  if (body.angle === "front") {
    updateData.portraitAssetId = blob.url;
  }

  await prisma.digitalActor.update({
    where: { id: body.actorId },
    data: updateData,
  });

  await task.complete({ angle: body.angle, portraitUrl: blob.url });
  return Response.json({
    angle: body.angle,
    portraitUrl: blob.url,
    assetId,
    characterSheet: currentSheet,
  });

  } catch (err) {
    await task.fail(err instanceof Error ? err.message : "Fehler");
    throw err;
  }
}

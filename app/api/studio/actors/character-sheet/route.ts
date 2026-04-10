/**
 * Studio Actor Character Sheet API — Generate multi-angle portraits
 *
 * POST: Generate a specific angle (front, profile, fullBody) for a DigitalActor
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import OpenAI from "openai";

export const maxDuration = 60;

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

function getStyleHint(style: string): string {
  switch (style) {
    case "realistic": return "Photorealistic portrait, cinematic lighting, shallow depth of field, professional photography style";
    case "disney-2d": return "2D Disney animation style portrait, vibrant colors, hand-drawn feel";
    case "pixar-3d": return "Pixar 3D animation style portrait, smooth CGI rendering";
    case "ghibli": return "Studio Ghibli anime style portrait, soft pastel colors";
    default: return "High quality portrait";
  }
}

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

  const openai = new OpenAI();
  const style = body.style || actor.style || "realistic";
  const styleHint = getStyleHint(style);
  const angleConfig = ANGLE_PROMPTS[body.angle];

  const prompt = `${styleHint}. Character: ${body.description}. ${angleConfig.suffix} No text, no watermarks, no logos.`;

  // Use front portrait as reference for profile/fullBody consistency
  const imageInputs: Array<{ image: string; detail: string }> = [];
  if (body.angle !== "front" && actor.portraitAssetId) {
    try {
      const asset = await prisma.asset.findUnique({ where: { id: actor.portraitAssetId } });
      if (asset?.blobUrl) {
        // Fetch the front portrait to use as reference
        const { getDownloadUrl } = await import("@vercel/blob");
        const downloadUrl = await getDownloadUrl(asset.blobUrl);
        const imgRes = await fetch(downloadUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          imageInputs.push({ image: buf.toString("base64"), detail: "low" });
        }
      }
    } catch { /* reference is optional */ }
  }

  const generateParams: Record<string, unknown> = {
    model: "gpt-image-1",
    prompt: imageInputs.length > 0
      ? `Reference character (keep the same person/character): ${prompt}`
      : prompt,
    n: 1,
    size: angleConfig.size,
    quality: "medium",
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
      generatedBy: { model: "gpt-image-1", prompt },
      modelId: "gpt-image-1",
      costCents: 4,
      userId: session.user.id,
      tags: ["actor", `actor:${body.actorId}`, `angle:${body.angle}`],
    });
    assetId = asset?.id;
  } catch { /* asset save optional */ }

  // Update character sheet JSON on actor
  const currentSheet = (actor.characterSheet as Record<string, string> | null) || {};
  currentSheet[body.angle] = assetId || blob.url;

  // If generating front, also update portraitAssetId
  const updateData: Record<string, unknown> = { characterSheet: currentSheet };
  if (body.angle === "front" && assetId) {
    updateData.portraitAssetId = assetId;
  }

  await prisma.digitalActor.update({
    where: { id: body.actorId },
    data: updateData,
  });

  return Response.json({
    angle: body.angle,
    portraitUrl: blob.url,
    assetId,
    characterSheet: currentSheet,
  });
}

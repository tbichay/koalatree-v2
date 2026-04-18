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
    outfit?: string;
    traits?: string;
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

  // Body values win over DB values: lets Actor edit form generate with
  // unsaved outfit/traits edits without forcing a Speichern-Close-Reopen cycle.
  const outfit = body.outfit ?? actor.outfit ?? "";
  const traits = body.traits ?? actor.traits ?? "";
  const outfitHint = outfit ? ` WEARING: ${outfit}.` : "";
  const traitsHint = traits ? ` DISTINCTIVE FEATURES: ${traits}.` : "";

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

  // Build consistency-focused prompt when reference image exists.
  //
  // WICHTIG (2026-04-19): "SAME art style as reference" ist RAUS. Problem war
  // dass off-style Referenz-Portraits (z.B. photoreal statt Disney-2D) den
  // Style fuer alle Folge-Angles festgenagelt haben. Jetzt: wir uebernehmen
  // nur die IDENTITY (Spezies, Farben, Kleidung, Markierungen) — der Art-
  // Style wird jedes Mal frisch aus `styleHint` erzwungen. So koennen wir
  // einen falsch-gestyleten Char-Sheet-Durchlauf korrigieren ohne alle Refs
  // neu zu generieren.
  const consistencyPrompt = imageInputs.length > 0
    ? `IDENTITY REFERENCE: The character in the attached reference image.
Keep IDENTICAL from the reference:
- SAME species, SAME body proportions, SAME coloring and markings
- SAME clothing, accessories, and distinctive features
- SAME character identity

DO NOT copy from the reference:
- Art style or rendering technique (use the art style from the prompt below instead)
- Expression or mood (use the description below)
- Pose or framing (use the angle from the prompt below)

Render the SAME character fresh in the art style specified in the prompt:

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

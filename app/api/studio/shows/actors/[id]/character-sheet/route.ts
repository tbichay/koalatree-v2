/**
 * Unified-Actor Character-Sheet API.
 *
 * Gegenstueck zu `/api/studio/actors/character-sheet` (DigitalActor),
 * schreibt aber in `Actor.characterSheet` (JSONB) und — bei `angle=front` —
 * zusaetzlich `Actor.portraitUrl` + `Actor.portraitAssetId`.
 *
 * Admin-only.
 */

import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";
import { getStyleHint } from "@/lib/studio/visual-styles";

export const maxDuration = 800;

type Angle = "front" | "profile" | "fullBody";
type Ctx = { params: Promise<{ id: string }> };

const ANGLE_PROMPTS: Record<Angle, { suffix: string; size: string }> = {
  front: {
    suffix:
      "Head and shoulders portrait, facing the camera with a slight angle, expressive eyes, centered composition.",
    size: "1024x1024",
  },
  profile: {
    suffix:
      "Side profile view, looking to the right, showing facial profile clearly, head and shoulders, clean background.",
    size: "1024x1024",
  },
  fullBody: {
    suffix:
      "Full body portrait, head to toe, standing pose, showing complete outfit and body proportions, centered.",
    size: "1024x1536",
  },
};

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;

  const body = (await request.json()) as {
    angle: Angle;
    description: string;
    style?: string;
    outfit?: string;
    traits?: string;
  };

  if (!body.angle || !body.description) {
    return Response.json(
      { error: "angle und description sind erforderlich" },
      { status: 400 },
    );
  }

  if (!ANGLE_PROMPTS[body.angle]) {
    return Response.json(
      { error: "Ungueltiger Winkel. Erlaubt: front, profile, fullBody" },
      { status: 400 },
    );
  }

  const actor = await prisma.actor.findUnique({ where: { id } });
  if (!actor) return Response.json({ error: "Actor nicht gefunden" }, { status: 404 });

  const { createTask } = await import("@/lib/studio/task-tracker");
  const task = await createTask(
    session.user.id,
    "character-sheet",
    null,
    { actorId: id, angle: body.angle },
    8,
  );

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI();
    const style = body.style || actor.style || "realistic";
    const styleHint = getStyleHint(style);
    const angleConfig = ANGLE_PROMPTS[body.angle];

    const outfit = body.outfit ?? actor.outfit ?? "";
    const traits = body.traits ?? actor.traits ?? "";
    const outfitHint = outfit ? ` WEARING: ${outfit}.` : "";
    const traitsHint = traits ? ` DISTINCTIVE FEATURES: ${traits}.` : "";

    const rawDesc = `${body.description}.${outfitHint}${traitsHint} ${angleConfig.suffix}`;
    let prompt = `${styleHint}. Character: ${rawDesc} No text, no watermarks, no logos.`;

    const flat2DStyles = ["disney-2d", "ghibli", "storybook", "claymation"];
    const isFlat2D = flat2DStyles.includes(style);
    if (isFlat2D) {
      prompt = `ART STYLE (MANDATORY): ${styleHint}\n\nCharacter: ${rawDesc}\n\nFinal render must strictly match this art style: ${styleHint}. No text, no watermarks, no logos.`;
      console.log(`[Actor-CharSheet] ${body.angle} flat-2D skip-enhance: "${prompt.slice(0, 80)}..."`);
    } else {
      try {
        const { enhanceImagePrompt } = await import("@/lib/studio/image-quality");
        const enhanced = await enhanceImagePrompt(rawDesc, "character-sheet", styleHint, `Angle: ${body.angle}`);
        prompt = enhanced.prompt;
        console.log(`[Actor-CharSheet] ${body.angle} enhanced: "${prompt.slice(0, 80)}..." | ${enhanced.reasoning}`);
      } catch (enhErr) {
        console.warn(`[Actor-CharSheet] Prompt enhancement failed, using raw prompt:`, enhErr);
      }
    }

    // Identity-Reference fuer profile/fullBody: front-Portrait als Anker
    const currentSheet = (actor.characterSheet as Record<string, string> | null) || {};
    const frontRefUrl =
      body.angle !== "front"
        ? currentSheet.front || actor.portraitUrl || actor.portraitAssetId || null
        : null;

    const imageInputs: Array<{ image: string; detail: string }> = [];
    if (frontRefUrl && frontRefUrl.startsWith("http")) {
      try {
        const { getDownloadUrl } = await import("@vercel/blob");
        const downloadUrl = await getDownloadUrl(frontRefUrl);
        const imgRes = await fetch(downloadUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          imageInputs.push({ image: buf.toString("base64"), detail: "high" });
        }
      } catch {
        /* reference is optional */
      }
    }

    const consistencyPrompt =
      imageInputs.length > 0
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
      quality: "high",
    };
    if (imageInputs.length > 0) {
      generateParams.image = imageInputs;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.images.generate as any)(generateParams);

    const b64 = response.data[0]?.b64_json;
    if (!b64) {
      await task.fail("Character-Sheet lieferte keine Daten");
      return Response.json(
        { error: "Character Sheet Generierung fehlgeschlagen" },
        { status: 500 },
      );
    }

    const imgBuffer = Buffer.from(b64, "base64");
    const timestamp = Date.now();
    const [w, h] = angleConfig.size.split("x").map(Number);

    const blob = await put(
      `studio/shows-actors/${id}/character-sheet-${body.angle}-${timestamp}.png`,
      imgBuffer,
      { access: "private", contentType: "image/png" },
    );

    let assetId: string | undefined;
    try {
      const { createAsset } = await import("@/lib/assets");
      const asset = await createAsset({
        type: "portrait",
        category: `actor:${id}`,
        buffer: imgBuffer,
        filename: `actor-${id}-${body.angle}-${timestamp}.png`,
        mimeType: "image/png",
        width: w,
        height: h,
        generatedBy: { model: "gpt-image-1.5", prompt },
        modelId: "gpt-image-1.5",
        costCents: 4,
        userId: session.user.id,
        tags: ["actor", `actor:${id}`, `angle:${body.angle}`],
      });
      assetId = asset?.id;
    } catch {
      /* asset save optional */
    }

    currentSheet[body.angle] = blob.url;

    const updateData: Prisma.ActorUpdateInput = {
      characterSheet: currentSheet as Prisma.InputJsonValue,
    };
    if (body.angle === "front") {
      updateData.portraitUrl = blob.url;
      updateData.portraitAssetId = blob.url;
    }

    await prisma.actor.update({
      where: { id },
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

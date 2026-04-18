/**
 * Studio Actor Portrait API — Generate portrait for a DigitalActor
 *
 * POST: Generate portrait image from description (uses gpt-image-1)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";

export const maxDuration = 800;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    actorId: string;
    description: string;
    style?: string;
    outfit?: string;
    traits?: string;
  };

  if (!body.actorId || !body.description) {
    return Response.json({ error: "actorId und description sind erforderlich" }, { status: 400 });
  }

  // Verify ownership
  const actor = await prisma.digitalActor.findFirst({
    where: { id: body.actorId, userId: session.user.id },
  });
  if (!actor) return Response.json({ error: "Actor nicht gefunden" }, { status: 404 });

  const { createTask } = await import("@/lib/studio/task-tracker");
  const task = await createTask(session.user!.id!, "portrait", null, { actorId: body.actorId, style: body.style }, 8);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI();
  const style = body.style || "realistic";

  // Body values win over DB values: this lets the Actor edit form generate
  // with unsaved edits without the user having to click Speichern first.
  const outfit = body.outfit ?? actor.outfit ?? "";
  const traits = body.traits ?? actor.traits ?? "";

  // Enhance prompt with AI (graceful fallback if it fails)
  const outfitHint = outfit ? ` Outfit: ${outfit}.` : "";
  const traitsHint = traits ? ` Traits: ${traits}.` : "";
  const rawDescription = `${body.description}.${outfitHint}${traitsHint} Head and shoulders portrait.`;

  const { getStyleHint } = await import("@/lib/studio/visual-styles");
  const styleHint = getStyleHint(style || "realistic");

  let portraitPrompt = `${styleHint}. Character: ${rawDescription} No text, no watermarks.`;

  // FLAT-2D SKIP (2026-04-19): siehe character-sheet/route.ts. Claude-
  // Enhancement fuegt photoreal-Adjektive ein die 2D-Styles kaputtmachen.
  const flat2DStyles = ["disney-2d", "ghibli", "storybook", "claymation"];
  const isFlat2D = flat2DStyles.includes(style);
  if (isFlat2D) {
    portraitPrompt = `ART STYLE (MANDATORY): ${styleHint}\n\nCharacter: ${rawDescription}\n\nFinal render must strictly match this art style: ${styleHint}. No text, no watermarks.`;
    console.log(`[Portrait] flat-2D skip-enhance: "${portraitPrompt.slice(0, 80)}..."`);
  } else {
    try {
      const { enhanceImagePrompt } = await import("@/lib/studio/image-quality");
      const enhanced = await enhanceImagePrompt(rawDescription, "actor", style);
      portraitPrompt = enhanced.prompt;
      console.log(`[Portrait] Enhanced: "${portraitPrompt.slice(0, 80)}..." | ${enhanced.reasoning}`);
    } catch (enhErr) {
      console.warn(`[Portrait] Prompt enhancement failed, using raw prompt:`, enhErr);
    }
  }

  const response = await (openai.images.generate as any)({
    model: "gpt-image-1.5",
    prompt: portraitPrompt,
    n: 1,
    size: "1024x1024",
    quality: "medium",
  });

  const b64 = response.data[0]?.b64_json;
  if (!b64) return Response.json({ error: "Portrait-Generierung fehlgeschlagen" }, { status: 500 });

  const imgBuffer = Buffer.from(b64, "base64");
  const timestamp = Date.now();
  const blob = await put(
    `studio/actors/${body.actorId}/portrait-${timestamp}.png`,
    imgBuffer,
    { access: "private", contentType: "image/png" },
  );

  // Save as Asset and link to actor
  let assetId: string | undefined;
  try {
    const { createAsset } = await import("@/lib/assets");
    const asset = await createAsset({
      type: "portrait",
      category: `actor:${body.actorId}`,
      buffer: imgBuffer,
      filename: `actor-${body.actorId}-${timestamp}.png`,
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      generatedBy: { model: "gpt-image-1.5", prompt: portraitPrompt },
      modelId: "gpt-image-1.5",
      costCents: 4,
      userId: session.user.id,
      tags: ["actor", `actor:${body.actorId}`],
    });
    assetId = asset?.id;
  } catch { /* asset save optional */ }

  // Update actor with portrait — always use blob URL for display compatibility
  await prisma.digitalActor.update({
    where: { id: body.actorId },
    data: { portraitAssetId: blob.url },
  });

  await task.complete({ portraitUrl: blob.url });
  return Response.json({ portraitUrl: blob.url, assetId });
}

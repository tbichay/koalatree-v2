/**
 * Unified-Actor Portrait API.
 *
 * Gegenstueck zu `/api/studio/actors/portrait` (DigitalActor), schreibt aber
 * in die unified `Actor`-Tabelle. Admin-only — passt zum Muster von
 * `/api/studio/shows/actors/[id]`.
 *
 * Schreibt:
 *   - `Actor.portraitUrl`  (Blob-URL, fuer schnelles Rendern)
 *   - `Actor.portraitAssetId` (Blob-URL — Kompat zum Shows-Pipeline-Feld)
 *
 * Kein Ownership-Check (anders als DigitalActor): Admins koennen jeden
 * Actor editieren, inkl. Seed-Actors.
 */

import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

export const maxDuration = 800;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;

  const body = (await request.json()) as {
    description: string;
    style?: string;
    outfit?: string;
    traits?: string;
  };

  if (!body.description) {
    return Response.json({ error: "description ist erforderlich" }, { status: 400 });
  }

  const actor = await prisma.actor.findUnique({ where: { id } });
  if (!actor) return Response.json({ error: "Actor nicht gefunden" }, { status: 404 });

  const { createTask } = await import("@/lib/studio/task-tracker");
  const task = await createTask(
    session.user.id,
    "portrait",
    null,
    { actorId: id, style: body.style },
    8,
  );

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI();
    const style = body.style || "realistic";

    // Body > DB: Generate mit ungespeicherten Edits ermoeglichen.
    const outfit = body.outfit ?? actor.outfit ?? "";
    const traits = body.traits ?? actor.traits ?? "";
    const outfitHint = outfit ? ` Outfit: ${outfit}.` : "";
    const traitsHint = traits ? ` Traits: ${traits}.` : "";
    const rawDescription = `${body.description}.${outfitHint}${traitsHint} Head and shoulders portrait.`;

    const { getStyleHint } = await import("@/lib/studio/visual-styles");
    const styleHint = getStyleHint(style);

    let portraitPrompt = `${styleHint}. Character: ${rawDescription} No text, no watermarks.`;

    const flat2DStyles = ["disney-2d", "ghibli", "storybook", "claymation"];
    const isFlat2D = flat2DStyles.includes(style);
    if (isFlat2D) {
      portraitPrompt = `ART STYLE (MANDATORY): ${styleHint}\n\nCharacter: ${rawDescription}\n\nFinal render must strictly match this art style: ${styleHint}. No text, no watermarks.`;
      console.log(`[Actor-Portrait] flat-2D skip-enhance: "${portraitPrompt.slice(0, 80)}..."`);
    } else {
      try {
        const { enhanceImagePrompt } = await import("@/lib/studio/image-quality");
        const enhanced = await enhanceImagePrompt(rawDescription, "actor", style);
        portraitPrompt = enhanced.prompt;
        console.log(`[Actor-Portrait] Enhanced: "${portraitPrompt.slice(0, 80)}..." | ${enhanced.reasoning}`);
      } catch (enhErr) {
        console.warn(`[Actor-Portrait] Prompt enhancement failed, using raw prompt:`, enhErr);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.images.generate as any)({
      model: "gpt-image-1.5",
      prompt: portraitPrompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
    });

    const b64 = response.data[0]?.b64_json;
    if (!b64) {
      await task.fail("Portrait-Generierung lieferte keine Daten");
      return Response.json({ error: "Portrait-Generierung fehlgeschlagen" }, { status: 500 });
    }

    const imgBuffer = Buffer.from(b64, "base64");
    const timestamp = Date.now();
    const blob = await put(
      `studio/shows-actors/${id}/portrait-${timestamp}.png`,
      imgBuffer,
      { access: "private", contentType: "image/png" },
    );

    // Optional: Asset-Record
    let assetId: string | undefined;
    try {
      const { createAsset } = await import("@/lib/assets");
      const asset = await createAsset({
        type: "portrait",
        category: `actor:${id}`,
        buffer: imgBuffer,
        filename: `actor-${id}-${timestamp}.png`,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        generatedBy: { model: "gpt-image-1.5", prompt: portraitPrompt },
        modelId: "gpt-image-1.5",
        costCents: 4,
        userId: session.user.id,
        tags: ["actor", `actor:${id}`],
      });
      assetId = asset?.id;
    } catch {
      /* asset save optional */
    }

    await prisma.actor.update({
      where: { id },
      data: {
        portraitUrl: blob.url,
        portraitAssetId: blob.url,
      },
    });

    await task.complete({ portraitUrl: blob.url });
    return Response.json({ portraitUrl: blob.url, assetId });
  } catch (err) {
    await task.fail(err instanceof Error ? err.message : "Fehler");
    throw err;
  }
}

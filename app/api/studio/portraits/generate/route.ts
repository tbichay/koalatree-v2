import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { characterId, projectId, description, style, customPrompt } = body;

  // Load character for context
  const character = await prisma.studioCharacter.findFirst({
    where: { id: characterId, project: { id: projectId, userId: session.user.id } },
  });
  if (!character) return Response.json({ error: "Charakter nicht gefunden" }, { status: 404 });

  const openai = new OpenAI();

  // Build portrait prompt from character description + style
  const styleHint = style === "realistic"
    ? "Photorealistic portrait, cinematic lighting, shallow depth of field, professional photography style"
    : style === "disney-2d"
    ? "2D Disney animation style portrait, vibrant colors, hand-drawn feel"
    : style === "pixar-3d"
    ? "Pixar 3D animation style portrait, smooth CGI rendering"
    : style === "ghibli"
    ? "Studio Ghibli anime style portrait, soft pastel colors"
    : "High quality portrait";

  const portraitPrompt = customPrompt
    || `${styleHint}. Character: ${description || character.description || character.name}. ${character.species ? `Species: ${character.species}.` : ""} Head and shoulders portrait, looking slightly to the side, expressive eyes. No text, no watermarks, no logos.`;

  const response = await (openai.images.generate as any)({
    model: "gpt-image-1",
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
    `studio/${projectId}/portraits/${characterId}-${timestamp}.png`,
    imgBuffer,
    { access: "private", contentType: "image/png" },
  );

  // Update character with new portrait
  await prisma.studioCharacter.update({
    where: { id: characterId },
    data: { portraitUrl: blob.url },
  });

  // Save as Asset
  try {
    const { createAsset } = await import("@/lib/assets");
    await createAsset({
      type: "portrait",
      category: `character:${characterId}`,
      buffer: imgBuffer,
      filename: `${characterId}-${timestamp}.png`,
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      generatedBy: { model: "gpt-image-1", prompt: portraitPrompt },
      modelId: "gpt-image-1",
      costCents: 4,
      projectId,
      userId: session.user.id,
    });
  } catch { /* asset save optional */ }

  return Response.json({ portraitUrl: blob.url, prompt: portraitPrompt });
}

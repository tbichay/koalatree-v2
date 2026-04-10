/**
 * Studio Sequence Landscape API — Generate or upload landscape image
 *
 * POST: Generate landscape via GPT Image or upload
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
  });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const contentType = request.headers.get("content-type") || "";

  // Handle file upload
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.type.startsWith("image/")) {
      return Response.json({ error: "Bild erforderlich" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "png";
    const blob = await put(
      `studio/${projectId}/sequences/${sequenceId}/landscape.${ext}`,
      file,
      { access: "private", contentType: file.type },
    );

    await prisma.studioSequence.update({
      where: { id: sequenceId },
      data: { landscapeRefUrl: blob.url },
    });

    return Response.json({ landscapeUrl: blob.url });
  }

  // Handle AI generation
  const body = await request.json() as {
    prompt?: string;
    style?: string; // "pixar", "watercolor", "realistic"
  };

  const openai = new OpenAI();

  const location = sequence.location || "Magischer Wald";
  const atmosphere = sequence.atmosphereText || "Warmes goldenes Abendlicht";

  const imagePrompt = body.prompt
    || `Beautiful animated landscape scene: ${location}. ${atmosphere}. Lush, detailed environment. Pixar/Disney animation style. No characters, no text, no watermarks. Wide establishing shot. Cinematic composition.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.images.generate as any)({
    model: "gpt-image-1",
    prompt: imagePrompt,
    n: 1,
    size: "1536x1024", // Landscape format
    quality: "medium",
  });

  const b64 = response.data[0]?.b64_json;
  if (!b64) return Response.json({ error: "Bildgenerierung fehlgeschlagen" }, { status: 500 });

  const imgBuffer = Buffer.from(b64, "base64");
  const blob = await put(
    `studio/${projectId}/sequences/${sequenceId}/landscape.png`,
    imgBuffer,
    { access: "private", contentType: "image/png" },
  );

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: { landscapeRefUrl: blob.url },
  });

  // Save as Asset for the library
  try {
    const { createAsset } = await import("@/lib/assets");
    await createAsset({
      type: "landscape",
      category: `sequence:${sequenceId}`,
      buffer: imgBuffer,
      filename: `landscape-${sequenceId}.png`,
      mimeType: "image/png",
      width: 1536,
      height: 1024,
      generatedBy: { model: "gpt-image-1", prompt: imagePrompt },
      modelId: "gpt-image-1",
      costCents: 4,
      projectId,
      userId: session.user!.id!,
    });
  } catch (assetErr) {
    console.warn("[Landscape] Asset save failed:", assetErr);
  }

  return Response.json({ landscapeUrl: blob.url, prompt: imagePrompt });
}

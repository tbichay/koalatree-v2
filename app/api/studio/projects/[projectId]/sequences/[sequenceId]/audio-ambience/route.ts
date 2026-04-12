/**
 * Generate Ambience audio for a sequence
 *
 * POST: Generate ambient background sound via ElevenLabs SFX API
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import type { StudioScene } from "@/lib/studio/types";

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

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];

  // Find ambience description from sequence or scenes
  const ambiencePrompt = sequence.atmosphereText
    || scenes.find((s) => s.ambience)?.ambience
    || null;

  if (!ambiencePrompt) {
    return Response.json({ error: "Keine Ambience-Beschreibung vorhanden" }, { status: 400 });
  }

  try {
    const { generateSfx } = await import("@/lib/elevenlabs");
    const ambienceMp3 = await generateSfx(ambiencePrompt, 30);

    if (!ambienceMp3) {
      return Response.json({ error: "Ambience-Generierung gab kein Audio zurueck" }, { status: 500 });
    }

    const ambienceBuffer = Buffer.from(ambienceMp3);
    const blobPath = `studio/${projectId}/sequences/${sequenceId}/ambience-${Date.now()}.mp3`;
    const blob = await put(blobPath, ambienceBuffer, { access: "private", contentType: "audio/mpeg", addRandomSuffix: true });

    // Update sequence with ambience URL + set status to "audio"
    const dialogCount = scenes.filter((s) => s.dialogAudioUrl).length;
    await prisma.studioSequence.update({
      where: { id: sequenceId },
      data: {
        audioUrl: blob.url,
        status: dialogCount > 0 ? "audio" : sequence.status,
      },
    });

    return Response.json({ ambienceUrl: blob.url });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Ambience-Generierung fehlgeschlagen",
    }, { status: 500 });
  }
}

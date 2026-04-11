/**
 * Studio Actor Voice API — Voice Design + Save
 *
 * POST: Design a new voice from description (returns preview)
 * PUT: Save the designed voice permanently (updates actor with voiceId)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import { designVoice, saveDesignedVoice } from "@/lib/elevenlabs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    description: string;       // Voice description for ElevenLabs (e.g. "deep male voice, warm")
    sampleText?: string;       // Custom sample text to preview
    actorId?: string;
  };

  if (!body.description) {
    return Response.json({ error: "Stimm-Beschreibung ist erforderlich" }, { status: 400 });
  }

  // Build a multi-emotion sample text if none provided
  const defaultSample = [
    "Es war einmal vor langer, langer Zeit, in einem tiefen, dunklen Wald...",
    "Oh nein! Das ist ja schrecklich! Wir muessen sofort etwas tun!",
    "Ha! Das ist ja das Lustigste, was ich je gehoert habe!",
    "Komm, setz dich zu mir. Ich erzaehle dir eine Geschichte, die dein Herz beruehren wird.",
  ].join(" ");

  try {
    const result = await designVoice(body.description, body.sampleText || defaultSample);

    // Save preview audio to blob for playback
    let previewUrl: string | undefined;
    if (result.previewAudioBase64) {
      const audioBuffer = Buffer.from(result.previewAudioBase64, "base64");
      const blob = await put(
        `studio/actors/voice-preview-${Date.now()}.mp3`,
        audioBuffer,
        { access: "private", contentType: "audio/mpeg" },
      );
      previewUrl = blob.url;
    }

    // If actorId provided, update the actor with preview info
    if (body.actorId) {
      const actor = await prisma.digitalActor.findFirst({
        where: { id: body.actorId, userId: session.user.id },
      });
      if (actor) {
        await prisma.digitalActor.update({
          where: { id: body.actorId },
          data: { voicePreviewUrl: previewUrl },
        });
      }
    }

    return Response.json({
      generatedVoiceId: result.generatedVoiceId,
      previewUrl,
    });
  } catch (err) {
    console.error("[VoiceDesign] Error:", err);
    return Response.json({
      error: err instanceof Error ? err.message : "Voice Design fehlgeschlagen",
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    actorId: string;
    name: string;
    description: string;
    generatedVoiceId: string;
    voiceSettings?: Record<string, unknown>;
  };

  if (!body.actorId || !body.generatedVoiceId) {
    return Response.json({ error: "actorId und generatedVoiceId sind erforderlich" }, { status: 400 });
  }

  // Verify ownership
  const actor = await prisma.digitalActor.findFirst({
    where: { id: body.actorId, userId: session.user.id },
  });
  if (!actor) return Response.json({ error: "Actor nicht gefunden" }, { status: 404 });

  try {
    // Save voice permanently on ElevenLabs
    const permanentVoiceId = await saveDesignedVoice(
      body.name || actor.name,
      body.description || actor.description || "",
      body.generatedVoiceId,
    );

    // Default voice settings for a custom voice
    const defaultSettings = body.voiceSettings || {
      stability: 0.45,
      similarity_boost: 0.70,
      style: 0.50,
      use_speaker_boost: true,
      speed: 1.0,
    };

    // Update actor with permanent voice ID
    const updatedActor = await prisma.digitalActor.update({
      where: { id: body.actorId },
      data: {
        voiceId: permanentVoiceId,
        voiceSettings: JSON.parse(JSON.stringify(defaultSettings)),
      },
    });

    return Response.json({
      actor: updatedActor,
      voiceId: permanentVoiceId,
    });
  } catch (err) {
    console.error("[VoiceSave] Error:", err);
    return Response.json({
      error: err instanceof Error ? err.message : "Voice speichern fehlgeschlagen",
    }, { status: 500 });
  }
}

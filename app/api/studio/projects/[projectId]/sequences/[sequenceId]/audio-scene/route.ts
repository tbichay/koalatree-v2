/**
 * Per-Scene Audio Generation — Generate TTS/SFX for ONE scene at a time
 *
 * POST: Generate audio for a single scene (dialog + SFX)
 * Called once per scene by the client, avoiding long SSE connections.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import type { StudioScene } from "@/lib/studio/types";
import type { CharacterVoiceSettings } from "@/lib/types";
import { CHARACTERS } from "@/lib/types";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as { sceneIndex: number; totalDurationMs?: number };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
    include: { project: { include: { characters: true } } },
  });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const scene = scenes[body.sceneIndex];
  if (!scene) return Response.json({ error: `Szene ${body.sceneIndex} nicht gefunden` }, { status: 404 });

  const totalDurationMs = body.totalDurationMs || 0;

  try {
    const { generateSingleTTS, generateSfx } = await import("@/lib/elevenlabs");
    const charMap = new Map(sequence.project.characters.map((c) => [c.id, c]));

    let dialogUrl: string | undefined;
    let dialogDurationMs: number | undefined;
    let sfxUrl: string | undefined;

    // Dialog TTS — also handle scenes with spokenText but missing characterId (fallback to first character)
    const projChars = sequence.project.characters;
    if (scene.spokenText && (scene.characterId || projChars.length > 0)) {
      const effectiveCharId = scene.characterId || projChars[0]?.markerId || projChars[0]?.id;
      const char = effectiveCharId ? charMap.get(effectiveCharId) : projChars[0];

      let voiceId: string;
      let voiceSettings: CharacterVoiceSettings;

      if (char?.voiceId && char?.voiceSettings) {
        voiceId = char.voiceId;
        voiceSettings = char.voiceSettings as unknown as CharacterVoiceSettings;
      } else {
        const knownId = char?.name.toLowerCase() || "koda";
        const knownChar = CHARACTERS[knownId] || CHARACTERS.koda;
        voiceId = knownChar.voiceId;
        voiceSettings = { ...knownChar.voiceSettings };
      }

      // Apply basic emotion adjustments
      const { buildEmotionContext, applyEmotion } = await import("@/lib/studio/tts-emotion");
      const emotionResult = buildEmotionContext({ emotion: scene.emotion || "neutral", characterName: char?.name });
      const settings = applyEmotion({ ...voiceSettings }, emotionResult);

      const { mp3, durationMs } = await generateSingleTTS(scene.spokenText, voiceId, settings);
      const audioBuffer = Buffer.from(mp3);
      const blobPath = `studio/${projectId}/sequences/${sequenceId}/dialog-${String(body.sceneIndex).padStart(3, "0")}-${Date.now()}.mp3`;
      const blob = await put(blobPath, audioBuffer, { access: "private", contentType: "audio/mpeg", addRandomSuffix: true });

      dialogUrl = blob.url;
      dialogDurationMs = Math.round(durationMs);
    }

    // SFX
    if (scene.sfx) {
      try {
        const sfxDuration = scene.durationHint || 5;
        const sfxMp3 = await generateSfx(scene.sfx, sfxDuration);
        if (sfxMp3) {
          const sfxBuffer = Buffer.from(sfxMp3);
          const sfxBlobPath = `studio/${projectId}/sequences/${sequenceId}/sfx-${String(body.sceneIndex).padStart(3, "0")}-${Date.now()}.mp3`;
          const sfxBlob = await put(sfxBlobPath, sfxBuffer, { access: "private", contentType: "audio/mpeg", addRandomSuffix: true });
          sfxUrl = sfxBlob.url;
        }
      } catch (err) {
        console.warn(`[AudioScene] SFX failed for scene ${body.sceneIndex}:`, err);
        // SFX failure is non-fatal
      }
    }

    // Update scene in DB
    const updatedScenes = [...scenes];
    updatedScenes[body.sceneIndex] = {
      ...updatedScenes[body.sceneIndex],
      ...(dialogUrl && {
        dialogAudioUrl: dialogUrl,
        dialogDurationMs,
        audioStartMs: Math.round(totalDurationMs),
        audioEndMs: Math.round(totalDurationMs + (dialogDurationMs || 0)),
      }),
      ...(sfxUrl && { sfxAudioUrl: sfxUrl }),
    };

    await prisma.studioSequence.update({
      where: { id: sequenceId },
      data: { scenes: JSON.parse(JSON.stringify(updatedScenes)) },
    });

    return Response.json({
      sceneIndex: body.sceneIndex,
      dialogUrl,
      dialogDurationMs,
      sfxUrl,
      newTotalDurationMs: totalDurationMs + (dialogDurationMs || 0),
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Audio-Generierung fehlgeschlagen",
      sceneIndex: body.sceneIndex,
    }, { status: 500 });
  }
}

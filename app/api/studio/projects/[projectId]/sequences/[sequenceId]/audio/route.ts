/**
 * Studio Sequence Audio API — Per-Scene Audio Generation
 *
 * POST: Generate audio per scene (dialog TTS + SFX + ambience) via SSE
 * GET: Get audio status/URL
 *
 * V2 Audio Architecture:
 * - Each dialog scene gets its own TTS audio (dialogAudioUrl)
 * - Each scene with SFX gets its own sound effect (sfxAudioUrl)
 * - One ambience track per sequence (stored as sequence audioUrl)
 * - Remotion mixes all layers in the final film
 */

import { auth } from "@/lib/auth";
// Also supports internal task worker auth via resolveUserId
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import {
  validateVoiceConfig,
  estimateAudioDuration,
  type SequenceCharacter,
} from "@/lib/studio/sequence-audio";
import type { StudioScene } from "@/lib/studio/types";
import type { CharacterVoiceSettings } from "@/lib/types";
import { CHARACTERS } from "@/lib/types";

export const maxDuration = 800;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
    select: { audioUrl: true, audioDauerSek: true, timeline: true, status: true },
  });

  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  return Response.json({
    audioUrl: sequence.audioUrl,
    duration: sequence.audioDauerSek,
    timeline: sequence.timeline,
    status: sequence.status,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  // Support both session auth and internal task worker auth
  const { resolveUserId } = await import("@/lib/studio/task-auth");
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as { force?: boolean };

  // Load sequence with project and characters
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId } },
    include: {
      project: {
        include: { characters: true },
      },
    },
  });

  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // Return cached if not forcing
  if (!body.force && sequence.audioUrl) {
    return Response.json({
      audioUrl: sequence.audioUrl,
      duration: sequence.audioDauerSek,
      timeline: sequence.timeline,
      cached: true,
    });
  }

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  if (scenes.length === 0) {
    return Response.json({ error: "Keine Szenen in dieser Sequenz" }, { status: 400 });
  }

  // Build character list
  const characters: SequenceCharacter[] = sequence.project.characters.map((c) => ({
    id: c.id,
    name: c.name,
    markerId: c.markerId,
    voiceId: c.voiceId || undefined,
    voiceSettings: c.voiceSettings as unknown as SequenceCharacter["voiceSettings"],
  }));

  // Validate voices
  const missingVoices = validateVoiceConfig(scenes, characters);
  if (missingVoices.length > 0) {
    return Response.json({
      error: `Fehlende Stimmen: ${missingVoices.join(", ")}. Bitte Voice-IDs zuweisen.`,
    }, { status: 400 });
  }

  // SSE streaming for progress
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* */ }
      };

      const keepAlive = setInterval(() => send({ progress: "generating..." }), 5000);

      try {
        const estDuration = estimateAudioDuration(scenes);
        send({ progress: `Per-Scene Audio (~${Math.ceil(estDuration)}s)...`, estimatedDuration: estDuration });

        const { generateSingleTTS, generateSfx } = await import("@/lib/elevenlabs");

        // Build character lookup
        const charMap = new Map(characters.map((c) => [c.id, c]));

        const updatedScenes = [...scenes];
        const timeline: { characterId: string; startMs: number; endMs: number }[] = [];
        let totalDurationMs = 0;
        let dialogCount = 0;
        let sfxCount = 0;

        // ── Phase 1: Per-scene dialog + SFX ──
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];

          // Dialog TTS (only for scenes with spokenText)
          if (scene.spokenText && scene.characterId) {
            dialogCount++;
            send({ progress: `Dialog ${dialogCount}: Szene ${i + 1}/${scenes.length}...` });

            const char = charMap.get(scene.characterId);

            // Resolve voice ID and settings
            let voiceId: string;
            let voiceSettings: CharacterVoiceSettings;

            if (char?.voiceId && char?.voiceSettings) {
              // Custom character voice from DB
              voiceId = char.voiceId;
              voiceSettings = char.voiceSettings as unknown as CharacterVoiceSettings;
            } else {
              // Fall back to known KoalaTree characters
              const knownId = char?.name.toLowerCase() || "koda";
              const knownChar = CHARACTERS[knownId] || CHARACTERS.koda;
              voiceId = knownChar.voiceId;
              voiceSettings = { ...knownChar.voiceSettings };
            }

            // Apply emotional modifiers
            const emotion = scene.emotion || "neutral";
            const settings = { ...voiceSettings };
            if (emotion === "dramatic" || emotion === "tense" || emotion === "angry") {
              settings.stability = Math.max(0.2, settings.stability - 0.1);
              settings.style = Math.min(1.0, (settings.style || 0.5) + 0.15);
              settings.speed = (settings.speed || 1.0) * 1.05;
            }
            if (emotion === "calm" || emotion === "sad") {
              settings.stability = Math.min(0.8, settings.stability + 0.1);
              settings.speed = (settings.speed || 1.0) * 0.9;
            }
            if (emotion === "excited" || emotion === "joyful") {
              settings.stability = Math.max(0.2, settings.stability - 0.05);
              settings.speed = (settings.speed || 1.0) * 1.1;
            }

            try {
              const { mp3, durationMs } = await generateSingleTTS(scene.spokenText, voiceId, settings);
              const audioBuffer = Buffer.from(mp3);

              // Upload to blob
              const blobPath = `studio/${projectId}/sequences/${sequenceId}/dialog-${String(i).padStart(3, "0")}.mp3`;
              const blob = await put(blobPath, audioBuffer, { access: "private", contentType: "audio/mpeg" });

              updatedScenes[i] = {
                ...updatedScenes[i],
                dialogAudioUrl: blob.url,
                dialogDurationMs: Math.round(durationMs),
                audioStartMs: Math.round(totalDurationMs),
                audioEndMs: Math.round(totalDurationMs + durationMs),
              };

              timeline.push({
                characterId: scene.characterId,
                startMs: Math.round(totalDurationMs),
                endMs: Math.round(totalDurationMs + durationMs),
              });

              totalDurationMs += durationMs;
            } catch (err) {
              console.error(`[PerSceneAudio] Dialog TTS failed for scene ${i}:`, err);
              send({ progress: `Dialog ${dialogCount} fehlgeschlagen, weiter...` });
            }
          }

          // SFX (for scenes with sfx field)
          if (scene.sfx) {
            sfxCount++;
            send({ progress: `SFX ${sfxCount}: "${scene.sfx.slice(0, 30)}..."` });

            try {
              const sfxDuration = scene.durationHint || 5;
              const sfxMp3 = await generateSfx(scene.sfx, sfxDuration);
              if (sfxMp3) {
                const sfxBuffer = Buffer.from(sfxMp3);
                const sfxBlobPath = `studio/${projectId}/sequences/${sequenceId}/sfx-${String(i).padStart(3, "0")}.mp3`;
                const sfxBlob = await put(sfxBlobPath, sfxBuffer, { access: "private", contentType: "audio/mpeg" });

                updatedScenes[i] = {
                  ...updatedScenes[i],
                  sfxAudioUrl: sfxBlob.url,
                };
              }
            } catch (err) {
              console.error(`[PerSceneAudio] SFX failed for scene ${i}:`, err);
            }
          }
        }

        // ── Phase 2: Ambience (once per sequence) ──
        let ambienceUrl: string | undefined;
        const ambiencePrompt = sequence.atmosphereText
          || scenes.find((s) => s.ambience)?.ambience
          || null;

        if (ambiencePrompt) {
          send({ progress: "Generiere Ambience..." });
          try {
            const ambienceMp3 = await generateSfx(ambiencePrompt, 30);
            if (ambienceMp3) {
              const ambienceBuffer = Buffer.from(ambienceMp3);
              const ambienceBlobPath = `studio/${projectId}/sequences/${sequenceId}/ambience.mp3`;
              const ambienceBlob = await put(ambienceBlobPath, ambienceBuffer, { access: "private", contentType: "audio/mpeg" });
              ambienceUrl = ambienceBlob.url;
            }
          } catch (err) {
            console.error("[PerSceneAudio] Ambience generation failed:", err);
          }
        }

        send({ progress: "Speichere..." });

        // Save to DB — audioUrl now stores ambience (continuous background)
        await prisma.studioSequence.update({
          where: { id: sequenceId },
          data: {
            audioUrl: ambienceUrl || null,
            audioDauerSek: totalDurationMs / 1000,
            timeline: JSON.parse(JSON.stringify(timeline)),
            scenes: JSON.parse(JSON.stringify(updatedScenes)),
            status: "audio",
          },
        });

        clearInterval(keepAlive);
        send({
          done: true,
          audioUrl: ambienceUrl,
          duration: totalDurationMs / 1000,
          timeline,
          dialogCount,
          sfxCount,
          hasAmbience: !!ambienceUrl,
        });
      } catch (err) {
        clearInterval(keepAlive);
        console.error("[PerSceneAudio] Error:", err);
        send({ done: true, error: err instanceof Error ? err.message : "Fehler bei Audio-Generierung" });
      }
      try { controller.close(); } catch { /* */ }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

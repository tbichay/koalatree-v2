/**
 * Studio Sequence Audio API — Generate audio for a single sequence
 *
 * POST: Generate audio from sequence scenes (SSE streaming)
 * GET: Get audio status/URL
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import {
  scenesToSegments,
  calculateSceneTiming,
  validateVoiceConfig,
  estimateAudioDuration,
  type SequenceCharacter,
} from "@/lib/studio/sequence-audio";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 120;

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
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as { force?: boolean };

  // Load sequence with project and characters
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
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
        // Estimate duration
        const estDuration = estimateAudioDuration(scenes);
        send({ progress: `Generiere Audio (~${Math.ceil(estDuration)}s)...`, estimatedDuration: estDuration });

        // Convert scenes to segments
        const segments = scenesToSegments(scenes, characters);
        if (segments.length === 0) {
          send({ done: true, error: "Keine Sprache in den Szenen gefunden" });
          clearInterval(keepAlive);
          try { controller.close(); } catch { /* */ }
          return;
        }

        send({ progress: `${segments.length} Sprach-Segmente, starte TTS...` });

        // Generate audio using the existing pipeline
        const { generateMultiVoiceAudio } = await import("@/lib/elevenlabs");
        const result = await generateMultiVoiceAudio(segments);

        send({ progress: "Audio generiert, speichere..." });

        // Upload to Vercel Blob
        const audioBuffer = Buffer.from(result.wav);
        const blob = await put(
          `studio/${projectId}/sequences/${sequenceId}/audio.mp3`,
          audioBuffer,
          { access: "private", contentType: "audio/mpeg" },
        );

        // Calculate scene timing from timeline
        const sceneTiming = calculateSceneTiming(scenes, result.timeline);
        const durationMs = result.timeline.length > 0
          ? Math.max(...result.timeline.map((t) => t.endMs))
          : 0;

        // Update scenes with audio timing
        const updatedScenes = scenes.map((scene) => {
          const timing = sceneTiming.find((t) => t.sceneId === scene.id);
          if (timing) {
            return { ...scene, audioStartMs: timing.startMs, audioEndMs: timing.endMs };
          }
          return scene;
        });

        // Save to DB
        await prisma.studioSequence.update({
          where: { id: sequenceId },
          data: {
            audioUrl: blob.url,
            audioDauerSek: durationMs / 1000,
            timeline: JSON.parse(JSON.stringify(result.timeline)),
            scenes: JSON.parse(JSON.stringify(updatedScenes)),
            status: "audio",
          },
        });

        clearInterval(keepAlive);
        send({
          done: true,
          audioUrl: blob.url,
          duration: durationMs / 1000,
          timeline: result.timeline,
          sceneTiming,
          segments: segments.length,
        });
      } catch (err) {
        clearInterval(keepAlive);
        console.error("[SequenceAudio] Error:", err);
        send({ done: true, error: err instanceof Error ? err.message : "Fehler bei Audio-Generierung" });
      }
      try { controller.close(); } catch { /* */ }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

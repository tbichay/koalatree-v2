/**
 * Studio Film Assembly API — Combine all sequence clips into final film
 *
 * POST: Assemble film via Remotion Lambda (SSE streaming)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json() as {
    format?: "portrait" | "wide";
    musicUrl?: string;
    musicVolume?: number;
    force?: boolean;
  };

  // Load project with all sequences
  const project = await prisma.studioProject.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: {
      sequences: { orderBy: { orderIndex: "asc" } },
    },
  });

  if (!project) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // Return cached if not forcing
  if (!body.force && project.videoUrl) {
    return Response.json({ videoUrl: project.videoUrl, cached: true });
  }

  // Validate: all sequences must have audio + clips
  const incomplete = project.sequences.filter(
    (s) => !s.audioUrl || !["clips", "mastered"].includes(s.status),
  );
  if (incomplete.length > 0) {
    return Response.json({
      error: `${incomplete.length} Sequenzen noch nicht fertig: ${incomplete.map((s) => s.name).join(", ")}`,
    }, { status: 400 });
  }

  // SSE streaming
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* */ }
      };

      send({ progress: "Bereite Film-Assembly vor..." });
      const keepAlive = setInterval(() => send({ progress: "rendering..." }), 5000);

      try {
        // Collect all scenes from all sequences in order
        const allScenes: Array<{
          videoUrl: string;
          durationMs: number;
          type: string;
          characterId?: string;
        }> = [];

        // First audio URL serves as the continuous story audio
        // For V2, we concatenate per-sequence — but Remotion needs a single audio track
        // Use the first sequence's audio for now; full concat comes later
        const audioUrls: string[] = [];

        for (const seq of project.sequences) {
          const scenes = (seq.scenes as unknown as StudioScene[]) || [];

          if (seq.audioUrl) audioUrls.push(seq.audioUrl);

          for (const scene of scenes) {
            if (scene.videoUrl && scene.status === "done") {
              allScenes.push({
                videoUrl: scene.videoUrl,
                durationMs: scene.audioEndMs - scene.audioStartMs || (scene.durationHint || 5) * 1000,
                type: scene.type,
                characterId: scene.characterId,
              });
            }
          }
        }

        if (allScenes.length === 0) {
          throw new Error("Keine fertigen Clips gefunden");
        }

        send({ progress: `${allScenes.length} Clips, starte Remotion Lambda...` });

        // Render via Remotion Lambda
        const { renderFilmOnLambda } = await import("@/lib/film-render");
        const videoUrl = await renderFilmOnLambda({
          geschichteId: projectId,
          scenes: allScenes,
          storyAudioUrl: audioUrls[0], // TODO: concatenate all audio URLs
          backgroundMusicUrl: body.musicUrl,
          musicVolume: body.musicVolume ?? 0.08,
          title: project.name,
          subtitle: "KoalaTree Studio",
          format: body.format || "portrait",
          onProgress: (pct, msg) => {
            send({ progress: msg, percent: pct });
          },
        });

        // Save to project
        await prisma.studioProject.update({
          where: { id: projectId },
          data: {
            videoUrl,
            status: "completed",
          },
        });

        // Mark all sequences as mastered
        await prisma.studioSequence.updateMany({
          where: { projectId, status: "clips" },
          data: { status: "mastered" },
        });

        clearInterval(keepAlive);
        send({
          done: true,
          videoUrl,
          scenes: allScenes.length,
          sequences: project.sequences.length,
        });
      } catch (err) {
        clearInterval(keepAlive);
        console.error("[Assemble] Error:", err);
        send({ done: true, error: err instanceof Error ? err.message : "Fehler bei Film-Assembly" });
      }
      try { controller.close(); } catch { /* */ }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

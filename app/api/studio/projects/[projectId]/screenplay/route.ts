/**
 * Studio Screenplay API — Generate or update screenplay for a project
 *
 * POST: Generate screenplay (basis storyboard → film screenplay)
 * PUT: Update screenplay (manual edits)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const project = await prisma.studioProject.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { characters: true },
  });

  if (!project) return Response.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  if (!project.storyText) return Response.json({ error: "Keine Geschichte vorhanden" }, { status: 400 });

  const body = await request.json() as {
    directingStyle?: string;
    atmosphere?: string;
    atmospherePreset?: string;
    force?: boolean;
  };

  // Return cached if not forcing regeneration
  if (!body.force && project.screenplay) {
    return Response.json({ screenplay: project.screenplay, cached: true });
  }

  // SSE for long-running generation
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* */ }
      };

      send({ progress: "Analysiere Geschichte..." });
      const keepAlive = setInterval(() => send({ progress: "generating..." }), 5000);

      try {
        // Step 1: Generate basis storyboard
        send({ progress: "Extrahiere Story-Beats..." });
        const { generateBasisStoryboard } = await import("@/lib/studio/storyboard-generator");
        const basisStoryboard = await generateBasisStoryboard(
          project.storyText!,
          project.language,
        );
        basisStoryboard.title = project.name;

        const { extractCharacters: extractChars } = await import("@/lib/studio/character-extractor");
        // Step 2: Extract/use characters
        let characters: import("@/lib/studio/types").StudioCharacterDef[] = project.characters.map((c) => ({
          id: c.id,
          name: c.name,
          markerId: c.markerId,
          description: c.description || "",
          personality: c.personality || undefined,
          species: c.species || undefined,
          role: (c.role || "supporting") as "lead" | "supporting" | "narrator" | "minor",
          portraitUrl: c.portraitUrl || undefined,
          voiceId: c.voiceId || undefined,
          voiceSettings: c.voiceSettings as import("@/lib/studio/types").StudioCharacterDef["voiceSettings"],
          emoji: c.emoji || undefined,
          color: c.color || undefined,
        }));

        // Auto-extract characters if none exist
        if (characters.length === 0) {
          send({ progress: "Extrahiere Charaktere..." });
          const { extractCharacters } = await import("@/lib/studio/character-extractor");
          const extracted = await extractCharacters(project.storyText!);
          characters = extracted;

          // Save extracted characters to DB
          for (const c of extracted) {
            await prisma.studioCharacter.create({
              data: {
                projectId,
                name: c.name,
                markerId: c.markerId,
                description: c.description,
                personality: c.personality,
                species: c.species,
                role: c.role,
                emoji: c.emoji,
              },
            });
          }
          send({ progress: `${extracted.length} Charaktere extrahiert` });
        }

        // Step 3: Generate screenplay
        send({ progress: "Erstelle Drehbuch mit Regie-Anweisungen..." });
        const { generateScreenplay } = await import("@/lib/studio/screenplay-generator");
        const screenplay = await generateScreenplay({
          storyboard: basisStoryboard,
          characters,
          directingStyle: body.directingStyle || project.directingStyle || "pixar-classic",
          atmosphere: body.atmosphere,
          atmospherePreset: body.atmospherePreset,
          stylePrompt: project.stylePrompt || undefined,
        });

        // Save to DB
        await prisma.studioProject.update({
          where: { id: projectId },
          data: {
            basisStoryboard: JSON.parse(JSON.stringify(basisStoryboard)),
            screenplay: JSON.parse(JSON.stringify(screenplay)),
            status: "screenplay",
            directingStyle: body.directingStyle || project.directingStyle,
          },
        });

        // Delete old sequences and create fresh ones
        await prisma.studioSequence.deleteMany({ where: { projectId } });

        for (const act of screenplay.acts) {
          for (const seq of act.sequences) {
            await prisma.studioSequence.create({
              data: {
                projectId,
                orderIndex: seq.orderIndex,
                name: seq.name,
                location: seq.location,
                atmosphereText: seq.atmosphere,
                directingStyle: seq.directingStyle,
                storySegment: seq.storySegment,
                characterIds: seq.characterIds,
                scenes: JSON.parse(JSON.stringify(seq.scenes)),
                sceneCount: seq.scenes.length,
                status: "storyboard",
              },
            });
          }
        }

        clearInterval(keepAlive);
        send({
          done: true,
          screenplay,
          basisStoryboard,
          characters,
          sequences: screenplay.acts.flatMap((a: { sequences: unknown[] }) => a.sequences).length,
          scenes: screenplay.totalScenes,
        });
      } catch (err) {
        clearInterval(keepAlive);
        send({ done: true, error: err instanceof Error ? err.message : "Fehler" });
      }
      try { controller.close(); } catch { /* */ }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json() as { screenplay: unknown };

  await prisma.studioProject.update({
    where: { id: projectId },
    data: { screenplay: JSON.parse(JSON.stringify(body.screenplay)) },
  });

  return Response.json({ saved: true });
}

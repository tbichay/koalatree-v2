/**
 * Studio Screenplay API — Generate or update screenplay for a project
 *
 * POST: Generate screenplay (basis storyboard → film screenplay)
 * PUT: Update screenplay (manual edits)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const maxDuration = 800;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const project = await prisma.studioProject.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { characters: { include: { actor: true }, orderBy: { orderIndex: "asc" } } },
  });

  if (!project) return Response.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  if (!project.storyText) return Response.json({ error: "Keine Geschichte vorhanden" }, { status: 400 });

  const body = await request.json() as {
    directingStyle?: string;
    atmosphere?: string;
    atmospherePreset?: string;
    mode?: "film" | "audiobook";
    force?: boolean;
    selectedLocationIds?: string[];
    selectedPropIds?: string[];
    sequenceMode?: "full" | "next";
  };

  // For "next" mode, load existing sequences to pass as context
  let existingDbSequences: Array<{ name: string; location: string | null; sceneCount: number | null; orderIndex: number }> = [];
  if (body.sequenceMode === "next") {
    existingDbSequences = await prisma.studioSequence.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      select: { name: true, location: true, sceneCount: true, orderIndex: true },
    });
  }

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

      const { createTask } = await import("@/lib/studio/task-tracker");
      const task = await createTask(session.user!.id!, "screenplay", projectId, { directingStyle: body.directingStyle }, 5);

      send({ progress: "Analysiere Geschichte...", taskId: task.id });
      // Keep-alive every 2s to prevent Vercel from closing connection
      const keepAlive = setInterval(() => send({ progress: "generating..." }), 2000);

      try {
        // Step 1: Generate basis storyboard
        await task.progress("Extrahiere Story-Beats...", 10);
        send({ progress: "Extrahiere Story-Beats..." });
        const { generateBasisStoryboard } = await import("@/lib/studio/storyboard-generator");
        const basisStoryboard = await generateBasisStoryboard(
          project.storyText!,
          project.language,
        );
        basisStoryboard.title = project.name;

        const { extractCharacters: extractChars } = await import("@/lib/studio/character-extractor");
        // Step 2: Extract/use characters
        let characters: import("@/lib/studio/types").StudioCharacterDef[] = project.characters.map((c) => {
          // Build rich description from character + actor data
          const actor = (c as unknown as { actor?: { description?: string; outfit?: string; traits?: string } }).actor;
          let description = c.description || "";
          if (actor?.outfit) description += ` Outfit: ${actor.outfit}.`;
          if (actor?.traits) description += ` Traits: ${actor.traits}.`;

          return {
            id: c.id,
            name: c.name,
            markerId: c.markerId,
            description,
            personality: c.personality || undefined,
            species: c.species || undefined,
            role: (c.role || "supporting") as "lead" | "supporting" | "narrator" | "minor",
            portraitUrl: c.portraitUrl || undefined,
            voiceId: c.voiceId || undefined,
            voiceSettings: c.voiceSettings as import("@/lib/studio/types").StudioCharacterDef["voiceSettings"],
            emoji: c.emoji || undefined,
            color: c.color || undefined,
          };
        });

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

        // Step 2.5: Load available locations from Library
        let locationRefs: import("@/lib/studio/screenplay-generator").LocationRef[] = [];
        try {
          const { getAssets } = await import("@/lib/assets");
          // Load ALL landscape assets (includes both "location" category and old uncategorized ones)
          const locationAssets = await getAssets({
            type: "landscape",
            userId: session.user!.id!,
          });
          const filteredLocations = body.selectedLocationIds
            ? locationAssets.filter((a) => body.selectedLocationIds!.includes(a.id))
            : locationAssets;
          locationRefs = filteredLocations.map((a) => ({
            id: a.id,
            name: (a as { name?: string }).name || a.category || "Unbenannte Location",
            description: (a.generatedBy as { prompt?: string })?.prompt || "",
            imageUrl: a.blobUrl,
            tags: a.tags,
          }));
          if (locationRefs.length > 0) {
            send({ progress: `${locationRefs.length} Locations fuer Drehbuch ausgewaehlt` });
          }
        } catch {
          // No locations — continue without
        }

        // Also load props from Library
        let propRefs: { id: string; name: string; description: string }[] = [];
        try {
          const { getAssets: getPropsAssets } = await import("@/lib/assets");
          const propAssets = await getPropsAssets({
            type: "reference" as any,
            category: "prop",
            userId: session.user!.id!,
          });
          const filteredProps = body.selectedPropIds
            ? propAssets.filter((a) => body.selectedPropIds!.includes(a.id))
            : propAssets;
          propRefs = filteredProps.map((a) => ({
            id: a.id,
            name: (a as { name?: string }).name || "Prop",
            description: (a.generatedBy as { prompt?: string })?.prompt || "",
          }));
          if (propRefs.length > 0) {
            send({ progress: `${propRefs.length} Props fuer Drehbuch ausgewaehlt` });
          }
        } catch {
          // No props — continue without
        }

        // Step 3: Generate screenplay
        send({ progress: "Erstelle Drehbuch mit Regie-Anweisungen..." });
        const { generateScreenplay } = await import("@/lib/studio/screenplay-generator");
        // Build existing sequences context for "next" mode
        const existingSequenceRefs = body.sequenceMode === "next" && existingDbSequences.length > 0
          ? existingDbSequences.map((s) => ({
              name: s.name,
              location: s.location || "",
              sceneCount: s.sceneCount || 0,
            }))
          : undefined;

        const screenplay = await generateScreenplay({
          storyboard: basisStoryboard,
          characters,
          directingStyle: body.directingStyle || project.directingStyle || "pixar-classic",
          atmosphere: body.atmosphere,
          atmospherePreset: body.atmospherePreset,
          stylePrompt: project.stylePrompt || undefined,
          targetDurationSec: (project as { targetDurationSec?: number }).targetDurationSec || undefined,
          mode: body.mode || "audiobook",
          locations: locationRefs.length > 0 ? locationRefs : undefined,
          props: propRefs.length > 0 ? propRefs : undefined,
          existingSequences: existingSequenceRefs,
          sequenceMode: body.sequenceMode || "full",
        });

        // Save to DB (store mode in screenplay metadata)
        const screenplayWithMeta = { ...screenplay, mode: body.mode || "audiobook" };
        await prisma.studioProject.update({
          where: { id: projectId },
          data: {
            basisStoryboard: JSON.parse(JSON.stringify(basisStoryboard)),
            screenplay: JSON.parse(JSON.stringify(screenplayWithMeta)),
            status: "screenplay",
            directingStyle: body.directingStyle || project.directingStyle,
          },
        });

        // For "full" mode: delete old sequences and create fresh ones
        // For "next" mode: keep existing sequences and only append new ones
        if (body.sequenceMode !== "next") {
          await prisma.studioSequence.deleteMany({ where: { projectId } });
        }

        // Smart location assignment: match each sequence to the BEST location
        // based on name/description similarity
        function matchLocationToSequence(
          seqLocation: string,
          locations: typeof locationRefs,
        ): string | undefined {
          if (locations.length === 0) return undefined;
          if (locations.length === 1) return locations[0].imageUrl;

          // Try exact locationId match first
          const seqLower = seqLocation.toLowerCase();

          // Score each location by keyword overlap with sequence location text
          let bestScore = -1;
          let bestUrl = locations[0].imageUrl; // default to first

          for (const loc of locations) {
            let score = 0;
            const locName = (loc.name || "").toLowerCase();
            const locDesc = (loc.description || "").toLowerCase();
            const locTags = (loc.tags || []).map((t) => t.toLowerCase());

            // Keyword matching
            const keywords = seqLower.split(/\s+/).filter((w) => w.length > 3);
            for (const kw of keywords) {
              if (locName.includes(kw)) score += 3;
              if (locDesc.includes(kw)) score += 2;
              if (locTags.some((t) => t.includes(kw))) score += 1;
            }

            // Common location type matching
            if (seqLower.includes("strand") && (locName.includes("strand") || locName.includes("beach"))) score += 5;
            if (seqLower.includes("wasser") && (locName.includes("wasser") || locName.includes("ocean") || locName.includes("meer"))) score += 5;
            if (seqLower.includes("wald") && (locName.includes("wald") || locName.includes("forest"))) score += 5;
            if (seqLower.includes("stadt") && (locName.includes("stadt") || locName.includes("city"))) score += 5;

            if (score > bestScore) {
              bestScore = score;
              bestUrl = loc.imageUrl;
            }
          }

          console.log(`[Screenplay] Location match: "${seqLocation}" → best=${bestUrl?.slice(-30)} (score=${bestScore})`);
          return bestUrl;
        }

        for (const act of screenplay.acts) {
          for (const seq of act.sequences) {
            // Smart match: find best location for this sequence
            let landscapeRefUrl: string | undefined;

            // 1. Try explicit locationId from AI
            if (seq.locationId) {
              const matchedLoc = locationRefs.find((l) => l.id === seq.locationId);
              if (matchedLoc?.imageUrl) {
                landscapeRefUrl = matchedLoc.imageUrl;
                console.log(`[Screenplay] Seq "${seq.name}": location by ID → ${matchedLoc.name}`);
              }
            }

            // 2. Smart match by location text
            if (!landscapeRefUrl && locationRefs.length > 0) {
              landscapeRefUrl = matchLocationToSequence(seq.location || seq.name, locationRefs);
            }

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
                landscapeRefUrl: landscapeRefUrl || undefined,
                scenes: JSON.parse(JSON.stringify(seq.scenes)),
                sceneCount: seq.scenes.length,
                status: "storyboard",
              },
            });
          }
        }

        clearInterval(keepAlive);
        await task.complete({ sequences: screenplay.acts.flatMap((a: { sequences: unknown[] }) => a.sequences).length, scenes: screenplay.totalScenes });
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
        const errorMsg = err instanceof Error ? err.message : "Fehler";
        await task.fail(errorMsg);
        send({ done: true, error: errorMsg });
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

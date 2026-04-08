import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyzeStoryForFilm, type TimelineEntry } from "@/lib/video-director";

export const maxDuration = 120;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { geschichteId, force, scenes: editedScenes } = await request.json() as {
      geschichteId: string;
      force?: boolean;
      scenes?: unknown[]; // Save edited scenes from the Storyboard Editor
    };

    // If scenes are provided, just save them (no generation)
    if (editedScenes && Array.isArray(editedScenes) && editedScenes.length > 0) {
      await prisma.geschichte.update({
        where: { id: geschichteId },
        data: { filmScenes: JSON.parse(JSON.stringify(editedScenes)) },
      });
      return Response.json({ scenes: editedScenes, saved: true });
    }

    const geschichte = await prisma.geschichte.findUnique({
      where: { id: geschichteId },
      select: { text: true, timeline: true, filmScenes: true, audioDauerSek: true },
    });

    if (!geschichte?.text) {
      return Response.json({ error: "Geschichte nicht gefunden oder hat keinen Text" }, { status: 404 });
    }

    // If already has scenes and not forcing regeneration, return cached
    if (!force && geschichte.filmScenes && Array.isArray(geschichte.filmScenes) && (geschichte.filmScenes as unknown[]).length > 0) {
      return Response.json({ scenes: geschichte.filmScenes, cached: true });
    }

    const timeline = (geschichte.timeline as unknown as TimelineEntry[]) || [];

    // Note: We NO LONGER delete old clips when regenerating storyboard.
    // Clips are stored by audio timing (clip-{startMs}-{endMs}-{char}.mp4)
    // and automatically matched to new scenes by the Film-Project API.
    // Users can manually delete unwanted clips in the editor.

    // Generate storyboard via AI Director
    const scenes = await analyzeStoryForFilm(geschichte.text, timeline, geschichte.audioDauerSek || undefined);

    // Save to DB
    await prisma.geschichte.update({
      where: { id: geschichteId },
      data: { filmScenes: JSON.parse(JSON.stringify(scenes)) },
    });

    return Response.json({ scenes, cached: false });
  } catch (error) {
    console.error("[Storyboard]", error);
    return Response.json({ error: error instanceof Error ? error.message : "Fehler" }, { status: 500 });
  }
}

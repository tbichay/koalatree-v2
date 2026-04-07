import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { list } from "@vercel/blob";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

// GET: Load a film project with all its scenes, clips, and assets
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ geschichteId: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { geschichteId } = await params;

  // 1. Load story from DB
  const geschichte = await prisma.geschichte.findUnique({
    where: { id: geschichteId },
    select: {
      id: true,
      titel: true,
      format: true,
      audioUrl: true,
      audioDauerSek: true,
      videoUrl: true,
      filmScenes: true,
      timeline: true,
      hoererProfil: { select: { name: true } },
    },
  });

  if (!geschichte) {
    return Response.json({ error: "Geschichte nicht gefunden" }, { status: 404 });
  }

  // 2. Load film job status
  const filmJob = await prisma.filmJob.findFirst({
    where: { geschichteId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, progress: true, scenesComplete: true, scenesTotal: true },
  });

  // 3. Load existing clips from Blob
  let existingClips: { sceneIndex: number; url: string; size: number; name: string }[] = [];
  try {
    const { blobs } = await list({ prefix: `films/${geschichteId}/scene-`, limit: 100 });
    const allClips = blobs
      .filter((b) => b.pathname.endsWith(".mp4"))
      .map((b) => {
        const match = b.pathname.match(/scene-(\d+)\.mp4$/);
        const idx = match ? parseInt(match[1]) : -1;
        return {
          sceneIndex: idx,
          url: `/api/video/film-scene/${geschichteId}/${idx}`,
          size: b.size,
          name: b.pathname.split("/").pop() || "",
        };
      })
      .filter((c) => c.sceneIndex >= 0)
      .sort((a, b) => a.sceneIndex - b.sceneIndex);

    // Deduplicate: keep the largest clip per scene index (scene-0 vs scene-000)
    const seen = new Map<number, typeof allClips[0]>();
    for (const clip of allClips) {
      const existing = seen.get(clip.sceneIndex);
      if (!existing || clip.size > existing.size) {
        seen.set(clip.sceneIndex, clip);
      }
    }
    existingClips = [...seen.values()].sort((a, b) => a.sceneIndex - b.sceneIndex);
  } catch {
    // Blob access might fail
  }

  // 4. Merge clips into scenes
  const scenes = ((geschichte.filmScenes as unknown as Array<Record<string, unknown>>) || []).map((scene, i) => {
    const clip = existingClips.find((c) => c.sceneIndex === i);
    return {
      ...scene,
      videoUrl: clip?.url || (scene.videoUrl as string) || undefined,
      clipSize: clip?.size,
      status: clip ? "done" : (scene.status as string) || "pending",
    };
  });

  return Response.json({
    geschichte: {
      id: geschichte.id,
      titel: geschichte.titel,
      format: geschichte.format,
      audioUrl: geschichte.audioUrl ? true : false, // Don't expose internal URL
      audioDauerSek: geschichte.audioDauerSek,
      videoUrl: geschichte.videoUrl ? `/api/video/film/${geschichte.id}` : null,
      profilName: geschichte.hoererProfil?.name,
    },
    scenes,
    existingClips,
    filmJob,
    stats: {
      totalScenes: scenes.length,
      completedScenes: existingClips.length,
      totalClipSize: existingClips.reduce((s, c) => s + c.size, 0),
    },
  });
}

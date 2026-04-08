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

  // 3. Load existing clips from Blob — match by audio timing AND scene index
  interface ClipInfo {
    audioStartMs?: number;
    audioEndMs?: number;
    characterId?: string;
    sceneIndex?: number;
    metadata?: Record<string, unknown>;
    url: string;
    blobUrl: string;
    size: number;
    name: string;
  }
  let existingClips: ClipInfo[] = [];
  try {
    const { blobs } = await list({ prefix: `films/${geschichteId}/`, limit: 200 });
    for (const b of blobs) {
      if (!b.pathname.endsWith(".mp4")) continue;
      if (b.pathname.includes("/versions/")) continue; // Skip version backups
      const name = b.pathname.split("/").pop() || "";

      // Parse timing-based name: clip-4000-9000-koda.mp4
      const timingMatch = name.match(/^clip-(\d+)-(\d+)-(.+)\.mp4$/);
      // Parse index-based name: scene-003.mp4
      const indexMatch = name.match(/^scene-(\d+)\.mp4$/);

      if (timingMatch) {
        // Check for metadata JSON
        const metaBlob = blobs.find((m) => m.pathname === b.pathname.replace(".mp4", ".meta.json"));
        let metadata: Record<string, unknown> | undefined;
        if (metaBlob) {
          try {
            const metaRes = await fetch(metaBlob.downloadUrl);
            if (metaRes.ok) metadata = await metaRes.json();
          } catch { /* ignore */ }
        }

        existingClips.push({
          audioStartMs: parseInt(timingMatch[1]),
          audioEndMs: parseInt(timingMatch[2]),
          characterId: timingMatch[3] === "landscape" ? undefined : timingMatch[3],
          metadata,
          url: `/api/video/film-clip/${geschichteId}/${name}`,
          blobUrl: b.url,
          size: b.size,
          name,
        });
      } else if (indexMatch) {
        existingClips.push({
          sceneIndex: parseInt(indexMatch[1]),
          url: `/api/video/film-scene/${geschichteId}/${parseInt(indexMatch[1])}`,
          blobUrl: b.url,
          size: b.size,
          name,
        });
      }
    }
  } catch {
    // Blob access might fail
  }

  // 4. Merge clips into scenes — match by timing first, then by scene index
  const scenes = ((geschichte.filmScenes as unknown as Array<Record<string, unknown>>) || []).map((scene, i) => {
    const sceneStart = scene.audioStartMs as number;
    const sceneEnd = scene.audioEndMs as number;
    const sceneChar = scene.characterId as string | undefined;

    // Priority 1: Match by audio timing (within 500ms tolerance)
    let clip = existingClips.find((c) =>
      c.audioStartMs !== undefined &&
      Math.abs((c.audioStartMs || 0) - sceneStart) < 500 &&
      Math.abs((c.audioEndMs || 0) - sceneEnd) < 500
    );

    // Priority 2: Match by scene index (backward compatibility)
    if (!clip) {
      clip = existingClips.find((c) => c.sceneIndex === i);
    }

    return {
      ...scene,
      videoUrl: clip?.url || (scene.videoUrl as string) || undefined,
      clipBlobUrl: clip?.blobUrl,
      clipSize: clip?.size,
      clipName: clip?.name,
      clipMetadata: clip?.metadata,
      status: clip ? "done" : (scene.status as string) || "pending",
    };
  });

  return Response.json({
    geschichte: {
      id: geschichte.id,
      titel: geschichte.titel,
      format: geschichte.format,
      audioUrl: geschichte.audioUrl ? `/api/audio/${geschichte.id}` : null,
      audioDauerSek: geschichte.audioDauerSek,
      videoUrl: geschichte.videoUrl ? `/api/video/film/${geschichte.id}` : null,
      profilName: geschichte.hoererProfil?.name,
      timeline: geschichte.timeline || [],
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

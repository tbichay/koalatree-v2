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
  // Also collect version history per scene
  const versionMap = new Map<string, Array<{ url: string; name: string; size: number; uploadedAt: string }>>();

  try {
    const { blobs } = await list({ prefix: `films/${geschichteId}/`, limit: 200 });
    for (const b of blobs) {
      if (!b.pathname.endsWith(".mp4")) continue;
      const name = b.pathname.split("/").pop() || "";

      // Collect versions: versions/clip-003-4000-9000-koda-v1234.mp4
      if (b.pathname.includes("/versions/")) {
        // Extract scene index from version name
        const vMatch = name.match(/^clip-(\d+)-/);
        if (vMatch) {
          const key = vMatch[1]; // scene index
          if (!versionMap.has(key)) versionMap.set(key, []);
          versionMap.get(key)!.push({
            url: `/api/video/film-clip/${geschichteId}/${name}`,
            name,
            size: b.size,
            uploadedAt: b.uploadedAt?.toISOString() || "",
          });
        }
        continue;
      }

      // Parse new format: clip-003-4000-9000-koda.mp4 (with scene index)
      const newMatch = name.match(/^clip-(\d+)-(\d+)-(\d+)-(.+)\.mp4$/);
      // Parse old format: clip-4000-9000-koda.mp4 (without scene index)
      const oldTimingMatch = !newMatch ? name.match(/^clip-(\d+)-(\d+)-(.+)\.mp4$/) : null;
      // Parse index-based name: scene-003.mp4
      const indexMatch = name.match(/^scene-(\d+)\.mp4$/);

      const timingMatch = newMatch
        ? [null, newMatch[2], newMatch[3], newMatch[4]] // Extract timing from new format
        : oldTimingMatch;

      if (timingMatch && timingMatch[1] && timingMatch[2]) {
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
          sceneIndex: newMatch ? parseInt(newMatch[1]) : undefined,
          audioStartMs: parseInt(timingMatch[1]!),
          audioEndMs: parseInt(timingMatch[2]!),
          characterId: timingMatch[3] === "landscape" ? undefined : timingMatch[3] || undefined,
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

    // Priority 1: Match by scene index in new clip format (clip-003-...)
    let clip = existingClips.find((c) => c.sceneIndex === i);

    // Priority 2: Match by audio timing (within 500ms tolerance)
    if (!clip) {
      clip = existingClips.find((c) =>
        c.audioStartMs !== undefined &&
        Math.abs((c.audioStartMs || 0) - sceneStart) < 500 &&
        Math.abs((c.audioEndMs || 0) - sceneEnd) < 500
      );
    }

    // Merge physical versions from Blob with DB versions
    const paddedIdx = String(i).padStart(3, "0");
    const physicalVersions = versionMap.get(paddedIdx) || [];
    const dbVersions = (scene.promptVersions as Array<{ id: string; videoUrl?: string }>) || [];

    // Combine: DB versions + physical versions not already in DB
    const allVersions = [...dbVersions];
    for (const pv of physicalVersions) {
      const alreadyInDb = dbVersions.some((dv) => dv.videoUrl === pv.url);
      if (!alreadyInDb) {
        allVersions.push({
          id: `blob-${pv.name}`,
          prompt: (scene.sceneDescription as string) || "",
          videoUrl: pv.url,
          createdAt: pv.uploadedAt,
          isSelected: false,
        } as never);
      }
    }

    return {
      ...scene,
      videoUrl: clip?.url || (scene.videoUrl as string) || undefined,
      clipBlobUrl: clip?.blobUrl,
      clipSize: clip?.size,
      clipName: clip?.name,
      clipMetadata: clip?.metadata,
      promptVersions: allVersions.length > 0 ? allVersions : undefined,
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

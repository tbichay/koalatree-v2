import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { list, get } from "@vercel/blob";

export const maxDuration = 300;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

// GET: Get render instructions + clip list for a story
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const geschichteId = searchParams.get("geschichteId");
  if (!geschichteId) return Response.json({ error: "geschichteId required" }, { status: 400 });

  // Get story info
  const geschichte = await prisma.geschichte.findUnique({
    where: { id: geschichteId },
    select: { titel: true, audioDauerSek: true },
  });

  // Get all clips
  const { blobs } = await list({ prefix: `films/${geschichteId}/scene-`, limit: 100 });
  const clips = blobs
    .filter((b) => b.pathname.endsWith(".mp4"))
    .map((b) => {
      const match = b.pathname.match(/scene-(\d+)\.mp4$/);
      return {
        sceneIndex: match ? parseInt(match[1]) : -1,
        pathname: b.pathname,
        size: b.size,
        url: `/api/video/film-scene/${geschichteId}/${match ? parseInt(match[1]) : 0}`,
        downloadUrl: b.downloadUrl,
      };
    })
    .filter((c) => c.sceneIndex >= 0)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);

  // Deduplicate
  const seen = new Map<number, typeof clips[0]>();
  for (const clip of clips) {
    const existing = seen.get(clip.sceneIndex);
    if (!existing || clip.size > existing.size) seen.set(clip.sceneIndex, clip);
  }
  const uniqueClips = [...seen.values()].sort((a, b) => a.sceneIndex - b.sceneIndex);

  return Response.json({
    geschichte: { titel: geschichte?.titel, audioDauerSek: geschichte?.audioDauerSek },
    clips: uniqueClips,
    totalClips: uniqueClips.length,
    totalSize: uniqueClips.reduce((s, c) => s + c.size, 0),
    renderCommand: `node scripts/master-film.mjs ${geschichteId}`,
    instructions: [
      "1. Stelle sicher dass der Dev-Server laeuft (npm run dev)",
      "2. Oeffne ein Terminal im Projekt-Ordner",
      `3. Fuehre aus: node scripts/master-film.mjs ${geschichteId}`,
      "4. Der Film wird in tmp/films/<id>/master/ gespeichert",
      "5. Lade den fertigen Film hoch oder teile ihn direkt",
    ],
  });
}

// POST: Render film using Remotion (assembles clips into final video)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { geschichteId, format = "portrait", sceneRange } = await request.json() as {
      geschichteId: string;
      format?: "portrait" | "wide";
      sceneRange?: { from: number; to: number }; // Optional: only render a subset of scenes
    };

    const geschichte = await prisma.geschichte.findUnique({
      where: { id: geschichteId },
      select: {
        id: true,
        titel: true,
        audioUrl: true,
        filmScenes: true,
        hoererProfil: { select: { name: true } },
      },
    });

    if (!geschichte) {
      return Response.json({ error: "Geschichte nicht gefunden" }, { status: 404 });
    }

    const scenes = (geschichte.filmScenes as unknown as Array<{
      type: string;
      characterId?: string;
      audioStartMs: number;
      audioEndMs: number;
      videoUrl?: string;
    }>) || [];

    // Load clips and create public temporary URLs for Lambda access
    // Private Blob URLs return 403, so we re-upload to the Remotion S3 bucket
    const { blobs: clipBlobs } = await list({ prefix: `films/${geschichteId}/`, limit: 200 });
    const blobMap = new Map<string, string>();

    for (const b of clipBlobs) {
      if (!b.pathname.endsWith(".mp4") || b.pathname.includes("/versions/")) continue;
      const name = b.pathname.split("/").pop() || "";

      // Download from private Blob and re-upload as public temporary file
      try {
        const clipData = await get(b.url, { access: "private" });
        if (!clipData?.stream) continue;
        const chunks: Uint8Array[] = [];
        const reader = clipData.stream.getReader();
        while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
        const buffer = Buffer.concat(chunks);

        // Upload to a public temporary Blob (expires naturally, Lambda can access)
        const { put: putBlob } = await import("@vercel/blob");
        const tmpBlob = await putBlob(`tmp-render/${geschichteId}/${name}`, buffer, {
          access: "public",
          contentType: "video/mp4",
          allowOverwrite: true,
        });
        blobMap.set(name, tmpBlob.url);
        console.log(`[Render] Public URL for ${name}: ${tmpBlob.url.substring(0, 60)}...`);
      } catch (err) {
        console.warn(`[Render] Could not create public URL for ${name}:`, err);
      }
    }

    let filteredScenes = scenes.map((scene, i) => ({ ...scene, index: i }));

    if (sceneRange) {
      filteredScenes = filteredScenes.filter(
        (_, i) => i >= sceneRange.from && i <= sceneRange.to
      );
      console.log(`[Render] Partial render: scenes ${sceneRange.from}-${sceneRange.to}`);
    }

    // Match scenes to Blob download URLs
    const renderableScenes = filteredScenes
      .map((scene) => {
        const charId = (scene.characterId as string) || "landscape";
        const clipName = `clip-${scene.audioStartMs}-${scene.audioEndMs}-${charId}.mp4`;
        const sceneIdxName = `scene-${String(scene.index).padStart(3, "0")}.mp4`;
        // Direct Blob URL (no auth needed for Lambda)
        const blobDownloadUrl = blobMap.get(clipName) || blobMap.get(sceneIdxName);
        return {
          videoUrl: blobDownloadUrl || "",
          durationMs: Math.max((scene.audioEndMs as number) - (scene.audioStartMs as number), 3000),
          type: scene.type as string,
          characterId: scene.characterId as string | undefined,
        };
      })
      .filter((s) => s.videoUrl && s.durationMs > 0);

    if (renderableScenes.length < 2) {
      return Response.json({ error: `Mindestens 2 Clips mit Blob-URLs noetig (${renderableScenes.length} gefunden, ${blobMap.size} Clips im Blob)` }, { status: 400 });
    }

    console.log(`[Render] Rendering "${geschichte.titel}" (${renderableScenes.length} scenes, ${format})`);

    // Audio: create public temporary URL
    let storyAudioFullUrl: string | undefined;
    if (geschichte.audioUrl) {
      try {
        const audioData = await get(geschichte.audioUrl, { access: "private" });
        if (audioData?.stream) {
          const chunks: Uint8Array[] = [];
          const reader = audioData.stream.getReader();
          while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
          const { put: putBlob } = await import("@vercel/blob");
          const tmpAudio = await putBlob(`tmp-render/${geschichteId}/audio.mp3`, Buffer.concat(chunks), {
            access: "public",
            contentType: "audio/mpeg",
            allowOverwrite: true,
          });
          storyAudioFullUrl = tmpAudio.url;
          console.log(`[Render] Public audio URL: ${tmpAudio.url.substring(0, 60)}...`);
        }
      } catch { /* no audio */ }
    }

    // Check if Lambda is configured
    if (process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_SERVE_URL) {
      // ══════ REMOTION LAMBDA ══════
      const { renderFilmOnLambda } = await import("@/lib/film-render");

      const outputUrl = await renderFilmOnLambda({
        geschichteId,
        scenes: renderableScenes,
        storyAudioUrl: storyAudioFullUrl,
        title: geschichte.titel || "KoalaTree",
        subtitle: geschichte.hoererProfil?.name ? `fuer ${geschichte.hoererProfil.name}` : "praesentiert",
        format,
      });

      // Save to DB
      await prisma.geschichte.update({
        where: { id: geschichteId },
        data: { videoUrl: outputUrl },
      });

      return Response.json({
        status: "completed",
        videoUrl: `/api/video/film/${geschichteId}`,
        outputUrl,
        scenes: renderableScenes.length,
      });
    }

    // ══════ FALLBACK: Local render instructions ══════
    return Response.json({
      status: "manual",
      scenes: renderableScenes.length,
      localScript: `node scripts/render-film.mjs ${geschichteId}`,
      message: "Remotion Lambda nicht konfiguriert. Setze REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY und REMOTION_SERVE_URL in Vercel, oder rendere lokal.",
    });
  } catch (error) {
    console.error("[Render] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Render-Fehler" },
      { status: 500 },
    );
  }
}

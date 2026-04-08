import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { list, get, put } from "@vercel/blob";

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
    const { geschichteId, format = "portrait", sceneRange, clipBlobUrls } = await request.json() as {
      geschichteId: string;
      format?: "portrait" | "wide";
      sceneRange?: { from: number; to: number };
      clipBlobUrls?: Record<string, string>; // clipName → blobUrl (sent by client)
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

    // Clips are private in Vercel Blob. Upload them to the Remotion S3 bucket.
    const blobMap = new Map<string, string>();

    // Find Remotion S3 bucket
    const { getSites } = await import("@remotion/lambda/client");
    const sitesResult = await getSites({ region: "eu-central-1" });
    const remotionBucket = sitesResult.buckets[0]?.name;
    if (!remotionBucket) throw new Error("No Remotion S3 bucket found. Deploy with: npx remotion lambda sites create");
    console.log(`[Render] Remotion S3 bucket: ${remotionBucket}`);

    // Upload clips to S3
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: "eu-central-1",
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY || "",
      },
    });

    const { blobs: allBlobs } = await list({ prefix: `films/${geschichteId}/`, limit: 200 });
    console.log(`[Render] Found ${allBlobs.length} Vercel blobs`);

    for (const b of allBlobs) {
      if (!b.pathname.endsWith(".mp4") || b.pathname.includes("/versions/")) continue;
      const name = b.pathname.split("/").pop() || "";

      try {
        const clipResult = await get(b.url, { access: "private" });
        if (!clipResult?.stream) continue;
        const chunks: Uint8Array[] = [];
        const reader = clipResult.stream.getReader();
        while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
        const buffer = Buffer.concat(chunks);

        // Upload to Remotion S3 bucket
        const s3Key = `render-assets/${geschichteId}/${name}`;
        await s3.send(new PutObjectCommand({
          Bucket: remotionBucket,
          Key: s3Key,
          Body: buffer,
          ContentType: "video/mp4",
        }));

        const s3Url = `https://${remotionBucket}.s3.eu-central-1.amazonaws.com/${s3Key}`;
        blobMap.set(name, s3Url);
        console.log(`[Render] ${name}: ${(buffer.byteLength/1024).toFixed(0)}KB → S3`);
      } catch (err) {
        console.warn(`[Render] Failed: ${name}`, err);
      }
    }

    console.log(`[Render] ${blobMap.size} clips uploaded to S3`);

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

    console.log(`[Render] ${renderableScenes.length} scenes matched to clips, ${blobMap.size} public URLs created`);
    if (renderableScenes.length < 2) {
      // Show what we tried to match
      const attempted = filteredScenes.map((s) => {
        const charId = (s.characterId as string) || "landscape";
        return `clip-${s.audioStartMs}-${s.audioEndMs}-${charId}.mp4`;
      });
      return Response.json({
        error: `Mindestens 2 Clips noetig (${renderableScenes.length} gefunden, ${blobMap.size} im Blob). Gesucht: ${attempted.join(", ")}. Vorhanden: ${[...blobMap.keys()].join(", ") || "keine"}`
      }, { status: 400 });
    }

    console.log(`[Render] Rendering "${geschichte.titel}" (${renderableScenes.length} scenes, ${format})`);

    // Audio: upload to S3 for Lambda access
    let storyAudioFullUrl: string | undefined;
    if (geschichte.audioUrl) {
      try {
        const audioData = await get(geschichte.audioUrl, { access: "private" });
        if (audioData?.stream) {
          const chunks: Uint8Array[] = [];
          const reader = audioData.stream.getReader();
          while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
          const audioKey = `render-assets/${geschichteId}/audio.mp3`;
          await s3.send(new PutObjectCommand({
            Bucket: remotionBucket,
            Key: audioKey,
            Body: Buffer.concat(chunks),
            ContentType: "audio/mpeg",
          }));
          storyAudioFullUrl = `https://${remotionBucket}.s3.eu-central-1.amazonaws.com/${audioKey}`;
          console.log(`[Render] Audio → S3`);
        }
      } catch (err) { console.warn("[Render] Audio S3 upload failed:", err); }
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

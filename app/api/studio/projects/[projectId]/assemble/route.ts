/**
 * Studio Film Assembly API — Combine all sequence clips into final film
 *
 * POST: Assemble film via Remotion Lambda (SSE streaming)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
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

        // Upload private Blob clips to S3 for Remotion Lambda access
        send({ progress: `Lade ${allScenes.length} Clips auf S3...` });
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
        const s3 = new S3Client({
          region: "eu-central-1",
          credentials: {
            accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
          },
        });

        const s3Bucket = (process.env.REMOTION_SERVE_URL || "").match(/s3\..*\.amazonaws\.com\/(.+?)\/sites/)?.[0]
          ? "remotionlambda-eucentral1-hn67lohl74"
          : "remotionlambda-eucentral1-hn67lohl74"; // Fallback bucket name

        for (let i = 0; i < allScenes.length; i++) {
          const url = allScenes[i].videoUrl;
          if (url.includes(".blob.vercel-storage.com")) {
            try {
              send({ progress: `Clip ${i + 1}/${allScenes.length} auf S3...` });
              // Download from private Blob
              const blobData = await get(url, { access: "private" });
              if (!blobData?.stream) continue;
              const reader = blobData.stream.getReader();
              const chunks: Uint8Array[] = [];
              let chunk;
              while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
              const buffer = Buffer.concat(chunks);

              // Upload to S3 with public-read
              const s3Key = `temp-render/${projectId}/clip-${String(i).padStart(3, "0")}.mp4`;
              await s3.send(new PutObjectCommand({
                Bucket: s3Bucket,
                Key: s3Key,
                Body: buffer,
                ContentType: "video/mp4",
                ACL: "public-read",
              }));

              allScenes[i].videoUrl = `https://${s3Bucket}.s3.eu-central-1.amazonaws.com/${s3Key}`;
            } catch (err) {
              console.warn(`[Assemble] S3 upload failed for clip ${i}:`, err);
            }
          }
        }

        // Concatenate audio from all sequences into one file
        let storyAudioUrl: string | undefined;
        if (audioUrls.length === 1) {
          storyAudioUrl = audioUrls[0];
        } else if (audioUrls.length > 1) {
          send({ progress: "Kombiniere Audio aus allen Sequenzen..." });
          const audioChunks: Buffer[] = [];
          for (const url of audioUrls) {
            try {
              if (url.includes(".blob.vercel-storage.com")) {
                const blob = await get(url, { access: "private" });
                if (blob?.stream) {
                  const reader = blob.stream.getReader();
                  const chunks: Uint8Array[] = [];
                  let chunk;
                  while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
                  audioChunks.push(Buffer.concat(chunks));
                }
              } else {
                const res = await fetch(url);
                audioChunks.push(Buffer.from(await res.arrayBuffer()));
              }
            } catch (err) {
              console.warn("[Assemble] Failed to load audio:", url, err);
            }
          }
          if (audioChunks.length > 0) {
            const combined = Buffer.concat(audioChunks);
            const combinedBlob = await put(
              `studio/${projectId}/combined-audio.mp3`,
              combined,
              { access: "private", contentType: "audio/mpeg" },
            );
            storyAudioUrl = combinedBlob.url;
          }
        }

        // Also upload audio to S3 for Remotion
        if (storyAudioUrl?.includes(".blob.vercel-storage.com")) {
          try {
            send({ progress: "Audio auf S3..." });
            const audioBlobData = await get(storyAudioUrl, { access: "private" });
            if (audioBlobData?.stream) {
              const reader = audioBlobData.stream.getReader();
              const chunks: Uint8Array[] = [];
              let chunk;
              while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
              const buffer = Buffer.concat(chunks);
              const s3Key = `temp-render/${projectId}/audio.mp3`;
              await s3.send(new PutObjectCommand({
                Bucket: s3Bucket,
                Key: s3Key,
                Body: buffer,
                ContentType: "audio/mpeg",
                ACL: "public-read",
              }));
              storyAudioUrl = `https://${s3Bucket}.s3.eu-central-1.amazonaws.com/${s3Key}`;
            }
          } catch (err) {
            console.warn("[Assemble] Audio S3 upload failed:", err);
          }
        }

        send({ progress: `${allScenes.length} Clips, starte Remotion Lambda...` });

        // Render via Remotion Lambda
        const { renderFilmOnLambda } = await import("@/lib/film-render");
        const videoUrl = await renderFilmOnLambda({
          geschichteId: projectId,
          scenes: allScenes,
          storyAudioUrl,
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

        // Cleanup: delete temp S3 files
        try {
          const { DeleteObjectsCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
          const listResult = await s3.send(new ListObjectsV2Command({
            Bucket: s3Bucket,
            Prefix: `temp-render/${projectId}/`,
          }));
          if (listResult.Contents && listResult.Contents.length > 0) {
            await s3.send(new DeleteObjectsCommand({
              Bucket: s3Bucket,
              Delete: { Objects: listResult.Contents.map((o) => ({ Key: o.Key })) },
            }));
            console.log(`[Assemble] Cleaned up ${listResult.Contents.length} temp S3 files`);
          }
        } catch (cleanupErr) {
          console.warn("[Assemble] S3 cleanup failed:", cleanupErr);
        }

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

/**
 * Studio Film Assembly API — Combine all sequence clips into final film
 *
 * POST: Assemble film via Remotion Lambda (SSE streaming)
 *
 * V2: Per-scene audio (dialog + SFX per scene, ambience per sequence)
 * V1 fallback: single storyAudioUrl
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, get } from "@vercel/blob";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 800;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json() as {
    format?: "portrait" | "wide" | "cinema";
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
    (s) => !["clips", "mastered"].includes(s.status),
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

      const { createTask } = await import("@/lib/studio/task-tracker");
      const task = await createTask(session.user!.id!, "assemble", projectId, { format: body.format });

      send({ progress: "Bereite Film-Assembly vor...", taskId: task.id });
      const keepAlive = setInterval(() => send({ progress: "rendering..." }), 5000);

      try {
        // Collect all scenes from all sequences in order
        const allScenes: Array<{
          videoUrl: string;
          dialogAudioUrl?: string;
          sfxAudioUrl?: string;
          durationMs: number;
          type: string;
          characterId?: string;
        }> = [];

        // Collect ambience URLs from sequences (V2)
        const ambienceUrls: string[] = [];
        // V1 fallback: collect sequence audio URLs
        const audioUrls: string[] = [];

        for (const seq of project.sequences) {
          const scenes = (seq.scenes as unknown as StudioScene[]) || [];

          // Check if this sequence uses per-scene audio (V2) by looking for dialogAudioUrl
          const hasPerSceneAudio = scenes.some((s) => s.dialogAudioUrl);

          if (hasPerSceneAudio && seq.audioUrl) {
            // V2: sequence audioUrl is the ambience track
            ambienceUrls.push(seq.audioUrl);
          } else if (seq.audioUrl) {
            // V1 fallback: sequence audioUrl is the full story audio
            audioUrls.push(seq.audioUrl);
          }

          for (const scene of scenes) {
            if (scene.videoUrl && scene.status === "done") {
              allScenes.push({
                videoUrl: scene.videoUrl,
                dialogAudioUrl: scene.dialogAudioUrl,
                sfxAudioUrl: scene.sfxAudioUrl,
                // Audio is MASTER for dialog scenes — use audio duration, not video duration
                durationMs: scene.type === "dialog" && scene.dialogDurationMs
                  ? scene.dialogDurationMs
                  : scene.type === "dialog" && scene.audioEndMs > scene.audioStartMs
                  ? scene.audioEndMs - scene.audioStartMs
                  : scene.actualDurationMs || (scene.durationHint || 5) * 1000,
                type: scene.type,
                characterId: scene.characterId,
              });
            }
          }
        }

        if (allScenes.length === 0) {
          throw new Error("Keine fertigen Clips gefunden");
        }

        // Upload private Blob URLs to S3 for Remotion Lambda access
        send({ progress: `Lade ${allScenes.length} Clips auf S3...` });
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
        const s3 = new S3Client({
          region: "eu-central-1",
          credentials: {
            accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
          },
        });

        const s3Bucket = "remotionlambda-eucentral1-hn67lohl74";

        /** Helper: download from private blob and upload to S3 */
        async function uploadToS3(url: string, s3Key: string, contentType: string): Promise<string> {
          if (!url.includes(".blob.vercel-storage.com")) return url; // Already public
          const blobData = await get(url, { access: "private" });
          if (!blobData?.stream) throw new Error(`Blob not loadable: ${url}`);
          const reader = blobData.stream.getReader();
          const chunks: Uint8Array[] = [];
          let chunk;
          while (!(chunk = await reader.read()).done) chunks.push(chunk.value);
          const buffer = Buffer.concat(chunks);

          await s3.send(new PutObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key,
            Body: buffer,
            ContentType: contentType,
            ACL: "public-read",
          }));

          return `https://${s3Bucket}.s3.eu-central-1.amazonaws.com/${s3Key}`;
        }

        // Upload video clips + per-scene audio to S3
        for (let i = 0; i < allScenes.length; i++) {
          send({ progress: `Clip ${i + 1}/${allScenes.length} auf S3...` });

          try {
            allScenes[i].videoUrl = await uploadToS3(
              allScenes[i].videoUrl,
              `temp-render/${projectId}/clip-${String(i).padStart(3, "0")}.mp4`,
              "video/mp4",
            );
          } catch (err) {
            console.warn(`[Assemble] S3 upload failed for clip ${i}:`, err);
          }

          // Upload per-scene dialog audio
          if (allScenes[i].dialogAudioUrl) {
            try {
              allScenes[i].dialogAudioUrl = await uploadToS3(
                allScenes[i].dialogAudioUrl!,
                `temp-render/${projectId}/dialog-${String(i).padStart(3, "0")}.mp3`,
                "audio/mpeg",
              );
            } catch (err) {
              console.warn(`[Assemble] Dialog audio S3 upload failed for scene ${i}:`, err);
            }
          }

          // Upload per-scene SFX audio
          if (allScenes[i].sfxAudioUrl) {
            try {
              allScenes[i].sfxAudioUrl = await uploadToS3(
                allScenes[i].sfxAudioUrl!,
                `temp-render/${projectId}/sfx-${String(i).padStart(3, "0")}.mp3`,
                "audio/mpeg",
              );
            } catch (err) {
              console.warn(`[Assemble] SFX audio S3 upload failed for scene ${i}:`, err);
            }
          }
        }

        // Upload ambience to S3 (V2: use first ambience URL)
        let ambienceUrl: string | undefined;
        if (ambienceUrls.length > 0) {
          try {
            send({ progress: "Ambience auf S3..." });
            ambienceUrl = await uploadToS3(
              ambienceUrls[0],
              `temp-render/${projectId}/ambience.mp3`,
              "audio/mpeg",
            );
          } catch (err) {
            console.warn("[Assemble] Ambience S3 upload failed:", err);
          }
        }

        // V1 fallback: concatenate sequence audio into one file
        let storyAudioUrl: string | undefined;
        const hasPerSceneAudio = allScenes.some((s) => s.dialogAudioUrl);

        if (!hasPerSceneAudio && audioUrls.length > 0) {
          if (audioUrls.length === 1) {
            storyAudioUrl = audioUrls[0];
          } else {
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

          // Upload V1 audio to S3
          if (storyAudioUrl?.includes(".blob.vercel-storage.com")) {
            try {
              send({ progress: "Audio auf S3..." });
              storyAudioUrl = await uploadToS3(
                storyAudioUrl,
                `temp-render/${projectId}/audio.mp3`,
                "audio/mpeg",
              );
            } catch (err) {
              console.warn("[Assemble] Audio S3 upload failed:", err);
            }
          }
        }

        send({ progress: `${allScenes.length} Clips, starte Remotion Lambda...` });

        // Render via Remotion Lambda
        const { renderFilmOnLambda } = await import("@/lib/film-render");
        const videoUrl = await renderFilmOnLambda({
          geschichteId: projectId,
          scenes: allScenes,
          ambienceUrl,
          storyAudioUrl,       // V1 fallback
          backgroundMusicUrl: body.musicUrl,
          musicVolume: body.musicVolume ?? 0.08,
          title: project.name,
          subtitle: "KoalaTree Studio",
          format: (body.format || (project as { format?: string }).format || "portrait") as "portrait" | "wide" | "cinema",
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

        // Save finished film as Library asset
        try {
          send({ progress: "Speichere Film in Library..." });
          const filmRes = await fetch(videoUrl);
          if (filmRes.ok) {
            const filmBuffer = Buffer.from(await filmRes.arrayBuffer());
            const { createAsset } = await import("@/lib/assets");
            const format = (body.format || (project as { format?: string }).format || "portrait") as string;
            const totalDurationSec = allScenes.reduce((sum, s) => sum + s.durationMs / 1000, 0);
            await createAsset({
              type: "clip",
              name: project.name,
              category: "film",
              tags: ["film", "completed", format],
              buffer: filmBuffer,
              filename: `film-${projectId}-${Date.now()}.mp4`,
              mimeType: "video/mp4",
              durationSec: Math.round(totalDurationSec),
              projectId,
              userId: session.user!.id!,
            });
            console.log(`[Assemble] Film saved to Library: ${project.name}`);
          }
        } catch (libErr) {
          console.warn("[Assemble] Failed to save film to Library:", libErr);
        }

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
        await task.complete({ videoUrl, scenes: allScenes.length });
        send({
          done: true,
          videoUrl,
          scenes: allScenes.length,
          sequences: project.sequences.length,
        });
      } catch (err) {
        clearInterval(keepAlive);
        const errorMsg = err instanceof Error ? err.message : "Fehler bei Film-Assembly";
        console.error("[Assemble] Error:", err);
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

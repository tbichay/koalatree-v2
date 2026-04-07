import { prisma } from "@/lib/db";
import { processNextScene } from "@/lib/video-pipeline";
import { Resend } from "resend";

export const maxDuration = 300; // 5 minutes — processes ONE scene per run

const resend = new Resend(process.env.RESEND_API_KEY);
const emailFrom = process.env.EMAIL_FROM || "KoalaTree <noreply@koalatree.ai>";
const STALE_MINUTES = 6;

function getBaseUrl(): string {
  return process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://www.koalatree.ai";
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Reset stale jobs (stuck > 6 min — one scene should finish in ~3 min)
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
    await prisma.filmJob.updateMany({
      where: { status: "PROCESSING", startedAt: { lt: staleThreshold } },
      data: { status: "PENDING", error: "Timeout — wird erneut versucht" },
    });

    // 2. Find a PROCESSING job (continue its next scene)
    let activeJob = await prisma.filmJob.findFirst({
      where: { status: "PROCESSING" },
      include: { geschichte: { select: { titel: true, hoererProfil: { select: { name: true } } } } },
    });

    // 3. Or find a PENDING job and start it
    if (!activeJob) {
      activeJob = await prisma.filmJob.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        include: { geschichte: { select: { titel: true, hoererProfil: { select: { name: true } } } } },
      });

      if (!activeJob) {
        return Response.json({ status: "idle" });
      }

      // Mark as PROCESSING
      await prisma.filmJob.update({
        where: { id: activeJob.id },
        data: { status: "PROCESSING", startedAt: new Date() },
      });
    }

    console.log(`[Film Cron] Processing scene for "${activeJob.geschichte.titel}" (${activeJob.scenesComplete}/${activeJob.scenesTotal || "?"})`);

    // 4. Process ONE scene
    const result = await processNextScene(activeJob.id);

    if (result.done) {
      // All scenes complete — find the first clip and set as video
      try {
        const { list: listBlobs } = await import("@vercel/blob");
        const { blobs } = await listBlobs({ prefix: `films/${activeJob.geschichteId}/scene-`, limit: 50 });
        const firstClip = blobs.find((b) => b.pathname.endsWith(".mp4"));

        if (firstClip) {
          // Set the first scene clip as the video (mastering script will replace later)
          await prisma.geschichte.update({
            where: { id: activeJob.geschichteId },
            data: { videoUrl: firstClip.url },
          });
          console.log(`[Film Cron] Set videoUrl from first clip: ${firstClip.pathname}`);
        }
      } catch (blobErr) {
        console.error("[Film Cron] Could not set videoUrl:", blobErr);
      }

      await prisma.filmJob.update({
        where: { id: activeJob.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          progress: `Fertig! ${result.scenesTotal} Szenen — Mastering ausstehend`,
          scenesTotal: result.scenesTotal,
          scenesComplete: result.scenesTotal,
        },
      });

      console.log(`[Film Cron] Film COMPLETED: ${result.scenesTotal} scenes`);

      // Send email
      try {
        const user = await prisma.user.findUnique({
          where: { id: activeJob.userId },
          select: { email: true },
        });
        if (user?.email) {
          const profilName = activeJob.geschichte.hoererProfil?.name || "Dein Kind";
          const title = activeJob.geschichte.titel || "Neue Geschichte";
          await resend.emails.send({
            from: emailFrom,
            to: user.email,
            subject: `${profilName}s Film ist fertig!`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #1a2e1a; color: #f5eed6; border-radius: 16px;">
                <h1 style="font-size: 20px; text-align: center;">KoalaTree</h1>
                <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 16px 0;">
                  <p style="font-size: 16px; color: #a8d5b8; font-weight: 600;">${title}</p>
                  <p style="font-size: 14px; color: rgba(255,255,255,0.6);">
                    Der Film mit ${result.scenesTotal} Szenen ist fertig!
                  </p>
                </div>
                <div style="text-align: center;">
                  <a href="${getBaseUrl()}/geschichten" style="display: inline-block; background: #4a7c59; color: #f5eed6; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600;">Film anschauen</a>
                </div>
              </div>
            `,
          });
        }
      } catch { /* ignore email errors */ }

      return Response.json({
        status: "completed",
        jobId: activeJob.id,
        scenes: result.scenesTotal,
      });
    }

    // Update startedAt for stale detection (reset per scene)
    await prisma.filmJob.update({
      where: { id: activeJob.id },
      data: { startedAt: new Date() },
    });

    return Response.json({
      status: "processing",
      jobId: activeJob.id,
      sceneIndex: result.sceneIndex,
      scenesTotal: result.scenesTotal,
      progress: `${result.sceneIndex + 1}/${result.scenesTotal}`,
    });
  } catch (error) {
    console.error("[Film Cron] Error:", error);

    try {
      const failedJob = await prisma.filmJob.findFirst({ where: { status: "PROCESSING" } });
      if (failedJob) {
        await prisma.filmJob.update({
          where: { id: failedJob.id },
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            // Don't reset to PENDING on scene error — keep processing, skip this scene
            scenesComplete: { increment: 1 },
            startedAt: new Date(), // Reset stale timer
          },
        });
      }
    } catch { /* ignore */ }

    return Response.json({ status: "error", error: String(error) }, { status: 500 });
  }
}

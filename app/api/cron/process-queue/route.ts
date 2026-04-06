import { prisma } from "@/lib/db";
import { generateAudio } from "@/lib/elevenlabs";
import { Resend } from "resend";

export const maxDuration = 300; // 5 minutes max for audio generation

const resend = new Resend(process.env.RESEND_API_KEY);
const emailFrom = process.env.EMAIL_FROM || "KoalaTree <noreply@koalatree.ai>";
const STALE_MINUTES = 5; // Jobs stuck in PROCESSING for > 5 min are considered stale

export async function GET(request: Request) {
  // Auth: Vercel Cron sends Authorization header with CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow in development (no CRON_SECRET set) or with valid secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Check for stale PROCESSING jobs (stuck > 5 minutes)
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
    const staleJobs = await prisma.generationJob.findMany({
      where: {
        status: "PROCESSING",
        startedAt: { lt: staleThreshold },
      },
    });

    for (const stale of staleJobs) {
      if (stale.retryCount < 3) {
        await prisma.generationJob.update({
          where: { id: stale.id },
          data: { status: "PENDING", retryCount: { increment: 1 }, startedAt: null, error: "Timeout — wird erneut versucht" },
        });
        console.log(`[Queue] Reset stale job ${stale.id} (retry ${stale.retryCount + 1}/3)`);
      } else {
        await prisma.generationJob.update({
          where: { id: stale.id },
          data: { status: "FAILED", error: "Maximale Versuche erreicht (Timeout)", completedAt: new Date() },
        });
        console.log(`[Queue] Failed stale job ${stale.id} after 3 retries`);
      }
    }

    // 2. Check if any job is currently processing (max 1 concurrent)
    const processing = await prisma.generationJob.findFirst({
      where: { status: "PROCESSING" },
    });

    if (processing) {
      return Response.json({ status: "busy", jobId: processing.id });
    }

    // 3. Get next PENDING job (FIFO)
    const nextJob = await prisma.generationJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        geschichte: { select: { id: true, text: true, titel: true, hoererProfil: { select: { name: true } } } },
      },
    });

    if (!nextJob) {
      return Response.json({ status: "idle", message: "No jobs in queue" });
    }

    // 4. Mark as PROCESSING
    await prisma.generationJob.update({
      where: { id: nextJob.id },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    console.log(`[Queue] Processing job ${nextJob.id} for story "${nextJob.geschichte.titel || nextJob.geschichteId}"`);

    // 5. Generate audio
    const { wav: audioBuffer, mp3: isMp3, timeline } = await generateAudio(nextJob.geschichte.text);
    const ext = isMp3 ? "mp3" : "wav";
    const contentType = isMp3 ? "audio/mpeg" : "audio/wav";

    console.log(`[Queue] Generated ${audioBuffer.byteLength} bytes (${ext}), ${timeline.length} segments`);

    // 6. Upload to Vercel Blob
    const { put } = await import("@vercel/blob");
    const blob = await put(
      `audio/${nextJob.geschichteId}.${ext}`,
      Buffer.from(audioBuffer),
      { access: "private", contentType, addRandomSuffix: true }
    );

    // 7. Calculate duration
    const audioDauerSek = timeline.length > 0
      ? timeline[timeline.length - 1].endMs / 1000
      : undefined;

    // 8. Update Geschichte with audio data
    await prisma.geschichte.update({
      where: { id: nextJob.geschichteId },
      data: {
        audioUrl: blob.url,
        audioDauerSek,
        timeline: timeline.length > 0 ? JSON.parse(JSON.stringify(timeline)) : undefined,
      },
    });

    // 9. Mark job as COMPLETED
    await prisma.generationJob.update({
      where: { id: nextJob.id },
      data: { status: "COMPLETED", completedAt: new Date(), error: null },
    });

    console.log(`[Queue] Completed job ${nextJob.id}, duration: ${audioDauerSek?.toFixed(1)}s`);

    // 10. Send notification email
    try {
      const user = await prisma.user.findUnique({
        where: { id: nextJob.userId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        const profilName = nextJob.geschichte.hoererProfil?.name || "Dein Kind";
        const storyTitle = nextJob.geschichte.titel || "Neue Geschichte";
        const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

        await resend.emails.send({
          from: emailFrom,
          to: user.email,
          subject: `${profilName}s Geschichte ist fertig!`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #1a2e1a; color: #f5eed6; border-radius: 16px;">
              <h1 style="font-size: 20px; margin: 0 0 8px; color: #f5eed6; text-align: center;">KoalaTree</h1>
              <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin: 16px 0;">
                <p style="font-size: 16px; margin: 0 0 8px; color: #a8d5b8; font-weight: 600;">${storyTitle}</p>
                <p style="font-size: 14px; color: rgba(255,255,255,0.6); margin: 0;">
                  Koda hat eine neue Geschichte für ${profilName} erzählt. Sie wartet am KoalaTree auf euch!
                </p>
                ${audioDauerSek ? `<p style="font-size: 12px; color: rgba(255,255,255,0.3); margin: 8px 0 0;">Dauer: ${Math.floor(audioDauerSek / 60)}:${String(Math.floor(audioDauerSek % 60)).padStart(2, "0")} Minuten</p>` : ""}
              </div>
              <div style="text-align: center;">
                <a href="${baseUrl}/geschichten" style="display: inline-block; background: #4a7c59; color: #f5eed6; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600;">Jetzt anhören</a>
              </div>
            </div>
          `,
        });
        console.log(`[Queue] Notification email sent to ${user.email}`);
      }
    } catch (emailErr) {
      console.error("[Queue] Email notification failed:", emailErr);
      // Don't fail the job because of email
    }

    return Response.json({
      status: "processed",
      jobId: nextJob.id,
      geschichteId: nextJob.geschichteId,
      audioDauerSek,
    });
  } catch (error) {
    console.error("[Queue] Processing error:", error);

    // Try to mark the current job as failed
    try {
      const failedJob = await prisma.generationJob.findFirst({
        where: { status: "PROCESSING" },
      });
      if (failedJob) {
        const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler";
        if (failedJob.retryCount < 3) {
          await prisma.generationJob.update({
            where: { id: failedJob.id },
            data: { status: "PENDING", retryCount: { increment: 1 }, startedAt: null, error: errMsg },
          });
        } else {
          await prisma.generationJob.update({
            where: { id: failedJob.id },
            data: { status: "FAILED", error: errMsg, completedAt: new Date() },
          });
        }
      }
    } catch {
      // ignore cleanup errors
    }

    return Response.json({ status: "error", error: String(error) }, { status: 500 });
  }
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const job = await prisma.filmJob.findUnique({
    where: { id },
    include: {
      geschichte: { select: { videoUrl: true, titel: true } },
    },
  });

  if (!job) return Response.json({ error: "Job nicht gefunden" }, { status: 404 });
  if (job.userId !== session.user.id) return Response.json({ error: "Nicht berechtigt" }, { status: 403 });

  if (job.status === "COMPLETED" && job.geschichte.videoUrl) {
    return Response.json({
      status: "COMPLETED",
      videoUrl: `/api/video/film/${job.geschichteId}`,
      scenesTotal: job.scenesTotal,
      scenesComplete: job.scenesComplete,
      progress: job.progress,
    });
  }

  if (job.status === "FAILED") {
    return Response.json({
      status: "FAILED",
      error: job.error || "Unbekannter Fehler",
      scenesComplete: job.scenesComplete,
      scenesTotal: job.scenesTotal,
    });
  }

  // PENDING or PROCESSING
  return Response.json({
    status: job.status,
    progress: job.progress || (job.status === "PROCESSING" ? "Wird verarbeitet..." : "In der Warteschlange"),
    scenesComplete: job.scenesComplete,
    scenesTotal: job.scenesTotal,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

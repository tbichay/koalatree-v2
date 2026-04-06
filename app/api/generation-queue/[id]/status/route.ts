import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const AVG_GENERATION_MINUTES = 2; // Average time per audio generation

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const job = await prisma.generationJob.findUnique({
    where: { id },
    include: {
      geschichte: {
        select: { id: true, audioUrl: true, audioDauerSek: true, timeline: true, titel: true },
      },
    },
  });

  if (!job) {
    return Response.json({ error: "Job nicht gefunden" }, { status: 404 });
  }

  // Only allow owner to check status
  if (job.userId !== session.user.id) {
    return Response.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  if (job.status === "COMPLETED") {
    return Response.json({
      status: "COMPLETED",
      audioUrl: `/api/audio/${job.geschichteId}`,
      audioDauerSek: job.geschichte.audioDauerSek,
      timeline: job.geschichte.timeline,
      titel: job.geschichte.titel,
    });
  }

  if (job.status === "FAILED") {
    return Response.json({
      status: "FAILED",
      error: job.error || "Unbekannter Fehler",
      retryCount: job.retryCount,
    });
  }

  // PENDING or PROCESSING - calculate position
  const position = await prisma.generationJob.count({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      createdAt: { lt: job.createdAt },
    },
  });

  const estimatedMinutes = job.status === "PROCESSING"
    ? AVG_GENERATION_MINUTES
    : (position + 1) * AVG_GENERATION_MINUTES;

  return Response.json({
    status: job.status,
    position: job.status === "PROCESSING" ? 0 : position,
    estimatedMinutes,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

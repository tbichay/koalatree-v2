import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const { text, geschichteId } = (await request.json()) as {
      text: string;
      geschichteId?: string;
    };

    if (!text || !geschichteId) {
      return Response.json({ error: "Text und geschichteId sind erforderlich" }, { status: 400 });
    }

    // Check if a job already exists for this story
    const existingJob = await prisma.generationJob.findUnique({
      where: { geschichteId },
    });

    if (existingJob) {
      if (existingJob.status === "COMPLETED") {
        return Response.json({ jobId: existingJob.id, status: "COMPLETED" });
      }
      if (existingJob.status === "PROCESSING" || existingJob.status === "PENDING") {
        const position = await prisma.generationJob.count({
          where: { status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lt: existingJob.createdAt } },
        });
        return Response.json({ jobId: existingJob.id, status: existingJob.status, position });
      }
      // FAILED: allow retry by resetting
      await prisma.generationJob.update({
        where: { id: existingJob.id },
        data: { status: "PENDING", error: null, startedAt: null, completedAt: null },
      });
      return Response.json({ jobId: existingJob.id, status: "PENDING", position: 0 });
    }

    // Create new generation job
    const job = await prisma.generationJob.create({
      data: { geschichteId, userId, status: "PENDING" },
    });

    // Calculate queue position
    const position = await prisma.generationJob.count({
      where: { status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lt: job.createdAt } },
    });

    console.log(`[Queue] New job ${job.id} for story ${geschichteId}, position: ${position}`);

    return Response.json({ jobId: job.id, status: "PENDING", position });
  } catch (error) {
    console.error("Queue error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: `Fehler: ${message}` }, { status: 500 });
  }
}

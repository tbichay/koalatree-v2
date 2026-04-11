/**
 * Studio Task Detail API — Get, cancel, retry, or delete a task
 *
 * GET: Task status + progress
 * PUT: Cancel or retry task
 * DELETE: Remove task
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const task = await prisma.studioTask.findFirst({
    where: { id: taskId, userId: session.user.id },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  if (!task) return Response.json({ error: "Task nicht gefunden" }, { status: 404 });

  return Response.json({ task });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const body = await request.json() as { action: "cancel" | "retry" };

  const task = await prisma.studioTask.findFirst({
    where: { id: taskId, userId: session.user.id },
  });
  if (!task) return Response.json({ error: "Task nicht gefunden" }, { status: 404 });

  if (body.action === "cancel") {
    if (task.status !== "pending" && task.status !== "running") {
      return Response.json({ error: "Kann nur wartende oder laufende Tasks abbrechen" }, { status: 400 });
    }
    const updated = await prisma.studioTask.update({
      where: { id: taskId },
      data: { status: "cancelled", completedAt: new Date() },
    });
    return Response.json({ task: updated });
  }

  if (body.action === "retry") {
    if (task.status !== "failed" && task.status !== "cancelled") {
      return Response.json({ error: "Kann nur fehlgeschlagene oder abgebrochene Tasks wiederholen" }, { status: 400 });
    }
    const updated = await prisma.studioTask.update({
      where: { id: taskId },
      data: {
        status: "pending",
        error: null,
        progress: null,
        progressPct: null,
        startedAt: null,
        completedAt: null,
      },
    });
    return Response.json({ task: updated });
  }

  return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const task = await prisma.studioTask.findFirst({
    where: { id: taskId, userId: session.user.id },
  });
  if (!task) return Response.json({ error: "Task nicht gefunden" }, { status: 404 });

  // Don't delete running tasks
  if (task.status === "running") {
    return Response.json({ error: "Laufende Tasks koennen nicht geloescht werden. Erst abbrechen." }, { status: 400 });
  }

  await prisma.studioTask.delete({ where: { id: taskId } });
  return Response.json({ deleted: true });
}

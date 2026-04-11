/**
 * Studio Tasks API — CRUD for background AI tasks
 *
 * GET: List tasks for current user (filter by projectId, status, type)
 * POST: Create a new task and enqueue it
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const where: Record<string, unknown> = { userId: session.user.id };
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (type) where.type = type;

  const tasks = await prisma.studioTask.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: Math.min(limit, 100),
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  // Count by status
  const counts = await prisma.studioTask.groupBy({
    by: ["status"],
    where: { userId: session.user.id },
    _count: true,
  });

  const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return Response.json({ tasks, counts: statusCounts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    projectId?: string;
    type: string;
    input: Record<string, unknown>;
    priority?: number;
    maxRetries?: number;
    estimatedCostCents?: number;
  };

  if (!body.type || !body.input) {
    return Response.json({ error: "type und input sind erforderlich" }, { status: 400 });
  }

  // Verify project ownership if projectId provided
  if (body.projectId) {
    const project = await prisma.studioProject.findFirst({
      where: { id: body.projectId, userId: session.user.id },
    });
    if (!project) return Response.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }

  const task = await prisma.studioTask.create({
    data: {
      userId: session.user.id,
      projectId: body.projectId,
      type: body.type,
      input: JSON.parse(JSON.stringify(body.input)),
      priority: body.priority || 0,
      maxRetries: body.maxRetries ?? 3,
      estimatedCostCents: body.estimatedCostCents,
    },
  });

  return Response.json({ task }, { status: 201 });
}

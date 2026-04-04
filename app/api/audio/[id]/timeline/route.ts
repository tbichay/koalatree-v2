import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const geschichte = await prisma.geschichte.findFirst({
    where: { id, userId },
    select: { timeline: true },
  });

  if (!geschichte) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Return timeline or empty array if not available (older stories without timeline)
  return Response.json(geschichte.timeline || []);
}

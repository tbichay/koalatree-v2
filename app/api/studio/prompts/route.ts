import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || undefined;

  const blocks = await prisma.promptBlock.findMany({
    where: {
      ...(type && { type }),
      isProduction: true,
      scope: { in: ["system", `user:${session.user.id}`] },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return Response.json({ blocks });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Record ToS/Privacy acceptance after successful login
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      tosAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
  });

  return Response.json({ ok: true });
}

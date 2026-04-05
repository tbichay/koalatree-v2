import { prisma } from "@/lib/db";

// Check if an email already has an account (for sign-in: skip ToS for existing users)
export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) return Response.json({ exists: false });

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, tosAcceptedAt: true },
  });

  return Response.json({
    exists: !!user,
    tosAccepted: !!user?.tosAcceptedAt,
  });
}

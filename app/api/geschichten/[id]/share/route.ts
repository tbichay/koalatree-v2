import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

function generateSlug(): string {
  // Kryptischer, nicht-erratbarer Slug (16 hex chars = 8 bytes Entropie)
  return randomBytes(8).toString("hex");
}

// POST: Generate share slug for a story
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const story = await prisma.geschichte.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!story) return Response.json({ error: "Not found" }, { status: 404 });

  // Already has a share slug
  if (story.shareSlug) {
    const baseUrl = process.env.AUTH_URL || "https://www.koalatree.ai";
    return Response.json({ slug: story.shareSlug, url: `${baseUrl}/share/${story.shareSlug}` });
  }

  const slug = generateSlug();
  await prisma.geschichte.update({
    where: { id },
    data: { shareSlug: slug },
  });

  const baseUrl = process.env.AUTH_URL || "https://www.koalatree.ai";
  return Response.json({ slug, url: `${baseUrl}/share/${slug}` });
}

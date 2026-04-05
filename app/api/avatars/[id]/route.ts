import { prisma } from "@/lib/db";
import { get } from "@vercel/blob";

export const dynamic = "force-dynamic";

// Public proxy for avatar images (private blob store)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Try as user ID first, then profile ID
  let avatarUrl: string | null = null;

  const user = await prisma.user.findUnique({ where: { id }, select: { image: true } });
  if (user?.image) {
    avatarUrl = user.image;
  } else {
    const profile = await prisma.hoererProfil.findUnique({ where: { id }, select: { avatarUrl: true } });
    if (profile?.avatarUrl) avatarUrl = profile.avatarUrl;
  }

  if (!avatarUrl) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await get(avatarUrl, { access: "private" });
    if (!result?.stream) return new Response("Not found", { status: 404 });

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "image/webp",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}

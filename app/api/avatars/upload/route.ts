import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { put, del } from "@vercel/blob";
import sharp from "sharp";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string; // "user" oder "profile"
  const targetId = formData.get("id") as string; // User ID oder Profil ID

  if (!file || !type || !targetId) {
    return Response.json({ error: "file, type, id required" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Max 5MB" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Nur Bilder erlaubt" }, { status: 400 });
  }

  try {
    // Bild verarbeiten: 256x256, WebP
    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await sharp(buffer)
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();

    // Upload (überschreibt automatisch wenn existiert)
    const blobPath = `avatars/${type}/${targetId}.webp`;
    const blob = await put(blobPath, processed, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });

    // DB updaten
    if (type === "user") {
      if (targetId !== session.user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      await prisma.user.update({
        where: { id: session.user.id },
        data: { image: blob.url },
      });
    } else if (type === "profile") {
      // Prüfen ob Profil dem User gehört
      const profile = await prisma.hoererProfil.findFirst({
        where: { id: targetId, userId: session.user.id },
      });
      if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

      await prisma.hoererProfil.update({
        where: { id: targetId },
        data: { avatarUrl: blob.url },
      });
    } else {
      return Response.json({ error: "type must be 'user' or 'profile'" }, { status: 400 });
    }

    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("[Avatar Upload]", error);
    const msg = error instanceof Error ? error.message : "Upload fehlgeschlagen";
    return Response.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Avatar entfernen
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { type, id } = await request.json();

  if (type === "user") {
    if (id !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
    const user = await prisma.user.findUnique({ where: { id }, select: { image: true } });
    if (user?.image) try { await del(user.image); } catch { /* */ }
    await prisma.user.update({ where: { id }, data: { image: null } });
  } else if (type === "profile") {
    const profile = await prisma.hoererProfil.findFirst({
      where: { id, userId: session.user.id },
      select: { avatarUrl: true },
    });
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    if (profile.avatarUrl) try { await del(profile.avatarUrl); } catch { /* */ }
    await prisma.hoererProfil.update({ where: { id }, data: { avatarUrl: null } });
  }

  return Response.json({ ok: true });
}

/**
 * Studio Portrait Upload — Upload character portrait images
 *
 * POST: Upload an image file, store in Vercel Blob, return URL
 */

import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const characterId = formData.get("characterId") as string;
  const projectId = formData.get("projectId") as string;

  if (!file || !characterId || !projectId) {
    return Response.json({ error: "file, characterId und projectId erforderlich" }, { status: 400 });
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Nur Bilder erlaubt" }, { status: 400 });
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Max 10MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `studio/${projectId}/portraits/${characterId}.${ext}`;

  const blob = await put(path, file, {
    access: "private",
    contentType: file.type,
  });

  return Response.json({ portraitUrl: blob.url });
}

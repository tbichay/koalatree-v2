/**
 * Real-Portrait Upload für den Wan-Spike (Variante E).
 *
 * Nimmt ein Bild via multipart/form-data, lädt es zu fal.ai's Storage hoch
 * (public URL, ~10min gültig — reicht für einen Spike-Run) und gibt die
 * URL zurück. fal.ai kann seine eigenen URLs fetchen, also ideal für Wan.
 *
 * POST /api/studio/test-wan-spike/upload-portrait
 * Body: multipart/form-data mit { file: File }
 * Returns: { url: string }
 */

import { auth } from "@/lib/auth";
import { uploadToFal } from "@/lib/fal";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return Response.json({ error: "file fehlt" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Nur Bilder (image/*) erlaubt" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return Response.json({ error: "Max 20MB (Wan 2.7 Limit)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const filename = `real-portrait-${Date.now()}.${ext}`;

  try {
    const url = await uploadToFal(buffer, filename, file.type);
    return Response.json({ url, size: buffer.byteLength, contentType: file.type });
  } catch (err) {
    return Response.json({
      error: `fal.storage upload failed: ${(err as Error).message}`,
    }, { status: 500 });
  }
}

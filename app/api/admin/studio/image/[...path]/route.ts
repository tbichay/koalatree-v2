import { auth } from "@/lib/auth";
import { list, get } from "@vercel/blob";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.email) return false;
  return session.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Proxy for private studio images — admin only
// Supports /api/admin/studio/image/file.png AND /api/admin/studio/image/hero/file.png
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!(await isAdmin())) {
    return new Response("Forbidden", { status: 403 });
  }

  const { path } = await params;
  const filePath = path.join("/");

  if (!filePath || filePath.includes("..")) {
    return new Response("Invalid path", { status: 400 });
  }

  const prefix = `studio/${filePath}`;

  try {
    const { blobs } = await list({ prefix, limit: 1 });
    if (blobs.length === 0) {
      return new Response("Not found", { status: 404 });
    }

    const result = await get(blobs[0].url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return new Response("Image unavailable", { status: 503 });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "image/png",
        "Content-Length": String(result.blob.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Studio Image Proxy] Error:", error);
    return new Response("Error", { status: 500 });
  }
}

import { auth } from "@/lib/auth";
import { getAssets, createAsset } from "@/lib/assets";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || undefined;
  const category = searchParams.get("category") || undefined;
  const projectId = searchParams.get("projectId") || undefined;

  const assets = await getAssets({
    type: type as "portrait" | "landscape" | "clip" | "sound" | "reference" | undefined,
    category,
    projectId,
    userId: session.user.id,
  });

  return Response.json({ assets });
}

/** Upload a file as an asset (FormData: file, type, category, name, projectId) */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = (formData.get("type") as string) || "sound";
  const category = (formData.get("category") as string) || undefined;
  const name = (formData.get("name") as string) || undefined;
  const projectId = (formData.get("projectId") as string) || undefined;

  if (!file) return Response.json({ error: "Keine Datei" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const filename = `${type}-${Date.now()}-${file.name}`;

  const asset = await createAsset({
    type: type as "portrait" | "landscape" | "clip" | "sound" | "reference",
    name: name || file.name.replace(/\.[^.]+$/, ""),
    category,
    tags: category ? [category] : [],
    buffer,
    filename,
    mimeType,
    userId: session.user.id,
    projectId,
  });

  return Response.json({ asset });
}

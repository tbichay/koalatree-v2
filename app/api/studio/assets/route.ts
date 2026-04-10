import { auth } from "@/lib/auth";
import { getAssets } from "@/lib/assets";

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

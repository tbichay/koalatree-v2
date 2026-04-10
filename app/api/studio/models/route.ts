import { auth } from "@/lib/auth";
import { listModels } from "@/lib/model-adapter";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;

  const models = await listModels(category);

  return Response.json({ models });
}

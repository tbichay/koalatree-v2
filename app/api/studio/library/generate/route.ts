import { auth } from "@/lib/auth";
import { createAsset } from "@/lib/assets";

export const maxDuration = 800;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, description, style, tags, name, category: reqCategory } = body as {
    type: "portrait" | "landscape" | "reference";
    description: string;
    style: string;
    tags?: string[];
    name?: string;
    category?: string;
  };

  if (!type || !description) {
    return Response.json(
      { error: "type und description sind erforderlich" },
      { status: 400 },
    );
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI();

  const styleHint =
    style === "realistic"
      ? "Photorealistic, cinematic lighting, shallow depth of field"
      : style === "disney-2d"
        ? "2D Disney animation style, vibrant colors, hand-drawn feel"
        : style === "pixar-3d"
          ? "Pixar 3D animation style, smooth CGI rendering"
          : style === "ghibli"
            ? "Studio Ghibli anime style, soft pastel colors"
            : "High quality";

  let prompt: string;
  let size: string;

  if (type === "portrait") {
    prompt = `${styleHint}. Character portrait: ${description}. Head and shoulders, expressive eyes, detailed face. No text, no watermarks.`;
    size = "1024x1536";
  } else if (reqCategory === "prop") {
    prompt = `${styleHint}. Product shot / prop reference: ${description}. Clean isolated object on pure white background. Studio lighting, detailed textures. No people, no hands, no characters. No text, no watermarks.`;
    size = "1024x1024";
  } else if (reqCategory === "location") {
    prompt = `${styleHint}. Film set / location establishing shot: ${description}. Wide cinematic establishing shot showing the complete environment. No people, no characters. Detailed scenery, atmospheric lighting. No text, no watermarks.`;
    size = "1536x1024";
  } else {
    prompt = `${styleHint}. Landscape scene: ${description}. Wide establishing shot, cinematic composition. No text, no watermarks.`;
    size = "1536x1024";
  }

  const response = await (openai.images.generate as any)({
    model: "gpt-image-1.5",
    prompt,
    n: 1,
    size,
    quality: "medium",
  });

  const b64 = response.data[0]?.b64_json;
  if (!b64)
    return Response.json(
      { error: "Generierung fehlgeschlagen" },
      { status: 500 },
    );

  const imgBuffer = Buffer.from(b64, "base64");
  const timestamp = Date.now();
  const filename = `${type}-${timestamp}.png`;

  const asset = await createAsset({
    type,
    name: name || description,
    category: reqCategory || "standalone",
    tags: [
      ...(tags || []),
      `style:${style || "realistic"}`,
    ],
    buffer: imgBuffer,
    filename,
    mimeType: "image/png",
    width: type === "portrait" ? 1024 : reqCategory === "prop" ? 1024 : 1536,
    height: type === "portrait" ? 1536 : reqCategory === "prop" ? 1024 : 1024,
    generatedBy: { model: "gpt-image-1.5", prompt },
    modelId: "gpt-image-1.5",
    costCents: 4,
    userId: session.user.id,
  });

  return Response.json({ asset });
}

import { auth } from "@/lib/auth";
import { createAsset } from "@/lib/assets";

export const maxDuration = 800;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  let { type, description, style, tags, name, category: reqCategory, skipEnhance, qualityCheck } = body as {
    type: "portrait" | "landscape" | "reference";
    description: string;
    style: string;
    tags?: string[];
    name?: string;
    category?: string;
    skipEnhance?: boolean;  // Skip prompt enhancement (use raw prompt)
    qualityCheck?: boolean; // Run post-generation quality check
  };

  if (!type || !description) {
    return Response.json(
      { error: "type und description sind erforderlich" },
      { status: 400 },
    );
  }

  // ── Phase 1: Enhance prompt with AI ──
  const { enhanceImagePrompt, validateImage } = await import("@/lib/studio/image-quality");
  const imageCategory = type === "portrait" ? "actor"
    : reqCategory === "prop" ? "prop"
    : reqCategory === "location" ? "location"
    : "location";

  const { getStyleHint } = await import("@/lib/studio/visual-styles");
  const styleHint = getStyleHint(style || "realistic");

  let prompt: string = "";
  let enhancedData: { reasoning: string; warnings: string[] } | undefined;

  if (!skipEnhance) {
    console.log(`[Generate] Enhancing prompt: "${description.slice(0, 60)}..." (${imageCategory})`);
    try {
      const enhanced = await enhanceImagePrompt(description, imageCategory, styleHint);
      prompt = enhanced.prompt;
      enhancedData = { reasoning: enhanced.reasoning, warnings: enhanced.warnings };
      console.log(`[Generate] Enhanced: "${prompt.slice(0, 80)}..." | Reasoning: ${enhanced.reasoning}`);
    } catch (enhErr) {
      console.warn(`[Generate] Enhancement failed, using fallback:`, enhErr);
      skipEnhance = true; // Fall through to manual prompt below
    }
  }
  if (skipEnhance) {
    // Fallback: build prompt manually (old behavior)
    if (type === "portrait") {
      prompt = `${styleHint}. Character portrait: ${description}. Head and shoulders, expressive eyes, detailed face. No text, no watermarks.`;
    } else if (reqCategory === "prop") {
      prompt = `${styleHint}. Product shot / prop reference: ${description}. Clean isolated object on pure white background. No text, no watermarks.`;
    } else if (reqCategory === "location") {
      prompt = `${styleHint}. Film set / location establishing shot: ${description}. Wide cinematic establishing shot. No text, no watermarks.`;
    } else {
      prompt = `${styleHint}. Landscape scene: ${description}. Wide establishing shot. No text, no watermarks.`;
    }
  }

  let size: string;
  if (type === "portrait") size = "1024x1536";
  else if (reqCategory === "prop") size = "1024x1024";
  else size = "1536x1024";

  // ── Generate image ──
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI();

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

  // ── Phase 2: Quality check (optional) ──
  let validation: { passed: boolean; score: number; issues: string[]; improvedPrompt: string } | undefined;
  let finalB64 = b64;

  if (qualityCheck) {
    console.log(`[Generate] Running quality check...`);
    validation = await validateImage(b64, prompt, imageCategory);
    console.log(`[Generate] Quality: ${validation.score}/10, passed=${validation.passed}, issues=${validation.issues.length}`);

    // If failed and has improved prompt: re-generate once
    if (!validation.passed && validation.improvedPrompt) {
      console.log(`[Generate] Re-generating with improved prompt: ${validation.improvedPrompt.slice(0, 80)}...`);
      try {
        const retryResponse = await (openai.images.generate as any)({
          model: "gpt-image-1.5",
          prompt: validation.improvedPrompt,
          n: 1,
          size,
          quality: "medium",
        });
        if (retryResponse.data[0]?.b64_json) {
          finalB64 = retryResponse.data[0].b64_json;
          prompt = validation.improvedPrompt; // Update prompt for provenance
        }
      } catch { /* use original image */ }
    }
  }

  const imgBuffer = Buffer.from(finalB64, "base64");
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
    costCents: qualityCheck ? 8 : 5, // Higher cost when quality check used
    userId: session.user.id,
  });

  return Response.json({
    asset,
    enhanced: enhancedData,
    validation,
    promptUsed: prompt,
  });
}

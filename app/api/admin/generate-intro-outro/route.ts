import { auth } from "@/lib/auth";
import { generateSceneVideo, downloadVideo } from "@/lib/hedra";
import { put, list } from "@vercel/blob";
import OpenAI from "openai";
import { STYLE_PREFIX, CHARACTERS, SCENES, type CharacterKey } from "@/lib/studio";

export const maxDuration = 300;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";
const openai = new OpenAI();

const INTRO_PRESETS = {
  koalatree_classic: {
    name: "KoalaTree Classic",
    imagePrompt: `${STYLE_PREFIX}\n\nWide cinematic establishing shot of the majestic KoalaTree at golden hour. The enormous ancient eucalyptus tree fills the frame, its massive trunk and sprawling branches reaching toward a warm orange-gold sunset sky. Soft golden light filters through the canopy. Fireflies begin to glow between the branches. At the base, the forest floor is covered in soft moss and tiny wildflowers. The tree radiates warmth, magic, and wonder. A faint ethereal glow surrounds the entire tree suggesting its magical nature. NO characters visible. Pure landscape. Bold saturated colors. Wide 16:9.`,
    animationPrompt: "The camera slowly pushes in toward the magical tree. Leaves gently sway in warm evening breeze. Fireflies float and glow softly. Golden sunlight shifts subtly through the canopy. Warm, magical, inviting atmosphere. Smooth cinematic camera movement.",
  },
  koalatree_night: {
    name: "KoalaTree Nacht",
    imagePrompt: `${STYLE_PREFIX}\n\nWide cinematic shot of the KoalaTree at night. Deep blue-purple starlit sky with a glowing full moon behind the tree. The tree is silhouetted but warmly lit from within by hundreds of tiny fireflies. Silver moonlight outlines the massive branches. Stars twinkle. Mystical, peaceful, dreamlike. NO characters. Wide 16:9.`,
    animationPrompt: "Slow gentle zoom into the moonlit tree. Fireflies pulse and float. Stars twinkle subtly. Moonlight shifts gently across branches. Peaceful, dreamy night atmosphere. Slow cinematic movement.",
  },
  koalatree_dawn: {
    name: "KoalaTree Morgen",
    imagePrompt: `${STYLE_PREFIX}\n\nWide cinematic shot of the KoalaTree at dawn. Pastel pink and lavender sky with the first golden rays of sunrise. Morning mist swirls gently around the base of the tree. Birds begin to stir in the canopy. Dewdrops glisten on leaves. Fresh, hopeful, new day energy. NO characters. Wide 16:9.`,
    animationPrompt: "Slow upward camera tilt revealing the tree as morning light grows. Mist drifts and dissipates. Dewdrops catch light. Birds flutter in silhouette. Fresh morning atmosphere. Smooth upward reveal.",
  },
};

const OUTRO_PRESETS = {
  koalatree_wave: {
    name: "Koda winkt",
    imagePrompt: `${STYLE_PREFIX}\n\nFull-body portrait of ${CHARACTERS.koda.description} Wearing ${CHARACTERS.koda.accessories}. Koda is sitting on a thick branch, gently waving one paw goodbye with a warm loving smile. Background: ${SCENES.golden} The mood is warm, grateful, and cozy. 16:9 wide composition with Koda slightly right of center.`,
    animationPrompt: "The koala character waves goodbye gently with one paw. Warm smile. Slight head tilt. Leaves sway softly around him. Golden light. Gentle, warm farewell. Smooth natural animation.",
  },
  koalatree_group: {
    name: "Alle winken",
    imagePrompt: `${STYLE_PREFIX}\n\nWide scene: All KoalaTree characters together waving goodbye. ${CHARACTERS.koda.description} center on a branch waving. ${CHARACTERS.kiki.description} perched nearby flapping wings. ${CHARACTERS.luna.description} on a higher branch. ${CHARACTERS.mika.description} at the base. ${CHARACTERS.pip.description} near water. ${CHARACTERS.sage.description} between roots. ${CHARACTERS.nuki.description} jumping happily. All waving or gesturing goodbye. Background: ${SCENES.golden} Wide 16:9.`,
    animationPrompt: "All characters wave and move gently. The koala waves from his branch. The bird flaps wings. The dingo wags tail. Warm golden sunset light. Gentle ambient movement. Group farewell scene. Smooth animation.",
  },
  simple_fade: {
    name: "Einfacher Abspann",
    imagePrompt: null, // No image needed, ffmpeg creates text card
    animationPrompt: null,
  },
};

// GET: List available presets + existing intros/outros
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check for existing intros/outros in blob
  let existingIntros: { name: string; url: string; size: number }[] = [];
  let existingOutros: { name: string; url: string; size: number }[] = [];

  try {
    const { blobs: introBlobs } = await list({ prefix: "intros/", limit: 20 });
    existingIntros = introBlobs.filter(b => b.pathname.endsWith(".mp4")).map(b => ({
      name: b.pathname.split("/").pop() || "",
      url: `/api/video/marketing/${b.pathname.replace("intros/", "intro-").replace(".mp4", "")}`,
      size: b.size,
    }));

    const { blobs: outroBlobs } = await list({ prefix: "outros/", limit: 20 });
    existingOutros = outroBlobs.filter(b => b.pathname.endsWith(".mp4")).map(b => ({
      name: b.pathname.split("/").pop() || "",
      url: `/api/video/marketing/${b.pathname.replace("outros/", "outro-").replace(".mp4", "")}`,
      size: b.size,
    }));
  } catch { /* no existing */ }

  return Response.json({
    introPresets: Object.entries(INTRO_PRESETS).map(([id, p]) => ({ id, name: p.name })),
    outroPresets: Object.entries(OUTRO_PRESETS).map(([id, p]) => ({ id, name: p.name })),
    existingIntros,
    existingOutros,
  });
}

// POST: Generate an intro or outro
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { type, presetId } = await request.json() as { type: "intro" | "outro"; presetId: string };

    const allPresets: Record<string, { name: string; imagePrompt: string | null; animationPrompt: string | null }> =
      type === "intro" ? INTRO_PRESETS : OUTRO_PRESETS;
    const preset = allPresets[presetId];
    if (!preset) return Response.json({ error: "Unknown preset" }, { status: 400 });

    if (!preset.imagePrompt) {
      // Simple text card — created via ffmpeg locally
      return Response.json({
        message: "Einfacher Text-Abspann wird lokal via ffmpeg erstellt",
        command: `node scripts/master-film.mjs --intro-only`,
      });
    }

    console.log(`[Intro/Outro] Generating ${type}: ${preset.name}`);

    // 1. Generate image via GPT-Image-1 (consistent KoalaTree style)
    console.log(`[Intro/Outro] Generating image...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgResponse = await (openai.images.generate as any)({
      model: "gpt-image-1",
      prompt: preset.imagePrompt,
      n: 1,
      size: "1536x1024",
      quality: "high",
    });

    const imageData = imgResponse.data?.[0];
    if (!imageData?.b64_json) throw new Error("No image generated");

    const imgBuffer = Buffer.from(imageData.b64_json, "base64");
    console.log(`[Intro/Outro] Image: ${(imgBuffer.byteLength / 1024).toFixed(0)}KB`);

    // Save image
    await put(`${type}s/${presetId}-image.png`, imgBuffer, { access: "private", contentType: "image/png", allowOverwrite: true });

    // 2. Animate with Kling
    console.log(`[Intro/Outro] Animating...`);
    const videoUrl = await generateSceneVideo({
      imageBuffer: imgBuffer,
      prompt: preset.animationPrompt!,
      aspectRatio: "16:9",
      resolution: "720p",
    });

    // 3. Download and store
    const videoBuffer = await downloadVideo(videoUrl);
    const blob = await put(
      `${type}s/${presetId}.mp4`,
      videoBuffer,
      { access: "private", contentType: "video/mp4", allowOverwrite: true }
    );

    console.log(`[Intro/Outro] Done: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

    return Response.json({
      type,
      preset: preset.name,
      videoUrl: blob.url,
      size: videoBuffer.byteLength,
    });
  } catch (error) {
    console.error("[Intro/Outro]", error);
    return Response.json({ error: error instanceof Error ? error.message : "Fehler" }, { status: 500 });
  }
}

import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import OpenAI from "openai";
import { STYLE_PREFIX, CHARACTERS, SCENES, type CharacterKey, type SceneKey } from "@/lib/studio";

export const maxDuration = 120;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";
const openai = new OpenAI();

// Extended scene descriptions for film landscapes
const LANDSCAPE_SCENES: Record<string, string> = {
  koalatree_full: "A massive ancient eucalyptus tree (the KoalaTree) filling the entire frame. The tree is enormous, magical, with thick gnarled branches spreading wide. Warm golden sunset light filters through the canopy. Fireflies and soft particles float in the air. Multiple levels visible: high branches, middle trunk, roots at ground level. This is the home of many Australian animals.",
  koalatree_branch: "Close-up of a thick eucalyptus branch high in the KoalaTree. Bark texture visible, small ferns and moss growing. Warm dappled sunlight through leaves above. Cozy, safe feeling.",
  forest_floor: "The forest floor beneath the ancient KoalaTree. Massive root system visible, soft moss, scattered eucalyptus leaves, small wildflowers. Warm golden light filtering down from the canopy far above.",
  night_forest: "The KoalaTree at night. Deep blue-purple sky with stars and a glowing full moon. Soft silver moonlight illuminating the trunk. Fireflies glowing between branches. Mystical, peaceful atmosphere.",
  beach: "A beautiful Australian beach at golden hour. Soft sand, gentle turquoise waves rolling in. Eucalyptus trees line the shore in the background. Warm, peaceful, tropical feeling. A small rocky outcrop on the left.",
  stream: "A gentle forest stream flowing beside the KoalaTree's roots. Crystal clear water over smooth pebbles. Ferns and water plants along the banks. Dappled sunlight creating sparkles on the water surface.",
  meadow: "An open meadow clearing near the KoalaTree. Tall golden grass swaying in gentle breeze. Wildflowers in purple, yellow, and white. The massive KoalaTree visible in the background. Warm sunset light.",
  cave: "A cozy burrow entrance between the KoalaTree's roots. Warm earth tones, smooth walls, soft moss at the entrance. A warm glow from inside suggesting a comfortable home.",
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      type = "landscape",           // "landscape", "character", "custom"
      landscapeId,                   // Key from LANDSCAPE_SCENES
      characterId,                   // Key from CHARACTERS
      customPrompt,                  // Free-form addition to the prompt
      sceneBackground,               // Key from SCENES (golden, night, etc.)
      size = "1792x1024",           // DALL-E size: "1792x1024" (wide), "1024x1024" (square), "1024x1792" (tall)
      quality = "hd",
      geschichteId,                  // Optional: associate with a project
      sceneIndex,                    // Optional: associate with a scene
    } = body as {
      type?: "landscape" | "character" | "custom";
      landscapeId?: string;
      characterId?: string;
      customPrompt?: string;
      sceneBackground?: SceneKey;
      size?: "1792x1024" | "1024x1024" | "1024x1792";
      quality?: "hd" | "standard";
      geschichteId?: string;
      sceneIndex?: number;
    };

    // Build the prompt
    let prompt = STYLE_PREFIX + "\n\n";

    if (type === "landscape") {
      const landscapeDesc = landscapeId ? LANDSCAPE_SCENES[landscapeId] : "";
      const bgScene = sceneBackground ? SCENES[sceneBackground] : SCENES.golden;
      prompt += `Wide cinematic landscape scene:\n${landscapeDesc || customPrompt || "A magical forest clearing"}\n\nBackground sky: ${bgScene}\n\nNO characters in this scene. Pure landscape/environment. NO noise, NO grain. Bold saturated colors. Wide 16:9 cinematic composition. High detail for zooming.`;
    } else if (type === "character" && characterId) {
      const char = CHARACTERS[characterId as CharacterKey];
      if (!char) return Response.json({ error: "Unknown character" }, { status: 400 });
      const bgScene = sceneBackground ? SCENES[sceneBackground] : SCENES[char.defaultBackground as SceneKey];
      prompt += `Full-body portrait of ${char.description}\n`;
      if (char.accessories && characterId !== "nuki") prompt += `Wearing ${char.accessories}.\n`;
      if (customPrompt) prompt += `${customPrompt}\n`;
      prompt += `\nBackground: ${bgScene}\nNO noise, NO grain. Bold saturated colors.`;
    } else {
      // Custom
      prompt += customPrompt || "A magical forest scene";
      prompt += "\n\nNO noise, NO grain. Bold saturated colors.";
    }

    console.log(`[Scene Image] Generating ${type} (${size}, ${quality})...`);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: size as "1792x1024" | "1024x1024" | "1024x1792",
      quality,
      style: "vivid",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) throw new Error("No image generated");

    const revisedPrompt = response.data?.[0]?.revised_prompt;

    // Download image
    const imgRes = await fetch(imageUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Store in Blob
    const timestamp = Date.now();
    const prefix = geschichteId ? `films/${geschichteId}/assets` : "studio/scene-images";
    const filename = type === "character" && characterId
      ? `${characterId}-${timestamp}.png`
      : type === "landscape" && landscapeId
        ? `${landscapeId}-${timestamp}.png`
        : `custom-${timestamp}.png`;

    const blob = await put(`${prefix}/${filename}`, imgBuffer, {
      access: "private",
      contentType: "image/png",
    });

    console.log(`[Scene Image] Generated: ${blob.pathname} (${(imgBuffer.byteLength / 1024).toFixed(0)}KB)`);

    return Response.json({
      url: blob.downloadUrl,
      blobUrl: blob.url,
      pathname: blob.pathname,
      size: imgBuffer.byteLength,
      revisedPrompt: revisedPrompt?.substring(0, 200),
      availableLandscapes: Object.keys(LANDSCAPE_SCENES),
    });
  } catch (error) {
    console.error("[Scene Image]", error);
    return Response.json({ error: error instanceof Error ? error.message : "Fehler" }, { status: 500 });
  }
}

// GET: List available landscape presets
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  return Response.json({
    landscapes: Object.entries(LANDSCAPE_SCENES).map(([id, desc]) => ({
      id,
      description: desc.substring(0, 100) + "...",
    })),
    characters: Object.entries(CHARACTERS).map(([id, c]) => ({
      id,
      name: c.name,
      emoji: c.emoji,
    })),
    backgrounds: Object.keys(SCENES),
  });
}

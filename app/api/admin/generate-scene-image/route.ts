import { auth } from "@/lib/auth";
import { put, list, get } from "@vercel/blob";
import OpenAI from "openai";
import { toFile } from "openai";
import { STYLE_PREFIX, CHARACTERS, SCENES, type CharacterKey, type SceneKey } from "@/lib/studio";

export const maxDuration = 120;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";
const openai = new OpenAI();

// Extended scene descriptions for film landscapes
const LANDSCAPE_SCENES: Record<string, string> = {
  koalatree_full: "A massive ancient eucalyptus tree (the KoalaTree) filling the entire frame. The tree is enormous, magical, with thick gnarled branches spreading wide. Warm golden sunset light filters through the canopy. Multiple levels visible: high branches, middle trunk, roots at ground level. This is the home of many Australian animals. NO particles, NO dots, NO fireflies, NO specks in the sky.",
  koalatree_branch: "Close-up of a thick eucalyptus branch high in the KoalaTree. Bark texture visible, small ferns and moss growing. Warm dappled sunlight through leaves above. Cozy, safe feeling.",
  forest_floor: "The forest floor beneath the ancient KoalaTree. Massive root system visible, soft moss, scattered eucalyptus leaves, small wildflowers. Warm golden light filtering down from the canopy far above.",
  night_forest: "The KoalaTree at night. Deep blue-purple sky with stars and a glowing full moon. Soft silver moonlight illuminating the trunk. Fireflies glowing between branches. Mystical, peaceful atmosphere.",
  beach: "A beautiful Australian beach at golden hour. Soft sand, gentle turquoise waves rolling in. Eucalyptus trees line the shore in the background. Warm, peaceful, tropical feeling. A small rocky outcrop on the left.",
  stream: "A gentle forest stream flowing beside the KoalaTree's roots. Crystal clear water over smooth pebbles. Ferns and water plants along the banks. Dappled sunlight creating sparkles on the water surface.",
  meadow: "An open meadow clearing near the KoalaTree. Tall golden grass swaying in gentle breeze. Wildflowers in purple, yellow, and white. The massive KoalaTree visible in the background. Warm sunset light.",
  cave: "A cozy burrow entrance between the KoalaTree's roots. Warm earth tones, smooth walls, soft moss at the entrance. A warm glow from inside suggesting a comfortable home.",
};

// ── Helper: download a portrait from Blob as Buffer ──────────────────
async function loadPortrait(characterId: string): Promise<Buffer | null> {
  try {
    // Try canonical portrait first (studio/koda-portrait.png)
    const { blobs } = await list({ prefix: `studio/${characterId}-portrait.png`, limit: 1 });
    if (blobs.length > 0) {
      const result = await get(blobs[0].url, { access: "private" });
      if (result && result.statusCode === 200 && result.stream) {
        const reader = result.stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        return Buffer.concat(chunks);
      }
    }

    // Fallback: try active portrait from images/ (served as /api/images/koda-portrait.png)
    const { blobs: imgBlobs } = await list({ prefix: `images/${characterId}-portrait.png`, limit: 1 });
    if (imgBlobs.length > 0) {
      const result = await get(imgBlobs[0].url, { access: "private" });
      if (result && result.statusCode === 200 && result.stream) {
        const reader = result.stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        return Buffer.concat(chunks);
      }
    }
  } catch {
    // Portrait not found
  }
  return null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      type = "landscape",           // "landscape", "character", "group", "custom"
      landscapeId,                   // Key from LANDSCAPE_SCENES
      characterId,                   // Key from CHARACTERS (single character)
      characterIds,                  // Multiple characters for group scenes
      customPrompt,                  // Free-form addition to the prompt
      sceneBackground,               // Key from SCENES (golden, night, etc.)
      size = "1792x1024",           // Image size
      quality = "hd",
      geschichteId,                  // Optional: associate with a project
      sceneIndex,                    // Optional: associate with a scene
    } = body as {
      type?: "landscape" | "character" | "group" | "custom";
      landscapeId?: string;
      characterId?: string;
      characterIds?: string[];
      customPrompt?: string;
      sceneBackground?: SceneKey;
      size?: "1792x1024" | "1024x1024" | "1024x1792";
      quality?: "hd" | "standard";
      geschichteId?: string;
      sceneIndex?: number;
    };

    // Build the prompt
    let prompt = STYLE_PREFIX + "\n\n";

    // Collect character IDs that need reference images
    const refCharIds: string[] = [];

    if (type === "group") {
      const chars = (characterIds || Object.keys(CHARACTERS)).slice(0, 7);
      const bgScene = sceneBackground ? SCENES[sceneBackground] : SCENES.golden;
      const landscapeDesc = landscapeId ? LANDSCAPE_SCENES[landscapeId] : LANDSCAPE_SCENES.koalatree_full;

      prompt += `Wide cinematic scene with MULTIPLE CHARACTERS together in ONE image:\n\n`;
      prompt += `Setting: ${landscapeDesc}\n\n`;
      prompt += `Characters present in the scene (each must look EXACTLY like their reference image):\n\n`;

      const positions: Record<string, string> = {
        koda: "sitting on a thick branch high in the tree, center of the image",
        kiki: "perched on a branch near Koda, wings slightly spread",
        luna: "sitting gracefully on a higher branch, looking down serenely",
        mika: "standing confidently at the base of the tree on the ground",
        pip: "peeking curiously from behind a root near a small stream",
        sage: "sitting in a meditation pose between the large roots",
        nuki: "standing slightly off-balance near Mika, grinning widely",
      };

      for (const cid of chars) {
        const char = CHARACTERS[cid as CharacterKey];
        if (!char) continue;
        const pos = positions[cid] || "visible in the scene";
        prompt += `- ${char.name} the ${char.tier}: ${char.description}`;
        if (char.accessories && cid !== "nuki") prompt += ` Wearing ${char.accessories}.`;
        prompt += ` Position: ${pos}.\n`;
        refCharIds.push(cid);
      }

      if (customPrompt) prompt += `\nAdditional: ${customPrompt}\n`;
      prompt += `\nBackground sky: ${bgScene}`;
      prompt += `\n\nIMPORTANT: Each character MUST match its reference image exactly — same species, same colors, same accessories, same face. ALL characters must be clearly visible. Show full or nearly-full bodies.`;
      prompt += `\nNO noise, NO grain. Bold saturated colors. Wide 16:9 cinematic composition.`;

    } else if (type === "landscape") {
      const landscapeDesc = landscapeId ? LANDSCAPE_SCENES[landscapeId] : "";
      const bgScene = sceneBackground ? SCENES[sceneBackground] : SCENES.golden;
      prompt += `Wide cinematic landscape scene:\n${landscapeDesc || customPrompt || "A magical forest clearing"}\n\nBackground sky: ${bgScene}\n\nNO characters in this scene. Pure landscape/environment. NO noise, NO grain. Bold saturated colors. Wide 16:9 cinematic composition. High detail for zooming.`;

    } else if (type === "character" && characterId) {
      const char = CHARACTERS[characterId as CharacterKey];
      if (!char) return Response.json({ error: "Unknown character" }, { status: 400 });
      const bgScene = sceneBackground ? SCENES[sceneBackground] : SCENES[char.defaultBackground as SceneKey];
      prompt += `Full-body portrait of ${char.description}\nThe character MUST look exactly like the reference image — same species, colors, accessories, facial features.\n`;
      if (char.accessories && characterId !== "nuki") prompt += `Wearing ${char.accessories}.\n`;
      if (customPrompt) prompt += `${customPrompt}\n`;
      prompt += `\nBackground: ${bgScene}\nNO noise, NO grain. Bold saturated colors.`;
      refCharIds.push(characterId);

    } else {
      // Custom
      prompt += customPrompt || "A magical forest scene";
      prompt += "\n\nNO noise, NO grain. Bold saturated colors.";
    }

    // Load reference portraits for characters in this scene
    const referenceBuffers: { id: string; buffer: Buffer }[] = [];
    if (refCharIds.length > 0) {
      console.log(`[Scene Image] Loading reference portraits for: ${refCharIds.join(", ")}`);
      // Limit to 10 refs (API max is 16 but we need room for prompt)
      for (const cid of refCharIds.slice(0, 10)) {
        const buf = await loadPortrait(cid);
        if (buf) {
          referenceBuffers.push({ id: cid, buffer: buf });
          console.log(`[Scene Image] Loaded ref: ${cid} (${(buf.byteLength / 1024).toFixed(0)}KB)`);
        }
      }
    }

    const gptSize = size === "1024x1792" ? "1024x1024" : size;
    const resolvedSize = gptSize === "1792x1024" ? "1536x1024" : gptSize;

    console.log(`[Scene Image] Generating ${type} (${resolvedSize}) with ${referenceBuffers.length} reference images...`);

    let imgBuffer: Buffer;

    if (referenceBuffers.length > 0) {
      // Use images.edit() with reference portraits for character consistency
      const imageFiles = await Promise.all(
        referenceBuffers.map((ref) =>
          toFile(ref.buffer, `${ref.id}-portrait.png`, { type: "image/png" })
        )
      );

      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: imageFiles,
        prompt,
        n: 1,
        size: resolvedSize as "1024x1024" | "1536x1024",
        quality: "high" as "low" | "medium" | "high" | "auto",
        input_fidelity: "high",
      });

      const imageData = response.data?.[0];
      if (!imageData?.b64_json) throw new Error("No image generated");
      imgBuffer = Buffer.from(imageData.b64_json, "base64");
    } else {
      // Pure landscape / custom — no reference images needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (openai.images.generate as any)({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: resolvedSize,
        quality: "high",
      });

      const imageData = response.data?.[0];
      if (!imageData?.b64_json) throw new Error("No image generated");
      imgBuffer = Buffer.from(imageData.b64_json, "base64");
    }

    // Store in Blob
    const timestamp = Date.now();
    const prefix = geschichteId ? `films/${geschichteId}/assets` : "studio/scene-images";
    const filename = type === "character" && characterId
      ? `${characterId}-${timestamp}.png`
      : type === "landscape" && landscapeId
        ? `${landscapeId}-${timestamp}.png`
        : type === "group"
          ? `group-${timestamp}.png`
          : `custom-${timestamp}.png`;

    const blob = await put(`${prefix}/${filename}`, imgBuffer, {
      access: "private",
      contentType: "image/png",
    });

    console.log(`[Scene Image] Generated: ${blob.pathname} (${(imgBuffer.byteLength / 1024).toFixed(0)}KB, ${referenceBuffers.length} refs)`);

    return Response.json({
      url: blob.downloadUrl,
      blobUrl: blob.url,
      pathname: blob.pathname,
      size: imgBuffer.byteLength,
      referenceImages: referenceBuffers.map((r) => r.id),
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

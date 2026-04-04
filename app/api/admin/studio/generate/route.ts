import { currentUser } from "@clerk/nextjs/server";
import { put, list } from "@vercel/blob";
import OpenAI from "openai";
import {
  buildPrompt,
  buildFilename,
  HERO_BG_PROMPT,
  type CharacterKey,
  type PoseKey,
  type SceneKey,
  CHARACTERS,
  POSES,
  SCENES,
} from "@/lib/studio";

export const maxDuration = 120; // 2 minutes — image gen can be slow

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses.some(
    (e) => e.emailAddress.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
}

// POST: Generate an image
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json(
      { error: "Nur der Admin kann Bilder generieren" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { character, pose, scene, type } = body as {
    character?: CharacterKey;
    pose?: PoseKey;
    scene?: SceneKey;
    type?: "character" | "hero-bg";
  };

  // Validate inputs
  if (type === "hero-bg") {
    // Generate hero background (no characters)
  } else {
    if (!character || !CHARACTERS[character]) {
      return Response.json({ error: "Ung\u00FCltiger Charakter" }, { status: 400 });
    }
    if (pose && !POSES[pose]) {
      return Response.json({ error: "Ung\u00FCltige Pose" }, { status: 400 });
    }
    if (scene && !SCENES[scene]) {
      return Response.json({ error: "Ung\u00FCltige Szene" }, { status: 400 });
    }
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const isHero = type === "hero-bg";
    const prompt = isHero
      ? HERO_BG_PROMPT
      : buildPrompt(character!, pose || "portrait", scene);

    const size = isHero ? "1536x1024" : "1024x1024";
    const filename = isHero
      ? "hero-background.png"
      : buildFilename(character!, pose || "portrait");

    console.log(`[Studio] Generating ${filename}...`);
    console.log(`[Studio] Prompt (${prompt.length} chars): ${prompt.slice(0, 200)}...`);

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: size as "1024x1024" | "1536x1024",
      quality: "high",
    });

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      console.error("[Studio] No image data returned");
      return Response.json({ error: "Keine Bilddaten erhalten" }, { status: 500 });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.b64_json, "base64");
    console.log(`[Studio] Generated ${buffer.byteLength} bytes`);

    // Upload to Vercel Blob
    const blobPath = `studio/${filename}`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType: "image/png",
      allowOverwrite: true,
    });

    console.log(`[Studio] Uploaded to: ${blob.url}`);

    return Response.json({
      success: true,
      url: blob.url,
      filename,
      size: buffer.byteLength,
      prompt,
    });
  } catch (error) {
    console.error("[Studio] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET: List all generated images
export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  try {
    const { blobs } = await list({ prefix: "studio/" });
    const images = blobs.map((b) => ({
      url: b.url,
      pathname: b.pathname,
      filename: b.pathname.replace("studio/", ""),
      size: b.size,
      uploadedAt: b.uploadedAt,
    }));

    return Response.json({ images });
  } catch (error) {
    console.error("[Studio] List error:", error);
    return Response.json({ images: [] });
  }
}

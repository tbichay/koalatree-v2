import { currentUser } from "@clerk/nextjs/server";
import { put, list, copy } from "@vercel/blob";
import OpenAI from "openai";
import {
  buildPrompt,
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

// POST: Generate an image (saved with timestamp — multiple versions)
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
    if (pose && !(pose in POSES)) {
      return Response.json({ error: "Ung\u00FCltige Pose" }, { status: 400 });
    }
    if (scene && !(scene in SCENES)) {
      return Response.json({ error: "Ung\u00FCltige Szene" }, { status: 400 });
    }
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const isHero = type === "hero-bg";
    const usedPose = pose || "portrait";
    const usedScene = scene || (character ? CHARACTERS[character].defaultBackground as SceneKey : "golden");
    const prompt = isHero
      ? HERO_BG_PROMPT
      : buildPrompt(character!, usedPose, usedScene);

    const size = isHero ? "1536x1024" : "1024x1024";

    // Unique filename with timestamp for versioning
    const ts = Date.now();
    const baseName = isHero
      ? "hero-background"
      : `${character}-${usedPose}`;
    const versionFilename = `${baseName}-${ts}.png`;

    console.log(`[Studio] Generating ${versionFilename} (scene: ${usedScene})...`);
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

    // Upload versioned file to Vercel Blob (private store)
    const blob = await put(`studio/${versionFilename}`, buffer, {
      access: "private",
      contentType: "image/png",
    });

    console.log(`[Studio] Uploaded to: ${blob.url}`);

    // Return proxy URL with cache-buster
    const proxyUrl = `/api/admin/studio/image/${versionFilename}`;

    return Response.json({
      success: true,
      url: proxyUrl,
      filename: versionFilename,
      baseName,
      size: buffer.byteLength,
      prompt,
      scene: usedScene,
      pose: usedPose,
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

    // Find which images are "active" (the canonical versions used on the website)
    const activeFiles = new Set<string>();
    for (const b of blobs) {
      const fname = b.pathname.replace("studio/", "");
      // Active files are those WITHOUT a timestamp (e.g. koda-portrait.png)
      if (/^[\w]+-[\w]+\.png$/.test(fname) && !/\d{13}/.test(fname)) {
        activeFiles.add(fname);
      }
    }

    const images = blobs
      .map((b) => {
        const fname = b.pathname.replace("studio/", "");
        // Extract base name (without timestamp)
        const baseMatch = fname.match(/^(.+)-\d{13}\.png$/);
        const baseName = baseMatch ? baseMatch[1] : fname.replace(".png", "");
        const isActive = activeFiles.has(fname);
        // Check if this version is the active one by comparing to canonical
        const canonicalName = `${baseName}.png`;
        const isActiveVersion = !isActive && activeFiles.has(canonicalName);

        return {
          url: `/api/admin/studio/image/${fname}`,
          blobUrl: b.url,
          pathname: b.pathname,
          filename: fname,
          baseName,
          canonicalName,
          isActive,
          size: b.size,
          uploadedAt: b.uploadedAt,
        };
      })
      // Don't show canonical copies in the gallery (only versions)
      .filter((img) => /\d{13}/.test(img.filename))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return Response.json({ images, activeFiles: Array.from(activeFiles) });
  } catch (error) {
    console.error("[Studio] List error:", error);
    return Response.json({ images: [], activeFiles: [] });
  }
}

// PUT: Set a version as the active portrait (copy to canonical name)
export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  const { filename } = await request.json();
  if (!filename) {
    return Response.json({ error: "Kein Dateiname" }, { status: 400 });
  }

  try {
    // Find the blob
    const { blobs } = await list({ prefix: `studio/${filename}`, limit: 1 });
    if (blobs.length === 0) {
      return Response.json({ error: "Bild nicht gefunden" }, { status: 404 });
    }

    // Extract canonical name (remove timestamp)
    const baseMatch = filename.match(/^(.+)-\d{13}\.png$/);
    if (!baseMatch) {
      return Response.json({ error: "Ung\u00FCltiges Dateiformat" }, { status: 400 });
    }
    const canonicalName = `${baseMatch[1]}.png`;

    // Copy the version to the canonical name
    const result = await copy(blobs[0].url, `studio/${canonicalName}`, {
      access: "private",
      allowOverwrite: true,
    });

    console.log(`[Studio] Activated ${filename} → ${canonicalName} (${result.url})`);

    return Response.json({
      success: true,
      canonical: canonicalName,
      message: `${canonicalName} ist jetzt aktiv auf der Website!`,
    });
  } catch (error) {
    console.error("[Studio] Activate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Fehler" },
      { status: 500 },
    );
  }
}

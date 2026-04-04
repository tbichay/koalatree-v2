import { currentUser } from "@clerk/nextjs/server";
import { put, list, get } from "@vercel/blob";
import OpenAI from "openai";
import {
  buildPrompt,
  buildHeroCharPrompt,
  buildHeroFullPrompt,
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

// ── Helper: check if a filename is a canonical (non-versioned) name ──
function isCanonical(fname: string): boolean {
  return !(/\d{13}/.test(fname));
}

// ── Helper: extract base name from versioned filename ──
function getBaseName(fname: string): string {
  const m = fname.match(/^(.+)-\d{13}\.png$/);
  return m ? m[1] : fname.replace(".png", "");
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
    type?: "character" | "hero-bg" | "hero-char" | "hero-full";
  };

  // Validate inputs
  if (type === "hero-bg" || type === "hero-full") {
    // Generate hero background or full scene (no character selection needed)
  } else if (type === "hero-char") {
    if (!character || !CHARACTERS[character]) {
      return Response.json({ error: "Ung\u00FCltiger Charakter" }, { status: 400 });
    }
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

    const isHeroBg = type === "hero-bg";
    const isHeroChar = type === "hero-char";
    const isHeroFull = type === "hero-full";
    const usedPose = pose || "portrait";
    const usedScene = scene || (character ? CHARACTERS[character].defaultBackground as SceneKey : "golden");

    let prompt: string;
    if (isHeroFull) {
      prompt = buildHeroFullPrompt();
    } else if (isHeroBg) {
      prompt = HERO_BG_PROMPT;
    } else if (isHeroChar) {
      prompt = buildHeroCharPrompt(character!);
    } else {
      prompt = buildPrompt(character!, usedPose, usedScene);
    }

    const imgSize = (isHeroBg || isHeroFull) ? "1536x1024" : "1024x1024";

    // Unique filename with timestamp for versioning
    const ts = Date.now();
    let baseName: string;
    let blobPrefix: string;
    if (isHeroFull) {
      baseName = "hero-full";
      blobPrefix = "studio";
    } else if (isHeroBg) {
      baseName = "hero-background";
      blobPrefix = "studio";
    } else if (isHeroChar) {
      baseName = `hero-${character}`;
      blobPrefix = "studio/hero";
    } else {
      baseName = `${character}-${usedPose}`;
      blobPrefix = "studio";
    }
    const versionFilename = `${baseName}-${ts}.png`;

    console.log(`[Studio] Generating ${versionFilename} (type: ${type})...`);
    console.log(`[Studio] Prompt (${prompt.length} chars): ${prompt.slice(0, 200)}...`);

    // Build API params — hero-char gets transparent background
    const apiParams: Record<string, unknown> = {
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: imgSize,
      quality: "high",
    };
    if (isHeroChar) {
      apiParams.background = "transparent";
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.images.generate as any)(apiParams);

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      console.error("[Studio] No image data returned");
      return Response.json({ error: "Keine Bilddaten erhalten" }, { status: 500 });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.b64_json, "base64");
    console.log(`[Studio] Generated ${buffer.byteLength} bytes`);

    // Upload versioned file to Vercel Blob (private store)
    const blob = await put(`${blobPrefix}/${versionFilename}`, buffer, {
      access: "private",
      contentType: "image/png",
    });

    // For hero-char, also save as canonical (studio/hero/koda.png)
    if (isHeroChar) {
      await put(`studio/hero/${character}.png`, buffer, {
        access: "private",
        contentType: "image/png",
        allowOverwrite: true,
      });
    }

    // For hero-full, also save as canonical hero.png (immediately live on website)
    if (isHeroFull) {
      await put("studio/hero.png", buffer, {
        access: "private",
        contentType: "image/png",
        allowOverwrite: true,
      });
      console.log("[Studio] Hero-full saved as canonical hero.png");
    }

    console.log(`[Studio] Uploaded to: ${blob.url}`);

    // Return proxy URL
    const proxyPath = isHeroChar ? `hero/${versionFilename}` : versionFilename;
    const proxyUrl = `/api/admin/studio/image/${proxyPath}`;

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

    // Separate canonical (active) files from versioned files
    const canonicalSet = new Set<string>();
    for (const b of blobs) {
      const fname = b.pathname.replace("studio/", "");
      if (isCanonical(fname)) {
        canonicalSet.add(fname);
      }
    }

    // Only return versioned images (with timestamp) for the gallery
    // Canonical copies are hidden — they're just for serving on the website
    const images = blobs
      .filter((b) => !isCanonical(b.pathname.replace("studio/", "")))
      .map((b) => {
        const fname = b.pathname.replace("studio/", "");
        const baseName = getBaseName(fname);
        const canonicalName = `${baseName}.png`;

        return {
          url: `/api/admin/studio/image/${fname}`,
          filename: fname,
          baseName,
          canonicalName,
          isActive: canonicalSet.has(canonicalName),
          size: b.size,
          uploadedAt: b.uploadedAt,
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // Also include old images (without timestamp) that are NOT canonical copies
    // i.e., images uploaded before the versioning system
    const oldImages = blobs
      .filter((b) => {
        const fname = b.pathname.replace("studio/", "");
        // Canonical names that DON'T have a versioned counterpart are "old" images
        if (!isCanonical(fname)) return false;
        const baseName = fname.replace(".png", "");
        const hasVersioned = blobs.some((bb) => {
          const f = bb.pathname.replace("studio/", "");
          return f !== fname && getBaseName(f) === baseName;
        });
        // If there's no versioned image for this base, it's an old standalone image
        return !hasVersioned;
      })
      .map((b) => {
        const fname = b.pathname.replace("studio/", "");
        return {
          url: `/api/admin/studio/image/${fname}`,
          filename: fname,
          baseName: fname.replace(".png", ""),
          canonicalName: fname,
          isActive: true, // old images are always "active" (they're the canonical)
          size: b.size,
          uploadedAt: b.uploadedAt,
        };
      });

    const allImages = [...images, ...oldImages]
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return Response.json({
      images: allImages,
      activeFiles: Array.from(canonicalSet),
    });
  } catch (error) {
    console.error("[Studio] List error:", error);
    return Response.json({ images: [], activeFiles: [] });
  }
}

// PUT: Set a version as the active portrait
// Downloads the versioned image and re-uploads as canonical name
export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  const { filename } = await request.json();
  if (!filename) {
    return Response.json({ error: "Kein Dateiname" }, { status: 400 });
  }

  try {
    // Find the source blob
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

    // Download the versioned image
    const result = await get(blobs[0].url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json({ error: "Bild konnte nicht gelesen werden" }, { status: 500 });
    }

    // Read stream into buffer
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);

    // Re-upload as canonical name (overwrites previous active)
    const blob = await put(`studio/${canonicalName}`, buffer, {
      access: "private",
      contentType: "image/png",
      allowOverwrite: true,
    });

    console.log(`[Studio] Activated ${filename} → ${canonicalName} (${blob.url})`);

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

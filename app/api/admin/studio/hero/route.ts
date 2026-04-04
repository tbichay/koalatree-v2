import { currentUser } from "@clerk/nextjs/server";
import { put, list, get } from "@vercel/blob";
import sharp from "sharp";
import { CHARACTERS, type CharacterKey } from "@/lib/studio";

export const maxDuration = 60;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses.some(
    (e) => e.emailAddress.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
}

// ── Character positions on the hero (1536x1024) ──────────────────
// Each character is placed on a branch of the KoalaTree
const HERO_WIDTH = 1536;
const HERO_HEIGHT = 1024;
const PORTRAIT_SIZE = 200; // diameter of each circular portrait

interface CharPos {
  key: CharacterKey;
  x: number; // center X
  y: number; // center Y
  size: number;
  glowColor: string;
}

const CHARACTER_POSITIONS: CharPos[] = [
  { key: "koda",  x: 768,  y: 280,  size: 220, glowColor: "#a8d5b8" }, // top center — the wise one
  { key: "kiki",  x: 1100, y: 340,  size: 190, glowColor: "#e8c547" }, // upper right
  { key: "luna",  x: 440,  y: 320,  size: 190, glowColor: "#b8a0d5" }, // upper left
  { key: "mika",  x: 1150, y: 560,  size: 185, glowColor: "#d4884a" }, // middle right
  { key: "nuki",  x: 380,  y: 580,  size: 180, glowColor: "#f0b85a" }, // middle left
  { key: "pip",   x: 1050, y: 750,  size: 170, glowColor: "#6bb5c9" }, // lower right
  { key: "sage",  x: 500,  y: 740,  size: 175, glowColor: "#8a9e7a" }, // lower left
];

// ── Helper: download blob image as buffer ──────────────────────────
async function downloadBlob(prefix: string): Promise<Buffer | null> {
  try {
    const { blobs } = await list({ prefix, limit: 1 });
    if (blobs.length === 0) return null;
    const result = await get(blobs[0].url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;

    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

// ── Helper: create circular portrait with glow ────────────────────
async function createCircularPortrait(
  imageBuffer: Buffer,
  size: number,
  glowColor: string,
): Promise<Buffer> {
  const halfSize = Math.round(size / 2);
  const padding = 8; // glow padding
  const totalSize = size + padding * 2;
  const totalHalf = Math.round(totalSize / 2);

  // Resize portrait to fit in circle
  const resized = await sharp(imageBuffer)
    .resize(size, size, { fit: "cover" })
    .toBuffer();

  // Create circular mask
  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${halfSize}" cy="${halfSize}" r="${halfSize}" fill="white"/>
    </svg>`,
  );

  // Apply circular mask
  const circular = await sharp(resized)
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Create glow background
  const glowSvg = Buffer.from(
    `<svg width="${totalSize}" height="${totalSize}">
      <defs>
        <radialGradient id="glow">
          <stop offset="60%" stop-color="${glowColor}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${glowColor}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${totalHalf}" cy="${totalHalf}" r="${totalHalf}" fill="url(#glow)"/>
      <circle cx="${totalHalf}" cy="${totalHalf}" r="${halfSize + 2}" fill="none" stroke="${glowColor}" stroke-width="2" stroke-opacity="0.6"/>
    </svg>`,
  );

  // Composite: glow background + circular portrait
  const result = await sharp(glowSvg)
    .composite([{
      input: circular,
      left: padding,
      top: padding,
    }])
    .png()
    .toBuffer();

  return result;
}

// POST: Composite hero image from background + character portraits
export async function POST() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  try {
    // 1. Download hero background
    console.log("[Hero] Downloading background...");
    const bgBuffer = await downloadBlob("studio/hero-background.png");
    if (!bgBuffer) {
      return Response.json(
        { error: "Kein Hero-Hintergrund gefunden. Generiere zuerst einen im Studio (Typ: Hero-Hintergrund)." },
        { status: 400 },
      );
    }

    // 2. Download and process each character portrait
    console.log("[Hero] Processing character portraits...");
    const composites: sharp.OverlayOptions[] = [];
    const missing: string[] = [];

    for (const pos of CHARACTER_POSITIONS) {
      const charName = CHARACTERS[pos.key].name;

      // Try canonical name first, then any version
      let buffer = await downloadBlob(`studio/${pos.key}-portrait.png`);
      if (!buffer) {
        // Try versioned files
        const { blobs } = await list({ prefix: `studio/${pos.key}-portrait-` });
        if (blobs.length > 0) {
          // Use most recent version
          const sorted = blobs.sort(
            (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          );
          buffer = await downloadBlob(sorted[0].pathname);
        }
      }

      if (!buffer) {
        console.log(`[Hero] Missing portrait: ${charName}`);
        missing.push(charName);
        continue;
      }

      console.log(`[Hero] Processing ${charName}...`);
      const circularPortrait = await createCircularPortrait(
        buffer,
        pos.size,
        pos.glowColor,
      );

      const padding = 8;
      const totalSize = pos.size + padding * 2;
      composites.push({
        input: circularPortrait,
        left: Math.round(pos.x - totalSize / 2),
        top: Math.round(pos.y - totalSize / 2),
      });
    }

    if (composites.length === 0) {
      return Response.json(
        { error: "Keine Charakter-Portraits gefunden. Generiere zuerst Portraits im Studio." },
        { status: 400 },
      );
    }

    // 3. Resize background to hero dimensions and composite
    console.log(`[Hero] Compositing ${composites.length} characters onto background...`);
    const heroBuffer = await sharp(bgBuffer)
      .resize(HERO_WIDTH, HERO_HEIGHT, { fit: "cover" })
      .composite(composites)
      .png({ quality: 90 })
      .toBuffer();

    console.log(`[Hero] Generated hero: ${heroBuffer.byteLength} bytes`);

    // 4. Upload as hero.png (canonical name used by website)
    const ts = Date.now();
    // Save versioned copy
    await put(`studio/hero-${ts}.png`, heroBuffer, {
      access: "private",
      contentType: "image/png",
    });
    // Save as active hero
    const blob = await put("studio/hero.png", heroBuffer, {
      access: "private",
      contentType: "image/png",
      allowOverwrite: true,
    });

    console.log(`[Hero] Uploaded hero: ${blob.url}`);

    return Response.json({
      success: true,
      url: `/api/admin/studio/image/hero-${ts}.png`,
      filename: `hero-${ts}.png`,
      size: heroBuffer.byteLength,
      characters: CHARACTER_POSITIONS.length - missing.length,
      missing: missing.length > 0 ? missing : undefined,
      message: missing.length > 0
        ? `Hero erstellt mit ${CHARACTER_POSITIONS.length - missing.length}/7 Charakteren. Fehlend: ${missing.join(", ")}`
        : "Hero mit allen 7 Charakteren erstellt!",
    });
  } catch (error) {
    console.error("[Hero] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Fehler" },
      { status: 500 },
    );
  }
}

// GET: Check hero status
export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  // Check which portraits exist
  const status: Record<string, boolean> = {};
  for (const pos of CHARACTER_POSITIONS) {
    const buffer = await downloadBlob(`studio/${pos.key}-portrait.png`);
    if (!buffer) {
      // Check versioned
      const { blobs } = await list({ prefix: `studio/${pos.key}-portrait-` });
      status[pos.key] = blobs.length > 0;
    } else {
      status[pos.key] = true;
    }
  }

  const hasBg = !!(await downloadBlob("studio/hero-background.png"));
  const hasHero = !!(await downloadBlob("studio/hero.png"));

  return Response.json({
    background: hasBg,
    hero: hasHero,
    portraits: status,
    ready: hasBg && Object.values(status).every(Boolean),
  });
}

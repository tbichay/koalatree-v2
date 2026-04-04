import { auth } from "@/lib/auth";
import { put, list, get } from "@vercel/blob";
import sharp from "sharp";
import { CHARACTERS, HERO_POSITIONS, type CharacterKey } from "@/lib/studio";

export const maxDuration = 60;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";
const HERO_WIDTH = 1536;
const HERO_HEIGHT = 1024;

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.email) return false;
  return session.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

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

// ── Helper: create soft glow behind character ──────────────────────
function createGlowSvg(
  width: number,
  height: number,
  glowColor: string,
): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${glowColor}" stop-opacity="0.35"/>
          <stop offset="60%" stop-color="${glowColor}" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="${glowColor}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="url(#glow)"/>
    </svg>`,
  );
}

// ── Helper: create soft shadow from character silhouette ───────────
async function createShadow(
  charBuffer: Buffer,
  size: number,
): Promise<Buffer> {
  // Make character fully black (silhouette) with reduced opacity, then blur
  return sharp(charBuffer)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .modulate({ brightness: 0 }) // fully black
    .linear(1, 0) // keep alpha channel
    .blur(8) // soft shadow edge
    .png()
    .toBuffer();
}

// POST: Composite hero image from background + transparent character portraits
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

    // 2. Prepare composites — glows first, then shadows, then characters
    const glowComposites: sharp.OverlayOptions[] = [];
    const shadowComposites: sharp.OverlayOptions[] = [];
    const charComposites: sharp.OverlayOptions[] = [];
    const missing: string[] = [];

    for (const pos of HERO_POSITIONS) {
      const charName = CHARACTERS[pos.key].name;

      // Try hero-specific transparent version first
      let buffer = await downloadBlob(`studio/hero/${pos.key}.png`);
      if (!buffer) {
        console.log(`[Hero] No hero-char for ${charName}, trying portrait...`);
        // Fallback to regular portrait
        buffer = await downloadBlob(`studio/${pos.key}-portrait.png`);
      }
      if (!buffer) {
        // Try versioned portraits
        const { blobs } = await list({ prefix: `studio/${pos.key}-portrait-` });
        if (blobs.length > 0) {
          const sorted = blobs.sort(
            (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          );
          buffer = await downloadBlob(sorted[0].pathname);
        }
      }

      if (!buffer) {
        console.log(`[Hero] Missing: ${charName}`);
        missing.push(charName);
        continue;
      }

      console.log(`[Hero] Processing ${charName} (size: ${pos.size}px)...`);

      // Resize character, keeping transparency
      const resized = await sharp(buffer)
        .resize(pos.size, pos.size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        // Color grading: slightly reduce brightness and saturation for blue hour feel
        .modulate({ brightness: 0.92, saturation: 0.88 })
        .png()
        .toBuffer();

      const halfSize = Math.round(pos.size / 2);
      const left = Math.round(pos.x - halfSize);
      const top = Math.round(pos.y - halfSize);

      // Glow (behind character)
      const glowSize = Math.round(pos.size * 1.5);
      const glowHalf = Math.round(glowSize / 2);
      const glowSvg = createGlowSvg(glowSize, glowSize, pos.glowColor);
      const glowPng = await sharp(glowSvg).png().toBuffer();
      glowComposites.push({
        input: glowPng,
        left: Math.max(0, Math.round(pos.x - glowHalf)),
        top: Math.max(0, Math.round(pos.y - glowHalf)),
      });

      // Shadow (slightly offset below character)
      try {
        const shadow = await sharp(resized)
          .ensureAlpha()
          .modulate({ brightness: 0 })
          .blur(8)
          .png()
          .toBuffer();

        shadowComposites.push({
          input: shadow,
          left: left + 4,
          top: top + 6,
          blend: "multiply" as const,
        });
      } catch {
        // Shadow creation failed, skip it
      }

      // Character
      charComposites.push({
        input: resized,
        left: Math.max(0, left),
        top: Math.max(0, top),
      });
    }

    if (charComposites.length === 0) {
      return Response.json(
        { error: "Keine Charakter-Portraits gefunden. Generiere zuerst Hero-Charaktere oder Portraits im Studio." },
        { status: 400 },
      );
    }

    // 3. Composite everything in order: background → glows → shadows → characters
    console.log(`[Hero] Compositing ${charComposites.length} characters...`);
    const allComposites = [...glowComposites, ...shadowComposites, ...charComposites];

    const heroBuffer = await sharp(bgBuffer)
      .resize(HERO_WIDTH, HERO_HEIGHT, { fit: "cover" })
      .composite(allComposites)
      .png({ quality: 90 })
      .toBuffer();

    console.log(`[Hero] Generated hero: ${heroBuffer.byteLength} bytes`);

    // 4. Save versioned + canonical
    const ts = Date.now();
    await put(`studio/hero-${ts}.png`, heroBuffer, {
      access: "private",
      contentType: "image/png",
    });
    const blob = await put("studio/hero.png", heroBuffer, {
      access: "private",
      contentType: "image/png",
      allowOverwrite: true,
    });

    console.log(`[Hero] Uploaded: ${blob.url}`);

    return Response.json({
      success: true,
      url: `/api/admin/studio/image/hero-${ts}.png`,
      filename: `hero-${ts}.png`,
      size: heroBuffer.byteLength,
      characters: charComposites.length,
      missing: missing.length > 0 ? missing : undefined,
      message: missing.length > 0
        ? `Hero erstellt mit ${charComposites.length}/7 Charakteren. Fehlend: ${missing.join(", ")}`
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

// GET: Check hero status — which portraits/hero-chars exist
export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  const portraits: Record<string, boolean> = {};
  const heroChars: Record<string, boolean> = {};

  for (const pos of HERO_POSITIONS) {
    // Check hero-specific transparent version
    const heroChar = await downloadBlob(`studio/hero/${pos.key}.png`);
    heroChars[pos.key] = heroChar !== null;

    // Check regular portrait
    let hasPortrait = false;
    const portrait = await downloadBlob(`studio/${pos.key}-portrait.png`);
    if (portrait) {
      hasPortrait = true;
    } else {
      const { blobs } = await list({ prefix: `studio/${pos.key}-portrait-` });
      hasPortrait = blobs.length > 0;
    }
    portraits[pos.key] = hasPortrait;
  }

  const hasBg = (await downloadBlob("studio/hero-background.png")) !== null;
  const hasHero = (await downloadBlob("studio/hero.png")) !== null;

  // Ready when we have background + at least one character source per char
  const ready = hasBg && Object.keys(portraits).every(
    (k) => heroChars[k] || portraits[k],
  );

  return Response.json({
    background: hasBg,
    hero: hasHero,
    portraits,
    heroChars,
    ready,
  });
}

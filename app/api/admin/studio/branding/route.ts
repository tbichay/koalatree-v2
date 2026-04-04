import { auth } from "@/lib/auth";
import { put, list, get } from "@vercel/blob";
import OpenAI from "openai";
import sharp from "sharp";
import {
  BRANDING_FAVICON_PROMPT,
  buildBrandingLogoPrompt,
  FAVICON_ICON_SIZES,
  type BrandingIconSize,
} from "@/lib/studio";

export const maxDuration = 120;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.email) return false;
  return session.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// ── Helper: resize source to all icon sizes ────────────────────────

async function resizeToIcons(
  sourceBuffer: Buffer,
  sizes: BrandingIconSize[],
): Promise<{ filename: string; buffer: Buffer }[]> {
  const results: { filename: string; buffer: Buffer }[] = [];

  for (const size of sizes) {
    let buf: Buffer;

    if (size.maskable) {
      // Maskable icons need content in inner 80% (safe zone)
      // Resize source to 80% of target, then extend with padding
      const contentSize = Math.round(size.width * 0.8);
      const padding = Math.round((size.width - contentSize) / 2);

      const resized = await sharp(sourceBuffer)
        .resize(contentSize, contentSize, { fit: "contain", background: { r: 26, g: 46, b: 26, alpha: 1 } })
        .toBuffer();

      buf = await sharp(resized)
        .extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background: { r: 26, g: 46, b: 26, alpha: 1 }, // #1a2e1a
        })
        .resize(size.width, size.height) // ensure exact size after extend rounding
        .png()
        .toBuffer();
    } else {
      buf = await sharp(sourceBuffer)
        .resize(size.width, size.height, { fit: "contain", background: { r: 26, g: 46, b: 26, alpha: 1 } })
        .png()
        .toBuffer();
    }

    results.push({ filename: size.filename, buffer: buf });
  }

  return results;
}

// ── POST: Generate branding asset ──────────────────────────────────

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json(
      { error: "Nur der Admin kann Branding generieren" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { type } = body as { type?: "favicon" | "logo" };

  if (!type || !["favicon", "logo"].includes(type)) {
    return Response.json(
      { error: "Typ muss 'favicon' oder 'logo' sein" },
      { status: 400 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = type === "favicon"
      ? BRANDING_FAVICON_PROMPT
      : buildBrandingLogoPrompt();

    const ts = Date.now();

    console.log(`[Branding] Generating ${type} source...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.images.generate as any)({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "high",
    });

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      return Response.json(
        { error: "Keine Bilddaten erhalten" },
        { status: 500 },
      );
    }

    const sourceBuffer = Buffer.from(imageData.b64_json, "base64");
    console.log(`[Branding] Generated source: ${sourceBuffer.byteLength} bytes`);

    // Store versioned source
    const sourceFilename = `${type}-${ts}.png`;
    await put(`studio/branding-source/${sourceFilename}`, sourceBuffer, {
      access: "private",
      contentType: "image/png",
    });

    // Store canonical source (for re-deriving sizes later)
    await put(`studio/branding-source/${type}.png`, sourceBuffer, {
      access: "private",
      contentType: "image/png",
      allowOverwrite: true,
    });

    // Resize and store all icon sizes
    if (type === "favicon") {
      const icons = await resizeToIcons(sourceBuffer, FAVICON_ICON_SIZES);
      for (const icon of icons) {
        await put(`studio/icons/${icon.filename}`, icon.buffer, {
          access: "private",
          contentType: "image/png",
          allowOverwrite: true,
        });
        console.log(`[Branding] Saved ${icon.filename} (${icon.buffer.byteLength} bytes)`);
      }
    } else {
      // Logo: store as logo.png at 1024x1024
      await put("studio/icons/logo.png", sourceBuffer, {
        access: "private",
        contentType: "image/png",
        allowOverwrite: true,
      });
      console.log(`[Branding] Saved logo.png (${sourceBuffer.byteLength} bytes)`);
    }

    // Return preview URL (via admin studio image proxy)
    const proxyUrl = `/api/admin/studio/image/branding-source/${sourceFilename}`;

    return Response.json({
      success: true,
      type,
      url: proxyUrl,
      sourceFilename,
      size: sourceBuffer.byteLength,
      prompt,
      icons: type === "favicon"
        ? FAVICON_ICON_SIZES.map((s) => s.filename)
        : ["logo.png"],
    });
  } catch (error) {
    console.error("[Branding] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ── GET: Return branding status ────────────────────────────────────

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  try {
    // Check which icons exist in Blob
    const { blobs: iconBlobs } = await list({ prefix: "studio/icons/" });
    const activeIcons = iconBlobs.map((b) =>
      b.pathname.replace("studio/icons/", ""),
    );

    // Check source versions
    const { blobs: sourceBlobs } = await list({
      prefix: "studio/branding-source/",
    });

    const faviconVersions = sourceBlobs
      .filter((b) => b.pathname.includes("favicon-") && /\d{13}/.test(b.pathname))
      .map((b) => ({
        filename: b.pathname.replace("studio/branding-source/", ""),
        url: `/api/admin/studio/image/branding-source/${b.pathname.replace("studio/branding-source/", "")}`,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    const logoVersions = sourceBlobs
      .filter((b) => b.pathname.includes("logo-") && /\d{13}/.test(b.pathname))
      .map((b) => ({
        filename: b.pathname.replace("studio/branding-source/", ""),
        url: `/api/admin/studio/image/branding-source/${b.pathname.replace("studio/branding-source/", "")}`,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return Response.json({
      activeIcons,
      faviconVersions,
      logoVersions,
      hasFavicon: activeIcons.includes("favicon-32.png"),
      hasLogo: activeIcons.includes("logo.png"),
    });
  } catch (error) {
    console.error("[Branding] Status error:", error);
    return Response.json({
      activeIcons: [],
      faviconVersions: [],
      logoVersions: [],
      hasFavicon: false,
      hasLogo: false,
    });
  }
}

// ── PUT: Activate a specific version ───────────────────────────────

export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Nur Admin" }, { status: 403 });
  }

  const { filename } = await request.json();
  if (!filename) {
    return Response.json({ error: "Kein Dateiname" }, { status: 400 });
  }

  // Determine type from filename
  const isFavicon = filename.startsWith("favicon-") && /\d{13}/.test(filename);
  const isLogo = filename.startsWith("logo-") && /\d{13}/.test(filename);

  if (!isFavicon && !isLogo) {
    return Response.json(
      { error: "Ungültiges Dateiformat" },
      { status: 400 },
    );
  }

  try {
    // Find and download the source
    const blobPath = `studio/branding-source/${filename}`;
    const { blobs } = await list({ prefix: blobPath, limit: 1 });
    if (blobs.length === 0) {
      return Response.json({ error: "Bild nicht gefunden" }, { status: 404 });
    }

    const result = await get(blobs[0].url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json(
        { error: "Bild konnte nicht gelesen werden" },
        { status: 500 },
      );
    }

    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const sourceBuffer = Buffer.concat(chunks);

    if (isFavicon) {
      // Re-derive all icon sizes
      const icons = await resizeToIcons(sourceBuffer, FAVICON_ICON_SIZES);
      for (const icon of icons) {
        await put(`studio/icons/${icon.filename}`, icon.buffer, {
          access: "private",
          contentType: "image/png",
          allowOverwrite: true,
        });
      }

      // Update canonical source
      await put("studio/branding-source/favicon.png", sourceBuffer, {
        access: "private",
        contentType: "image/png",
        allowOverwrite: true,
      });
    } else {
      // Logo
      await put("studio/icons/logo.png", sourceBuffer, {
        access: "private",
        contentType: "image/png",
        allowOverwrite: true,
      });

      await put("studio/branding-source/logo.png", sourceBuffer, {
        access: "private",
        contentType: "image/png",
        allowOverwrite: true,
      });
    }

    return Response.json({
      success: true,
      message: isFavicon
        ? "Favicon & App-Icons sind jetzt live!"
        : "Logo ist jetzt live!",
    });
  } catch (error) {
    console.error("[Branding] Activate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Fehler" },
      { status: 500 },
    );
  }
}

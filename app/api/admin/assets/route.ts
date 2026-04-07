import { auth } from "@/lib/auth";
import { list } from "@vercel/blob";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

interface Asset {
  name: string;
  path: string;
  type: "image" | "video" | "audio";
  category: "portrait" | "landscape" | "marketing-video" | "film-scene" | "help-clip" | "audio" | "background" | "branding";
  size: number;
  url: string;
  uploadedAt: string;
}

// GET: List all assets from Vercel Blob
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const assets: Asset[] = [];

  // Search all known blob prefixes
  const prefixes = [
    { prefix: "images/", category: "portrait" as const, type: "image" as const },
    { prefix: "studio/", category: "portrait" as const, type: "image" as const },
    { prefix: "studio/hero/", category: "background" as const, type: "image" as const },
    { prefix: "studio/branding-source/", category: "branding" as const, type: "image" as const },
    { prefix: "marketing-videos/", category: "marketing-video" as const, type: "video" as const },
    { prefix: "help-clips/", category: "help-clip" as const, type: "audio" as const },
    { prefix: "audio/onboarding", category: "audio" as const, type: "audio" as const },
  ];

  for (const { prefix, category, type } of prefixes) {
    try {
      const { blobs } = await list({ prefix, limit: 100 });
      for (const blob of blobs) {
        const fileName = blob.pathname.split("/").pop() || blob.pathname;
        const ext = fileName.split(".").pop()?.toLowerCase() || "";

        // Determine actual type from extension
        let assetType = type;
        if (["mp4", "webm", "mov"].includes(ext)) assetType = "video";
        else if (["mp3", "wav", "ogg"].includes(ext)) assetType = "audio";
        else if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) assetType = "image";
        else if (ext === "json") continue; // Skip JSON files

        // Determine URL
        let url = "";
        if (category === "portrait" && prefix === "images/") {
          url = `/api/images/${fileName}`;
        } else if (category === "portrait" && prefix === "studio/") {
          url = `/api/images/${fileName}`;
        } else if (category === "marketing-video") {
          url = `/api/video/marketing/${fileName.replace(".mp4", "")}`;
        } else if (category === "help-clip") {
          url = `/api/audio/help/${fileName.replace(".mp3", "")}`;
        } else if (category === "audio") {
          url = "/api/audio/onboarding";
        } else {
          url = blob.downloadUrl || "";
        }

        assets.push({
          name: fileName,
          path: blob.pathname,
          type: assetType,
          category,
          size: blob.size,
          url,
          uploadedAt: blob.uploadedAt?.toISOString() || "",
        });
      }
    } catch {
      // Skip prefixes that fail
    }
  }

  // Also list film scenes across all projects
  try {
    const { blobs } = await list({ prefix: "films/", limit: 200 });
    for (const blob of blobs) {
      if (!blob.pathname.endsWith(".mp4")) continue;
      const parts = blob.pathname.split("/");
      const fileName = parts.pop() || "";
      const geschichteId = parts[1] || "";

      assets.push({
        name: fileName,
        path: blob.pathname,
        type: "video",
        category: "film-scene",
        size: blob.size,
        url: `/api/video/film-scene/${geschichteId}/${fileName.replace("scene-", "").replace(".mp4", "")}`,
        uploadedAt: blob.uploadedAt?.toISOString() || "",
      });
    }
  } catch { /* skip */ }

  // Group by category
  const grouped: Record<string, Asset[]> = {};
  for (const asset of assets) {
    if (!grouped[asset.category]) grouped[asset.category] = [];
    grouped[asset.category].push(asset);
  }

  return Response.json({
    assets,
    grouped,
    stats: {
      total: assets.length,
      images: assets.filter((a) => a.type === "image").length,
      videos: assets.filter((a) => a.type === "video").length,
      audio: assets.filter((a) => a.type === "audio").length,
      totalSize: assets.reduce((s, a) => s + a.size, 0),
    },
  });
}

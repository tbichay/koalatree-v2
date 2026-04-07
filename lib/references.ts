/**
 * KoalaTree Reference Image System
 *
 * Manages multi-reference images per character/asset for consistent generation.
 * Supports legacy single-string format and new multi-image format.
 *
 * Storage: PostgreSQL (StudioSettings model) for immediate read-after-write
 * consistency. Previously used Vercel Blob which had eventual consistency
 * issues causing references to overwrite each other.
 */

import { list, get } from "@vercel/blob";
import { prisma } from "./db";

// Legacy blob path — only used for one-time migration
const LEGACY_REFS_PATH = "studio/references.json";

// ── Types ──────────────────────────────────────────────────────────

export interface ReferenceImage {
  path: string;
  label: string;
  role: "primary" | "side" | "expression" | "pose" | "detail";
}

export interface ReferenceEntry {
  primary: string;
  images: ReferenceImage[];
}

/** Legacy format: plain string. New format: ReferenceEntry object. */
type RawRefValue = string | ReferenceEntry;

export type ReferencesMap = Record<string, ReferenceEntry>;
type RawReferencesMap = Record<string, RawRefValue>;

// ── Auto-Migration ─────────────────────────────────────────────────

function migrateValue(raw: RawRefValue): ReferenceEntry {
  if (typeof raw === "string") {
    return {
      primary: raw,
      images: [{ path: raw, label: "Standard", role: "primary" }],
    };
  }
  return raw;
}

function migrateAll(raw: RawReferencesMap): ReferencesMap {
  const result: ReferencesMap = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = migrateValue(value);
  }
  return result;
}

// ── Legacy Blob Migration ─────────────────────────────────────────

async function loadLegacyFromBlob(): Promise<ReferencesMap> {
  try {
    const { blobs } = await list({ prefix: LEGACY_REFS_PATH, limit: 1 });
    if (blobs.length === 0) return {};
    const url = blobs[0].downloadUrl;
    if (!url) return {};
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};
    const raw: RawReferencesMap = await res.json();
    return migrateAll(raw);
  } catch {
    return {};
  }
}

// ── Load / Save (PostgreSQL) ──────────────────────────────────────

export async function loadReferences(): Promise<ReferencesMap> {
  try {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "default" },
    });

    if (settings) {
      const raw = settings.references as RawReferencesMap;
      return migrateAll(raw);
    }

    // First time: try to migrate from legacy Blob storage
    const legacy = await loadLegacyFromBlob();
    if (Object.keys(legacy).length > 0) {
      console.log(`[References] Migrating ${Object.keys(legacy).length} entries from Blob to DB`);
      await saveReferences(legacy);
      return legacy;
    }

    return {};
  } catch (err) {
    console.error("[References] Load error:", err);
    return {};
  }
}

export async function saveReferences(refs: ReferencesMap): Promise<void> {
  await prisma.studioSettings.upsert({
    where: { id: "default" },
    update: { references: JSON.parse(JSON.stringify(refs)) },
    create: { id: "default", references: JSON.parse(JSON.stringify(refs)) },
  });
}

// ── Reference Image Loading ────────────────────────────────────────

async function loadBufferFromBlob(blobPath: string): Promise<Buffer> {
  const { blobs } = await list({ prefix: blobPath, limit: 1 });
  if (blobs.length === 0) throw new Error(`Blob not found: ${blobPath}`);
  const result = await get(blobs[0].url, { access: "private" });
  if (!result?.stream) throw new Error(`Could not stream: ${blobPath}`);
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Load all reference image buffers for a character.
 * Returns primary first, then additional references.
 * Falls back to images/{characterId}-portrait.png if no references set.
 * Max `limit` images returned (default 3 — API limit for Kling IR2V).
 */
export async function loadCharacterReferences(
  characterId: string,
  limit = 3,
): Promise<Buffer[]> {
  const refs = await loadReferences();
  const entry = refs[`portrait:${characterId}`];

  if (entry && entry.images.length > 0) {
    // Sort: primary first, then by array order
    const sorted = [...entry.images].sort((a, b) => {
      if (a.path === entry.primary) return -1;
      if (b.path === entry.primary) return 1;
      return 0;
    });

    const buffers: Buffer[] = [];
    for (const img of sorted.slice(0, limit)) {
      try {
        buffers.push(await loadBufferFromBlob(img.path));
      } catch (err) {
        console.warn(`[References] Could not load ${img.path}:`, err);
      }
    }
    if (buffers.length > 0) return buffers;
  }

  // Fallback: load canonical portrait
  const filename = `${characterId}-portrait.png`;
  try {
    return [await loadBufferFromBlob(`images/${filename}`)];
  } catch {
    // Last resort: fetch via HTTP
    const baseUrl = process.env.AUTH_URL || "https://www.koalatree.ai";
    const res = await fetch(`${baseUrl}/api/images/${filename}`);
    if (!res.ok) throw new Error(`Portrait not found: ${characterId}`);
    return [Buffer.from(await res.arrayBuffer())];
  }
}

// ── Reference Management Actions ───────────────────────────────────

export type RefAction = "add" | "remove" | "primary" | "set" | "clear";

export interface RefUpdateParams {
  refKey: string;
  assetPath: string | null;
  action?: RefAction;
  label?: string;
  role?: ReferenceImage["role"];
}

export async function updateReference(params: RefUpdateParams): Promise<ReferencesMap> {
  const { refKey, assetPath, action, label, role } = params;
  const refs = await loadReferences();

  // Clear entire reference
  if (assetPath === null) {
    delete refs[refKey];
    await saveReferences(refs);
    return refs;
  }

  const existing = refs[refKey];

  switch (action) {
    case "add": {
      const newImage: ReferenceImage = {
        path: assetPath,
        label: label || "Referenz",
        role: role || "primary",
      };
      if (existing) {
        // Don't add duplicates
        if (!existing.images.some((img) => img.path === assetPath)) {
          existing.images.push(newImage);
        }
      } else {
        refs[refKey] = {
          primary: assetPath,
          images: [{ ...newImage, role: "primary" }],
        };
      }
      break;
    }

    case "remove": {
      if (existing) {
        existing.images = existing.images.filter((img) => img.path !== assetPath);
        if (existing.images.length === 0) {
          delete refs[refKey];
        } else if (existing.primary === assetPath) {
          // Promote first remaining image to primary
          existing.primary = existing.images[0].path;
          existing.images[0].role = "primary";
        }
      }
      break;
    }

    case "primary": {
      if (existing) {
        existing.primary = assetPath;
        // Update roles
        for (const img of existing.images) {
          if (img.path === assetPath) {
            img.role = "primary";
          } else if (img.role === "primary") {
            img.role = "expression";
          }
        }
        // Add if not in set
        if (!existing.images.some((img) => img.path === assetPath)) {
          existing.images.unshift({
            path: assetPath,
            label: label || "Primary",
            role: "primary",
          });
        }
      } else {
        refs[refKey] = {
          primary: assetPath,
          images: [{ path: assetPath, label: label || "Primary", role: "primary" }],
        };
      }
      break;
    }

    default: {
      // Legacy "set" behavior: single image, replaces everything
      refs[refKey] = {
        primary: assetPath,
        images: [{ path: assetPath, label: label || "Standard", role: "primary" }],
      };
      break;
    }
  }

  await saveReferences(refs);
  return refs;
}

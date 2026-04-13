/**
 * KoalaTree Asset Library
 *
 * Unified CRUD for all media assets (portraits, landscapes, clips, sounds).
 * Every generated asset records provenance: which prompt blocks + model produced it.
 *
 * Replaces the fragmented storage across StudioSettings, StudioSequence fields,
 * and inline ClipVersion arrays with a single queryable model.
 */

import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";

// ── Types ────────────────────────────────────────────────────────

export type AssetType = "portrait" | "landscape" | "clip" | "sound" | "reference";

export interface AssetProvenance {
  blocks?: Record<string, number>; // { "visual:disney-2d": 1, "atmosphere:golden-hour": 1 }
  model: string;                   // "gpt-image-1", "kling-avatar-v2-standard"
  prompt?: string;                 // The actual prompt text used
  input?: Record<string, unknown>; // Additional input params
}

export interface CreateAssetOpts {
  type: AssetType;
  name?: string;                 // Display name (e.g. "Verzauberter Wald")
  category?: string;             // "character:koda", "location:forest"
  tags?: string[];
  buffer: Buffer;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSec?: number;
  generatedBy?: AssetProvenance;
  modelId?: string;
  costCents?: number;
  projectId?: string;
  userId: string;
  parentId?: string;             // For versioning
}

export interface AssetFilter {
  type?: AssetType;
  category?: string;
  tags?: string[];
  projectId?: string;
  userId?: string;
  isPrimary?: boolean;
  modelId?: string;
  limit?: number;
  offset?: number;
}

// ── Create ───────────────────────────────────────────────────────

/**
 * Upload a buffer to Vercel Blob and create an Asset record.
 */
export async function createAsset(opts: CreateAssetOpts) {
  // Determine blob path
  const projectPart = opts.projectId ? `projects/${opts.projectId}` : "global";
  const blobPath = `studio/${projectPart}/assets/${opts.type}/${opts.filename}`;

  // Upload to Blob
  const blob = await put(blobPath, opts.buffer, {
    access: "private",
    contentType: opts.mimeType,
  });

  // Determine version
  let version = 1;
  if (opts.parentId) {
    const parent = await prisma.asset.findUnique({ where: { id: opts.parentId }, select: { version: true } });
    version = (parent?.version || 0) + 1;
  }

  // Create record
  const asset = await prisma.asset.create({
    data: {
      type: opts.type,
      name: opts.name,
      category: opts.category,
      tags: opts.tags || [],
      blobUrl: blob.url,
      blobPath,
      mimeType: opts.mimeType,
      sizeBytes: opts.buffer.byteLength,
      width: opts.width,
      height: opts.height,
      durationSec: opts.durationSec,
      generatedBy: opts.generatedBy ? JSON.parse(JSON.stringify(opts.generatedBy)) : undefined,
      modelId: opts.modelId,
      costCents: opts.costCents,
      parentId: opts.parentId,
      version,
      isPrimary: true, // New assets are primary by default
      projectId: opts.projectId,
      userId: opts.userId,
    },
  });

  // If this is a new version, un-primary the old one
  if (opts.parentId) {
    await prisma.asset.update({
      where: { id: opts.parentId },
      data: { isPrimary: false },
    });
  }

  return asset;
}

// ── Read ─────────────────────────────────────────────────────────

/**
 * Get assets with optional filtering.
 */
export async function getAssets(filter: AssetFilter = {}) {
  return prisma.asset.findMany({
    where: {
      ...(filter.type && { type: filter.type }),
      ...(filter.category && { category: filter.category }),
      ...(filter.tags && filter.tags.length > 0 && { tags: { hasSome: filter.tags } }),
      ...(filter.projectId && { projectId: filter.projectId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.isPrimary !== undefined && { isPrimary: filter.isPrimary }),
      ...(filter.modelId && { modelId: filter.modelId }),
    },
    orderBy: { createdAt: "desc" },
    take: filter.limit || 50,
    skip: filter.offset || 0,
  });
}

/**
 * Get a single asset by ID.
 */
export async function getAsset(id: string) {
  return prisma.asset.findUnique({ where: { id } });
}

/**
 * Get all versions of an asset (by following parentId chain or same category).
 */
export async function getAssetVersions(assetId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return [];

  // Find all assets in the same category + project with same type
  return prisma.asset.findMany({
    where: {
      type: asset.type,
      category: asset.category,
      projectId: asset.projectId,
      userId: asset.userId,
    },
    orderBy: { version: "desc" },
  });
}

// ── Update ───────────────────────────────────────────────────────

/**
 * Set an asset as the primary version (un-primaries siblings).
 */
export async function setPrimaryAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("Asset nicht gefunden");

  // Un-primary all siblings
  await prisma.asset.updateMany({
    where: {
      type: asset.type,
      category: asset.category,
      projectId: asset.projectId,
      userId: asset.userId,
      isPrimary: true,
    },
    data: { isPrimary: false },
  });

  // Set this one as primary
  return prisma.asset.update({
    where: { id: assetId },
    data: { isPrimary: true },
  });
}

/**
 * Update asset tags or category.
 */
export async function updateAsset(id: string, data: { name?: string; tags?: string[]; category?: string; isPrimary?: boolean }) {
  return prisma.asset.update({ where: { id }, data });
}

// ── Delete ───────────────────────────────────────────────────────

/**
 * Delete an asset (keeps blob for now — Vercel Blob has no single-file delete).
 */
export async function deleteAsset(id: string) {
  return prisma.asset.delete({ where: { id } });
}

// ── Asset Counts ─────────────────────────────────────────────────

/**
 * Get counts per type for a project or user.
 */
export async function getAssetCounts(filter: { projectId?: string; userId?: string }) {
  const where = {
    ...(filter.projectId && { projectId: filter.projectId }),
    ...(filter.userId && { userId: filter.userId }),
  };

  const counts = await prisma.asset.groupBy({
    by: ["type"],
    where,
    _count: true,
  });

  return Object.fromEntries(counts.map((c) => [c.type, c._count]));
}

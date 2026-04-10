/**
 * KoalaTree Model Adapter System
 *
 * Provides a unified interface for selecting and using AI models.
 * Replaces hardcoded if/else chains with a registry-based approach.
 *
 * Usage:
 *   const model = await selectModel("video-lipsync", "standard");
 *   const cost = model.estimateCost({ durationSec: 5 });
 *   const result = await model.generate(input);
 */

import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────

export interface ModelInput {
  /** For video: image buffer */
  imageBuffer?: Buffer;
  /** For video dialog: audio buffer */
  audioBuffer?: Buffer;
  /** Text prompt for generation */
  prompt?: string;
  /** Duration in seconds (video/audio) */
  durationSec?: number;
  /** Quality level */
  quality?: "standard" | "premium";
  /** Additional provider-specific params */
  params?: Record<string, unknown>;
}

export interface ModelOutput {
  /** URL of generated content */
  url: string;
  /** Buffer if available */
  buffer?: Buffer;
  /** Actual cost in cents */
  costCents: number;
  /** Provider model ID */
  modelId: string;
  /** Duration of output (video/audio) */
  durationSec?: number;
}

export interface ModelInfo {
  id: string;
  provider: string;
  category: string;
  name: string;
  costUnit: string;
  costAmount: number;
  capabilities: Record<string, unknown>;
  isDefault: boolean;
}

// ── Model Selection ──────────────────────────────────────────────

/**
 * Select the best model for a category + quality level.
 * Uses the AIModel registry in the database.
 */
export async function selectModelInfo(
  category: string,
  quality: "standard" | "premium" = "standard",
): Promise<ModelInfo | null> {
  // For premium, try to find a premium model first (higher cost = premium)
  const models = await prisma.aIModel.findMany({
    where: { category, isActive: true },
    orderBy: { costAmount: quality === "premium" ? "desc" : "asc" },
  });

  if (models.length === 0) return null;

  // Prefer default, then cheapest (standard) or most expensive (premium)
  const defaultModel = models.find((m) => m.isDefault);
  const selected = quality === "standard"
    ? (defaultModel || models[0]) // Default or cheapest
    : (models[0]); // Most expensive for premium

  return {
    id: selected.id,
    provider: selected.provider,
    category: selected.category,
    name: selected.name,
    costUnit: selected.costUnit,
    costAmount: selected.costAmount,
    capabilities: selected.capabilities as Record<string, unknown>,
    isDefault: selected.isDefault,
  };
}

/**
 * Estimate cost for a generation based on the model's pricing.
 */
export function estimateCost(model: ModelInfo, input: { durationSec?: number; characters?: number; images?: number }): number {
  switch (model.costUnit) {
    case "per-second":
      return Math.ceil((input.durationSec || 5) * model.costAmount * 100); // cents
    case "per-image":
      return Math.ceil((input.images || 1) * model.costAmount * 100);
    case "per-1k-tokens":
      return Math.ceil(((input.characters || 1000) / 1000) * model.costAmount * 100);
    case "per-character":
      return Math.ceil((input.characters || 100) * model.costAmount * 100);
    default:
      return 0;
  }
}

/**
 * List all active models, optionally filtered by category.
 */
export async function listModels(category?: string): Promise<ModelInfo[]> {
  const models = await prisma.aIModel.findMany({
    where: { isActive: true, ...(category && { category }) },
    orderBy: [{ category: "asc" }, { costAmount: "asc" }],
  });

  return models.map((m) => ({
    id: m.id,
    provider: m.provider,
    category: m.category,
    name: m.name,
    costUnit: m.costUnit,
    costAmount: m.costAmount,
    capabilities: m.capabilities as Record<string, unknown>,
    isDefault: m.isDefault,
  }));
}

/**
 * Update model pricing (for the monitoring agent).
 */
export async function updateModelPricing(modelId: string, costAmount: number) {
  return prisma.aIModel.update({
    where: { id: modelId },
    data: { costAmount, lastChecked: new Date() },
  });
}

/**
 * Get model categories with their default models.
 */
export async function getModelCategories(): Promise<Record<string, ModelInfo>> {
  const defaults = await prisma.aIModel.findMany({
    where: { isActive: true, isDefault: true },
  });

  const result: Record<string, ModelInfo> = {};
  for (const m of defaults) {
    result[m.category] = {
      id: m.id,
      provider: m.provider,
      category: m.category,
      name: m.name,
      costUnit: m.costUnit,
      costAmount: m.costAmount,
      capabilities: m.capabilities as Record<string, unknown>,
      isDefault: true,
    };
  }

  return result;
}

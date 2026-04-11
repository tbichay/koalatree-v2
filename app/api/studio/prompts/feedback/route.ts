/**
 * Prompt Feedback API — View quality feedback and patterns
 *
 * GET: List recent feedback with optional pattern analysis
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const blockSlug = searchParams.get("blockSlug");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const where: Record<string, unknown> = {};
  if (blockSlug) where.blockSlug = blockSlug;

  const feedbacks = await prisma.promptFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  // Pattern analysis if blockSlug provided
  let patterns = null;
  if (blockSlug) {
    try {
      const { analyzePromptPatterns } = await import("@/lib/studio/prompt-tuner");
      patterns = await analyzePromptPatterns(blockSlug);
    } catch { /* */ }
  }

  // Aggregate stats
  const stats = {
    total: feedbacks.length,
    avgScore: feedbacks.length > 0
      ? Math.round(feedbacks.reduce((sum, f) => sum + f.qualityScore, 0) / feedbacks.length)
      : 0,
    improved: feedbacks.filter((f) => f.improvedPrompt).length,
    lowQuality: feedbacks.filter((f) => f.qualityScore < 40).length,
  };

  return Response.json({ feedbacks, patterns, stats });
}

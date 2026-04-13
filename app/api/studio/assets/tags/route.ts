/**
 * Asset Tags API — Get all unique tags used across assets
 *
 * GET: Returns all unique tags, grouped by prefix (typ:, material:, farbe:, stil:, etc.)
 *
 * Used for autocomplete when creating/editing assets.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Get all assets for this user and collect unique tags
  const assets = await prisma.asset.findMany({
    where: { userId: session.user.id },
    select: { tags: true },
  });

  const tagCounts = new Map<string, number>();
  for (const asset of assets) {
    for (const tag of asset.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // Group by prefix (before ":")
  const grouped: Record<string, Array<{ tag: string; count: number }>> = {};
  const ungrouped: Array<{ tag: string; count: number }> = [];

  for (const [tag, count] of tagCounts) {
    const colonIdx = tag.indexOf(":");
    if (colonIdx > 0) {
      const prefix = tag.slice(0, colonIdx);
      if (!grouped[prefix]) grouped[prefix] = [];
      grouped[prefix].push({ tag, count });
    } else {
      ungrouped.push({ tag, count });
    }
  }

  // Sort each group by count (most used first)
  for (const prefix of Object.keys(grouped)) {
    grouped[prefix].sort((a, b) => b.count - a.count);
  }
  ungrouped.sort((a, b) => b.count - a.count);

  // All tags flat (for autocomplete)
  const allTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  return Response.json({ tags: allTags, grouped, ungrouped });
}

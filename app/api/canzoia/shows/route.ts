/**
 * Canzoia API — GET /api/canzoia/shows
 *
 * Per docs/CANZOIA_API.md §4.1. Lists published shows for the consumer
 * catalog. Draft shows (publishedAt=null) never appear here.
 *
 * Query params (all optional):
 *   - category    — filter by category string
 *   - limit       — page size 1..100 (default 50)
 *   - cursor      — opaque pagination cursor from previous response
 *
 * Response: { shows: ShowManifest[], nextCursor?: string }
 *
 * Auth: HMAC via CANZOIA_TO_KOALATREE_SECRET (see lib/canzoia/signing.ts).
 *
 * Cursor encoding: base64url of JSON { publishedAt: ISO, id: string } — stable
 * across deploys and opaque to clients. We paginate by (publishedAt DESC, id
 * DESC) so the cursor is a unique deterministic anchor.
 */

import { prisma } from "@/lib/db";
import { verifyCanzoiaRequest } from "@/lib/canzoia/signing";
import { canzoiaError } from "@/lib/canzoia/errors";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type Cursor = { publishedAt: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}
function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Cursor;
    if (typeof parsed.publishedAt !== "string" || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = verifyCanzoiaRequest(request, "");
  if (!auth.ok) return canzoiaError("UNAUTHORIZED", auth.message);

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const limitRaw = searchParams.get("limit");
  const cursorRaw = searchParams.get("cursor");

  const limit = (() => {
    if (!limitRaw) return DEFAULT_LIMIT;
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) return DEFAULT_LIMIT;
    return n;
  })();

  const cursor = decodeCursor(cursorRaw);

  // Fetch limit+1 so we know whether there's a next page.
  //
  // Readiness-Filter: neben `publishedAt` verlangen wir auch mind.
  // einen Cast-Actor und mind. einen aktiven Fokus. Ohne diese Felder
  // wuerde der Generator fuer die Show 503en (SHOW_DEGRADED) — dann
  // lieber die Show temporaer aus dem Katalog nehmen statt dem Kid
  // einen kaputten "Generieren"-Button zu zeigen.
  //
  // Nicht perfekt: invalide castRoles-JSON wird hier nicht gepraegt
  // und kommt erst im Generate-Call zum Vorschein. Fuer den
  // Haupt-Fall (letzter Actor geloescht, alle Foki deaktiviert)
  // reichen diese zwei DB-Level-Checks.
  const shows = await prisma.show.findMany({
    where: {
      publishedAt: { not: null },
      cast: { some: {} },
      foki: { some: { enabled: true } },
      ...(category && { category }),
      ...(cursor && {
        OR: [
          { publishedAt: { lt: new Date(cursor.publishedAt) } },
          {
            publishedAt: new Date(cursor.publishedAt),
            id: { lt: cursor.id },
          },
        ],
      }),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      category: true,
      ageBand: true,
      coverUrl: true,
      trailerAudioUrl: true,
      palette: true,
      publishedAt: true,
      revisionHash: true,
      featuredShowFokusId: true,
      _count: { select: { foki: { where: { enabled: true } } } },
    },
  });

  const hasMore = shows.length > limit;
  const page = hasMore ? shows.slice(0, limit) : shows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last?.publishedAt
    ? encodeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
    : undefined;

  return Response.json({
    shows: page.map((s) => ({
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle,
      description: s.description,
      category: s.category,
      ageBand: s.ageBand,
      coverUrl: s.coverUrl,
      trailerAudioUrl: s.trailerAudioUrl,
      palette: s.palette,
      publishedAt: s.publishedAt,
      revisionHash: s.revisionHash,
      featuredShowFokusId: s.featuredShowFokusId,
      fokiCount: s._count.foki,
    })),
    ...(nextCursor && { nextCursor }),
  });
}

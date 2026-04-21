/**
 * Canzoia API — GET /api/canzoia/shows/[slug]
 *
 * Per docs/CANZOIA_API.md §4.2. Fetches the full manifest for a single
 * published show. Canzoia uses this to refresh one show after a
 * `show.updated` webhook without refetching the whole page.
 *
 * Response: ShowManifest
 * Errors: SHOW_NOT_FOUND, SHOW_NOT_PUBLISHED
 *
 * Fields omitted (server-side only — never leak to consumer):
 *   - brandVoice / showOverlay / systemPromptSkeleton (prompt material)
 *   - actor.voiceId / voiceSettings (TTS provider secrets)
 *   - actor.persona / ageStyles (prompt material)
 *   - ShowFokus.castRoles (server-side prompt shaping)
 */

import { prisma } from "@/lib/db";
import { verifyCanzoiaRequest } from "@/lib/canzoia/signing";
import { canzoiaError } from "@/lib/canzoia/errors";
import { buildTrailerProxyUrl } from "@/lib/canzoia/audio-token";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = verifyCanzoiaRequest(request, "");
  if (!auth.ok) return canzoiaError("UNAUTHORIZED", auth.message);

  const { slug } = await ctx.params;

  const show = await prisma.show.findUnique({
    where: { slug },
    include: {
      cast: {
        orderBy: { orderIndex: "asc" },
        include: {
          actor: {
            select: {
              id: true,
              displayName: true,
              emoji: true,
              color: true,
              portraitUrl: true,
              species: true,
              role: true,
            },
          },
        },
      },
      foki: {
        where: { enabled: true },
        orderBy: { orderIndex: "asc" },
        include: {
          fokusTemplate: {
            select: {
              id: true,
              displayName: true,
              emoji: true,
              description: true,
              minAlter: true,
              maxAlter: true,
              supportedCategories: true,
            },
          },
        },
      },
    },
  });

  if (!show) return canzoiaError("SHOW_NOT_FOUND", `Show '${slug}' not found`);
  if (!show.publishedAt) return canzoiaError("SHOW_NOT_PUBLISHED", `Show '${slug}' is in draft state`);

  // Readiness-Gate: cast leer oder keine aktiven Foki → SHOW_DEGRADED
  // statt einer leeren Manifest-Antwort, aus der Canzoia dann nicht
  // sauber rendern koennte. castRoles-JSON wird hier nicht gepraegt —
  // der Generate-Endpoint faengt den Rest via computeShowReadiness().
  if (show.cast.length === 0 || show.foki.length === 0) {
    return canzoiaError(
      "SHOW_DEGRADED",
      `Show '${slug}' ist publiziert, aber derzeit nicht bereit`,
      {
        blocking: [
          ...(show.cast.length === 0 ? ["Cast leer"] : []),
          ...(show.foki.length === 0 ? ["Keine aktiven Foki"] : []),
        ],
      },
    );
  }

  // Trailer-URL: wir speichern die rohe private-Blob-URL in der DB.
  // Canzoia bekommt aber einen token-signed Proxy-URL ausgeliefert, den
  // sie direkt im <audio>-Tag verwenden koennen (der Blob-URL wuerde
  // 403en). Siehe lib/canzoia/audio-token.ts fuer Hintergrund.
  const trailerAudioUrl = show.trailerAudioUrl ? buildTrailerProxyUrl(show.slug) : null;

  return Response.json({
    slug: show.slug,
    title: show.title,
    subtitle: show.subtitle,
    description: show.description,
    category: show.category,
    ageBand: show.ageBand,
    coverUrl: show.coverUrl,
    trailerAudioUrl,
    palette: show.palette,
    publishedAt: show.publishedAt,
    revisionHash: show.revisionHash,
    featuredShowFokusId: show.featuredShowFokusId,
    cast: show.cast.map((c) => ({
      role: c.role,
      actor: c.actor,
    })),
    foki: show.foki.map((f) => ({
      id: f.id,
      fokusTemplateId: f.fokusTemplateId,
      displayLabel: f.displayLabel ?? f.fokusTemplate.displayName,
      emoji: f.fokusTemplate.emoji,
      description: f.fokusTemplate.description,
      minAlter: f.fokusTemplate.minAlter,
      maxAlter: f.fokusTemplate.maxAlter,
      supportedCategories: f.fokusTemplate.supportedCategories,
      targetDurationMin: f.targetDurationMin,
      userInputSchema: f.userInputSchema,
    })),
  });
}

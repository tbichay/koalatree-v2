/**
 * Studio Trailer Preview Proxy — GET /api/studio/shows/[slug]/trailer.mp3
 *
 * Admin-only Variante des Canzoia-Trailer-Proxies. Zweck: der Brand-Tab im
 * Studio soll den Trailer schon _vor_ Publish anhoeren koennen. Die Canzoia-
 * Route verlangt `publishedAt`, weil sie Drittanbietern ausgeliefert wird —
 * hier reicht uns die Session-basierte Admin-Auth, keine publishedAt-Pruefung.
 *
 * Kein Query-Token noetig: die Session-Cookie reicht als Auth. Der <audio>-Tag
 * im Admin-Panel nimmt die Cookie automatisch mit.
 *
 * Status-Codes:
 *   200 — MP3-Stream (Content-Type: audio/mpeg)
 *   401 — Keine Admin-Session
 *   404 — Show existiert nicht oder hat keinen Trailer
 *   502 — Blob-Store liefert keinen Stream
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { slug } = await ctx.params;

  const show = await prisma.show.findUnique({
    where: { slug },
    select: { trailerAudioUrl: true },
  });
  if (!show || !show.trailerAudioUrl) {
    return new Response("Not Found", { status: 404 });
  }

  const { get } = await import("@vercel/blob");
  const blob = await get(show.trailerAudioUrl, { access: "private" });
  if (!blob?.stream) {
    console.error(`[studio/trailer-preview] No stream for ${show.trailerAudioUrl}`);
    return new Response("Audio unavailable", { status: 502 });
  }

  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      // Admin-Preview: kein Cache, weil beim "Neu generieren" sofort
      // die neue Version sichtbar sein soll. Preview-Latenz ist
      // irrelevant, die MP3 ist ~200KB klein.
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Canzoia Trailer Proxy — GET /api/canzoia/shows/[slug]/trailer.mp3?t=<token>
 *
 * Zwilling von app/api/canzoia/jobs/[jobId]/audio.mp3 — streamt die
 * per `show.trailerAudioUrl` referenzierte MP3 aus unserem private
 * Vercel-Blob an Canzoia. Trailer-URLs werden von der Shows-API
 * (catalog + manifest) zurueckgegeben und muessen von Canzoia direkt
 * ins `<audio src>` gesteckt werden koennen, ohne HMAC-Header-Dance
 * — darum Query-Token wie bei der Episoden-Audio.
 *
 * Auth: Query-Param `t=<16-hex>` via HMAC gegen "trailer:<slug>"
 * (separater Namespace von jobId-Tokens, siehe lib/canzoia/audio-token.ts).
 *
 * Status-Codes:
 *   200 — MP3-Stream (Content-Type: audio/mpeg)
 *   401 — Token fehlt oder stimmt nicht (kein Hint, um brute-force zu erschweren)
 *   404 — Show existiert nicht, ist draft, oder hat keinen Trailer
 *   502 — Blob-Store liefert keinen Stream (Netz / Orphan-Blob)
 */

import { prisma } from "@/lib/db";
import { verifyTrailerToken } from "@/lib/canzoia/audio-token";

export const runtime = "nodejs";
export const maxDuration = 30; // Trailer ist ~20s = ~200KB MP3 → schnell weg

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");

  if (!verifyTrailerToken(slug, token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const show = await prisma.show.findUnique({
    where: { slug },
    select: { trailerAudioUrl: true, publishedAt: true },
  });
  // Nicht-publizierte Shows dritten Parteien nicht ausliefern — sonst
  // waere der Trailer-URL ein Leak-Kanal fuer WIP-Shows. Admin-Inspection
  // laeuft ueber den /studio-Pfad, nicht hier.
  if (!show || !show.publishedAt || !show.trailerAudioUrl) {
    return new Response("Not Found", { status: 404 });
  }

  const { get } = await import("@vercel/blob");
  const blob = await get(show.trailerAudioUrl, { access: "private" });
  if (!blob?.stream) {
    console.error(`[trailer-proxy] No stream for ${show.trailerAudioUrl}`);
    return new Response("Audio unavailable", { status: 502 });
  }

  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      // Trailer aendert sich beim "Re-Generate", aber Blob-URLs sind
      // random-suffixed → neuer URL ↔ neuer Revision-Hash. Der Token
      // bleibt derselbe (pro slug). Wenn Canzoia den alten URL cached
      // und die Show rev bumpt, fetcht Canzoia eh neu.
      "Cache-Control": "public, max-age=3600, immutable",
      "X-Accel-Buffering": "no",
    },
  });
}

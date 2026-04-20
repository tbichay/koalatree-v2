/**
 * Canzoia Audio Proxy — GET /api/canzoia/jobs/[jobId]/audio.mp3?t=<token>
 *
 * Streamt die ShowEpisode-MP3 aus dem private Vercel-Blob-Store an
 * externe Caller (Canzoia-Backend oder -UI). Unser Blob Store ist
 * private-access und das lässt sich laut Vercel-Docs nicht nachträglich
 * umstellen, siehe lib/canzoia/audio-token.ts für die Hintergrund-Story.
 *
 * Auth: Query-Param `t=<16-hex>` via HMAC gegen jobId. Stabil pro
 * Episode — Canzoia kann den URL re-usen, cachen, oder im HTML-Player
 * einbauen, ohne jedes Mal neu signieren zu müssen.
 *
 * Status-Codes:
 *   200 — Audio stream (Content-Type: audio/mpeg)
 *   401 — Token fehlt oder stimmt nicht (keine zusätzliche Info — Canzoia
 *         soll nicht den jobId-Raum brute-forcen können)
 *   404 — Episode existiert nicht, ist nicht completed, oder hat keinen
 *         audioUrl (evtl. noch in Generation oder failed).
 *   502 — Blob-Store liefert keinen Stream (Netz-Problem, gelöschter Blob)
 *
 * Wenn R2-Migration (Phase 2) kommt kann dieser Endpoint weg — R2-Public-
 * URLs werden dann direkt in poll.result.audioUrl ausgeliefert.
 */

import { prisma } from "@/lib/db";
import { verifyAudioToken } from "@/lib/canzoia/audio-token";

export const runtime = "nodejs";
// Das reine Weiterreichen eines MP3-Streams ist schnell, aber für große
// Dateien und schlechte Netze geben wir uns etwas Luft (default = 10s auf
// Vercel Pro Free-Tier-Funktionen; ein 15-min-Audio sollte aber in 1-2s
// durchgestreamt sein).
export const maxDuration = 60;

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { jobId } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");

  if (!verifyAudioToken(jobId, token)) {
    // Bewusst kein Body / kein Detail — nur 401.
    return new Response("Unauthorized", { status: 401 });
  }

  const episode = await prisma.showEpisode.findUnique({
    where: { canzoiaJobId: jobId },
    select: { status: true, audioUrl: true },
  });
  if (!episode || episode.status !== "completed" || !episode.audioUrl) {
    return new Response("Not Found", { status: 404 });
  }

  // Lazy-import: spart Cold-Start-Kosten für 401/404-Pfade, und hält
  // die Route-Bundle-Größe klein.
  const { get } = await import("@vercel/blob");
  const blob = await get(episode.audioUrl, { access: "private" });
  if (!blob?.stream) {
    console.error(`[audio-proxy] No stream for ${episode.audioUrl}`);
    return new Response("Audio unavailable", { status: 502 });
  }

  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      // Audio ist immutable pro Episode → lange Client-Cache-Zeit ist OK.
      // Canzoia-CDN darf das auch cachen falls sie davor schieben.
      "Cache-Control": "public, max-age=3600, immutable",
      // Vercel-seitig: dürfen's auch CDN-cachen (Edge-Cache hält ~1h)
      "X-Accel-Buffering": "no", // keep streaming semantics
    },
  });
}

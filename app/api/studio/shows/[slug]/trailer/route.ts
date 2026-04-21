/**
 * Studio Trailer — admin-only trailer pipeline.
 *
 * POST /api/studio/shows/[slug]/trailer
 *   → ruft generateShowTrailer() sync auf (Claude + TTS + Blob-Upload)
 *     und gibt { trailerAudioUrl, text, durationSec, revisionHash }
 *     zurueck. Laenge: 15-40s realistischerweise, je nach Claude +
 *     ElevenLabs-Laune. Vercel-Funktion hat maxDuration=300 auf Pro,
 *     reicht mit Puffer.
 *
 * DELETE /api/studio/shows/[slug]/trailer
 *   → loescht NICHT den Blob (wir sind kein GC), sondern nur den
 *     Pointer `show.trailerAudioUrl = null`. Canzoia bekommt dann
 *     wieder null in den Manifest-Antworten — kein Player mehr.
 *
 * Kein GET: der Admin sieht den Trailer im Brand-Tab ueber die normale
 * GET /api/studio/shows/[slug]-Antwort (Feld `trailerAudioUrl`). Die
 * kommt sowieso beim Page-Load und muss nicht separat geholt werden.
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";
import { generateShowTrailer } from "@/lib/studio/show-trailer-generator";
import { newRevisionHash } from "@/lib/studio/show-revision";

export const maxDuration = 300; // Trailer-Pipeline braucht 15-40s + Puffer

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { slug } = await ctx.params;

  try {
    const result = await generateShowTrailer(slug);
    return Response.json({
      trailerAudioUrl: result.trailerAudioUrl,
      text: result.text,
      durationSec: result.durationSec,
      revisionHash: result.revisionHash,
    });
  } catch (e) {
    console.error(`[studio/trailer] ${slug} failed:`, e);
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Trailer-Generation fehlgeschlagen",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { slug } = await ctx.params;

  const show = await prisma.show.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!show) {
    return Response.json({ error: "Show nicht gefunden" }, { status: 404 });
  }

  // Revision bump mit, damit Canzoia-Clients die geaenderte Manifest-
  // Antwort picken und den Player verstecken.
  const revisionHash = newRevisionHash();
  await prisma.show.update({
    where: { id: show.id },
    data: { trailerAudioUrl: null, revisionHash },
  });

  return Response.json({ ok: true, revisionHash });
}

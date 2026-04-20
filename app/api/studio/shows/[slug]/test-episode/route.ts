/**
 * Studio-Test-Episode — admin-only pipeline to generate a ShowEpisode without
 * going through Canzoia's signed public API. Used from the Shows-Detail-UI
 * "Test"-tab to smoke-test a Show's prompt/cast/voice setup end-to-end.
 *
 * POST /api/studio/shows/[slug]/test-episode
 *   body: { showFokusId, userInputs: {...}, profileSnapshot: {...} }
 *   → creates a ShowEpisode row (status=queued), fires generateShowEpisode()
 *     non-blocking, returns { episodeId } immediately.
 *
 * GET /api/studio/shows/[slug]/test-episode?episodeId=…
 *   → returns current status + progressPct + audioUrl when ready (polling).
 *
 * Fire-and-forget: in an admin-triggered test context we accept that a serverless
 * function restart can orphan the job; production Canzoia traffic goes through
 * the normal cron-queue. Studio-Test prioritises immediacy over durability.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";
import { generateShowEpisode } from "@/lib/studio/show-episode-generator";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { slug } = await ctx.params;
  const show = await prisma.show.findUnique({
    where: { slug },
    include: { foki: true },
  });
  if (!show) return Response.json({ error: "Show nicht gefunden" }, { status: 404 });

  const body = (await request.json()) as {
    showFokusId?: string;
    userInputs?: Record<string, unknown>;
    profileSnapshot?: Record<string, unknown>;
  };

  if (!body.showFokusId) {
    return Response.json({ error: "showFokusId fehlt" }, { status: 400 });
  }
  const fokus = show.foki.find((f) => f.id === body.showFokusId);
  if (!fokus) {
    return Response.json({ error: "showFokusId gehört nicht zu dieser Show" }, { status: 400 });
  }
  if (!fokus.enabled) {
    return Response.json({ error: "Fokus ist deaktiviert" }, { status: 400 });
  }

  const userInputs = body.userInputs ?? {};
  const profileSnapshot = body.profileSnapshot ?? {};

  // Build stable IDs. idempotencyKey must be unique — for studio tests we
  // mint a fresh one each click so repeated generation works without collision.
  const canzoiaJobId = randomUUID();
  const idempotencyKey = `studio-test:${canzoiaJobId}`;

  const episode = await prisma.showEpisode.create({
    data: {
      showId: show.id,
      showFokusId: fokus.id,
      idempotencyKey,
      canzoiaJobId,
      canzoiaProfileId: "studio-test",
      showRevisionHash: show.revisionHash,
      userInputs: userInputs as object,
      profileSnapshot: profileSnapshot as object,
      status: "queued",
      progressPct: 0,
      startedAt: new Date(),
    },
  });

  // Fire-and-forget. Errors are caught and written to the ShowEpisode row
  // by the generator itself, so a rejected promise here is just diagnostic.
  void generateShowEpisode({ episodeId: episode.id }).catch((e) => {
    console.error(`[test-episode] ${episode.id} background failure:`, e);
  });

  return Response.json({ episodeId: episode.id }, { status: 202 });
}

export async function GET(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { slug } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get("episodeId");
  if (!episodeId) return Response.json({ error: "episodeId fehlt" }, { status: 400 });

  const episode = await prisma.showEpisode.findUnique({
    where: { id: episodeId },
    include: { show: { select: { slug: true } } },
  });
  if (!episode) return Response.json({ error: "Episode nicht gefunden" }, { status: 404 });
  if (episode.show.slug !== slug) {
    return Response.json({ error: "Episode gehört nicht zu dieser Show" }, { status: 400 });
  }

  return Response.json({
    episode: {
      id: episode.id,
      status: episode.status,
      progressPct: episode.progressPct,
      progressStage: episode.progressStage,
      title: episode.title,
      audioUrl: episode.audioUrl,
      durationSec: episode.durationSec,
      text: episode.text,
      errorMessage: episode.errorMessage,
      errorCode: episode.errorCode,
      inputTokens: episode.inputTokens,
      outputTokens: episode.outputTokens,
      ttsChars: episode.ttsChars,
      createdAt: episode.createdAt,
    },
  });
}

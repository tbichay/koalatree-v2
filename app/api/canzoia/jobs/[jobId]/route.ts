/**
 * Canzoia API — GET /api/canzoia/jobs/[jobId]
 *
 * Per docs/CANZOIA_API.md §4.4. Fallback polling path for generation status;
 * Canzoia prefers webhooks (not yet wired) for the happy path.
 *
 * Response: JobStatus — status, progress, result (when completed).
 *   - For `status: "completed"`: result.audioUrl points at our audio-proxy
 *     (`/api/canzoia/jobs/[jobId]/audio.mp3?t=<token>`), NOT the raw Blob URL.
 *     The raw URL is private and returns 403 externally. The proxy token is
 *     stable, so Canzoia may cache the URL — but Canzoia should still
 *     download + re-upload to its own R2 to offload hot-serving.
 *   - cost.totalMinutesBilled is what Canzoia deducts from user budget.
 */

import { prisma } from "@/lib/db";
import { verifyCanzoiaRequest } from "@/lib/canzoia/signing";
import { canzoiaError } from "@/lib/canzoia/errors";
import { buildAudioProxyUrl } from "@/lib/canzoia/audio-token";

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = verifyCanzoiaRequest(request, "");
  if (!auth.ok) return canzoiaError("UNAUTHORIZED", auth.message);

  const { jobId } = await ctx.params;

  const episode = await prisma.showEpisode.findUnique({
    where: { canzoiaJobId: jobId },
    include: { show: { select: { slug: true, revisionHash: true } } },
  });
  if (!episode) return canzoiaError("SHOW_NOT_FOUND", `Job '${jobId}' not found`);

  return Response.json({
    jobId: episode.canzoiaJobId,
    idempotencyKey: episode.idempotencyKey,
    status: episode.status,
    progressPct: episode.progressPct,
    progressStage: episode.progressStage,
    showSlug: episode.show.slug,
    showFokusId: episode.showFokusId,
    showRevisionHashAtStart: episode.showRevisionHash,
    currentShowRevisionHash: episode.show.revisionHash,
    createdAt: episode.createdAt,
    completedAt: episode.completedAt,
    // Included only once completed — Canzoia keys on status to know when safe
    // to read these fields. Kept flat-shape-compatible with the spec intent.
    result: episode.status === "completed" && episode.audioUrl
      ? {
          title: episode.title,
          // Proxy URL — the raw episode.audioUrl is private-Blob and returns
          // 403 to external callers. Proxy streams it server-side.
          audioUrl: buildAudioProxyUrl(episode.canzoiaJobId),
          durationSec: episode.durationSec,
          timeline: episode.timeline,
        }
      : null,
    cost: {
      inputTokens: episode.inputTokens,
      outputTokens: episode.outputTokens,
      ttsChars: episode.ttsChars,
      totalMinutesBilled: episode.totalMinutesBilled,
    },
    error: episode.status === "failed"
      ? {
          code: episode.errorCode ?? "INTERNAL_ERROR",
          message: episode.errorMessage ?? "Unknown error",
        }
      : null,
  });
}

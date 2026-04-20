/**
 * Canzoia API — POST /api/canzoia/shows/[slug]/generate
 *
 * Per docs/CANZOIA_API.md §4.3. Triggers an asynchronous episode generation.
 *
 * Body (GenerationRequest):
 *   {
 *     idempotencyKey: string,           // required — Canzoia-mint, 24h dedupe window
 *     showFokusId: string,              // required
 *     canzoiaProfileId: string,         // required — attribution + per-profile billing
 *     showRevisionHash?: string,        // optional — triggers STALE_REVISION if mismatched
 *     userInputs: Record<string, unknown>,
 *     profileSnapshot: Record<string, unknown>,
 *     webhookUrl?: string               // optional — per-request override (not used yet)
 *   }
 *
 * Responses:
 *   202 GenerationAccepted — new job enqueued (or replay of existing jobId)
 *   400 INVALID_INPUT
 *   404 SHOW_NOT_FOUND | SHOW_NOT_PUBLISHED
 *   409 STALE_REVISION | IDEMPOTENCY_CONFLICT
 *
 * Execution model (migrated 2026-04-20):
 *   This route now only ENQUEUES the work. Actual generation runs inside
 *   the `process-studio-tasks` cron (every minute, maxDuration=800s) via
 *   a new StudioTask row (type="show-episode"). Prior iteration ran the
 *   generator as a `void generateShowEpisode(...).catch(...)` on this
 *   request's function instance, but Vercel kills the function shortly
 *   after the 202 response is flushed — Promise dies, DB row stays at
 *   `synthesizing 45%` forever. The queue gives us persistence, proper
 *   stale recovery (see process-studio-tasks/route.ts:62), and makes
 *   13-minute "Lang" stories reliably possible.
 *
 *   For local dev responsiveness we also fire an immediate best-effort
 *   self-fetch to the cron so the user doesn't wait up to 60s for the
 *   next scheduled tick. If that fetch fails, the cron will pick up the
 *   task on the next tick — no data loss.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { verifyCanzoiaRequest } from "@/lib/canzoia/signing";
import { canzoiaError } from "@/lib/canzoia/errors";
import { recoverStuckShowEpisodes } from "@/lib/studio/show-episode-cleanup";

interface Body {
  idempotencyKey?: string;
  showFokusId?: string;
  canzoiaProfileId?: string;
  showRevisionHash?: string;
  userInputs?: Record<string, unknown>;
  profileSnapshot?: Record<string, unknown>;
  webhookUrl?: string;
}

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const rawBody = await request.text();
  const auth = verifyCanzoiaRequest(request, rawBody);
  if (!auth.ok) return canzoiaError("UNAUTHORIZED", auth.message);

  const { slug } = await ctx.params;

  let body: Body;
  try {
    body = JSON.parse(rawBody || "{}") as Body;
  } catch {
    return canzoiaError("INVALID_INPUT", "Invalid JSON body");
  }

  // ── Validate required fields ───────────────────────────────
  const missing: string[] = [];
  if (!body.idempotencyKey) missing.push("idempotencyKey");
  if (!body.showFokusId) missing.push("showFokusId");
  if (!body.canzoiaProfileId) missing.push("canzoiaProfileId");
  if (missing.length) {
    return canzoiaError("INVALID_INPUT", `Missing required field(s): ${missing.join(", ")}`, {
      missing,
    });
  }

  // ── Sweep stale ghost rows BEFORE the idempotency replay check ─────
  // Without this, a previous run that died mid-generation would be returned
  // as the replay response forever (stuck at `synthesizing 45%`). Awaited
  // rather than fire-and-forget so the caller sees a clean state even if
  // the sweeper hits a DB error (we'd rather surface that than hide it).
  try {
    await recoverStuckShowEpisodes();
  } catch (e) {
    console.warn("[canzoia-gen] cleanup sweep failed (non-fatal):", e);
  }

  // ── Resolve show first (so replay check knows the show's current rev) ──
  const show = await prisma.show.findUnique({
    where: { slug },
    include: { foki: { where: { id: body.showFokusId } } },
  });
  if (!show) return canzoiaError("SHOW_NOT_FOUND", `Show '${slug}' not found`);
  if (!show.publishedAt) return canzoiaError("SHOW_NOT_PUBLISHED", `Show '${slug}' is in draft state`);

  // ── Idempotency replay ─────────────────────────────────────
  const existing = await prisma.showEpisode.findUnique({
    where: { idempotencyKey: body.idempotencyKey! },
  });
  if (existing) {
    // Spec §4.3: same key with identical payload → original response; with
    // different payload → IDEMPOTENCY_CONFLICT. We can detect conflict by
    // comparing the core invariants.
    const existingUserInputs = JSON.stringify(existing.userInputs);
    const newUserInputs = JSON.stringify(body.userInputs ?? {});
    const payloadChanged =
      existing.showFokusId !== body.showFokusId ||
      existing.showId !== show.id ||
      existing.canzoiaProfileId !== body.canzoiaProfileId ||
      existingUserInputs !== newUserInputs;
    if (payloadChanged) {
      return canzoiaError(
        "IDEMPOTENCY_CONFLICT",
        "idempotencyKey already used with a different payload"
      );
    }
    return Response.json(
      {
        jobId: existing.canzoiaJobId,
        status: existing.status,
        idempotencyKey: existing.idempotencyKey,
        estimatedReadyAt: null,
        pollAfterSec: 5,
        replay: true,
      },
      { status: 202 }
    );
  }

  // ── Fokus + revision checks ────────────────────────────────
  const fokus = show.foki[0];
  if (!fokus) {
    return canzoiaError("INVALID_INPUT", "showFokusId does not belong to this show");
  }
  if (!fokus.enabled) {
    return canzoiaError("INVALID_INPUT", "Fokus is disabled");
  }
  if (body.showRevisionHash && body.showRevisionHash !== show.revisionHash) {
    return canzoiaError(
      "STALE_REVISION",
      `Show revision changed (client=${body.showRevisionHash}, server=${show.revisionHash})`,
      { currentRevisionHash: show.revisionHash }
    );
  }

  // ── Create ShowEpisode + enqueue StudioTask ───────────────────
  // Both rows are created in a transaction so a crash between them can't
  // leave a ShowEpisode without a matching task (which would stall forever
  // until the sweeper marks it failed). The ShowEpisode's idempotencyKey
  // unique constraint guards against double-submits at the Canzoia layer.
  const canzoiaJobId = randomUUID();
  const { episode } = await prisma.$transaction(async (tx) => {
    const ep = await tx.showEpisode.create({
      data: {
        showId: show.id,
        showFokusId: fokus.id,
        idempotencyKey: body.idempotencyKey!,
        canzoiaJobId,
        canzoiaProfileId: body.canzoiaProfileId!,
        showRevisionHash: show.revisionHash,
        userInputs: (body.userInputs ?? {}) as object,
        profileSnapshot: (body.profileSnapshot ?? {}) as object,
        status: "queued",
        progressPct: 0,
        startedAt: new Date(),
      },
    });
    await tx.studioTask.create({
      data: {
        type: "show-episode",
        // userId on StudioTask isn't FK-ed (just a string attribution
        // field), and our generation isn't authored by a Koalatree user
        // — it's a Canzoia-driven request. We attribute to the Show's
        // owner so admin task lists group sensibly.
        userId: show.ownerUserId,
        status: "pending",
        priority: 10, // above default 0, below studio-admin priority 20
        input: { episodeId: ep.id, canzoiaJobId } as object,
        maxRetries: 0, // see processShowEpisodeTask — no auto-retry for $$ reasons
      },
    });
    return { episode: ep };
  });

  // Best-effort kick: fire a self-call to the cron so the new task is
  // picked up in seconds rather than waiting up to 60s for the scheduled
  // tick. If this fetch fails (network blip, CRON_SECRET mismatch, dev
  // server down), the scheduled tick will still catch it — this is pure
  // latency optimisation, not reliability.
  //
  // Base URL resolution: VERCEL_URL is auto-set by Vercel on every deploy
  // (no https:// prefix), NEXT_PUBLIC_APP_URL is our user-configured prod
  // URL. We prefer VERCEL_URL because NEXT_PUBLIC_APP_URL can point to a
  // different domain (aliased custom domain) and self-fetching across
  // domains occasionally hits DNS/TLS edge cases — VERCEL_URL always
  // matches the function's own deployment and resolves cleanly.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret || process.env.NODE_ENV === "development") {
    // Intentional fire-and-forget: the cron handler awaits the full
    // generation internally, so awaiting here would mean the Canzoia
    // caller blocks for 3+ minutes. We want the 202 out the door now.
    fetch(`${baseUrl}/api/cron/process-studio-tasks`, {
      method: "GET",
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      // Short timeout — if the platform-level self-fetch doesn't resolve
      // in 5s, the scheduled tick is 55s away and will handle it. Prevents
      // a hung fetch from keeping this function alive past the 202 flush.
      signal: AbortSignal.timeout(5_000),
    }).catch((e) => {
      console.warn(
        `[canzoia-gen] cron kick failed (non-fatal, scheduled tick will catch it within 60s): ${e instanceof Error ? e.message : e}`,
      );
    });
  }

  // Rough ETA: 60s per ~1000 TTS chars + 30s Claude + up to 60s queue wait.
  const estMinutes = fokus.targetDurationMin;
  const estSec = 60 + estMinutes * 10;

  return Response.json(
    {
      jobId: canzoiaJobId,
      status: "queued",
      idempotencyKey: body.idempotencyKey,
      estimatedReadyAt: new Date(Date.now() + estSec * 1000).toISOString(),
      pollAfterSec: 5,
      replay: false,
    },
    { status: 202 }
  );
}

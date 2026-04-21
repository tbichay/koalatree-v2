/**
 * Canonical error envelope for the Canzoia↔Koalatree API — matches
 * docs/CANZOIA_API.md §7.1 and @tbichay/canzoia-contracts (common/errors.ts).
 *
 *   { error: { code, message, details?, incidentId? } }
 *
 * Use `canzoiaError()` so every non-2xx response we send conforms. This
 * prevents the consumer client from having to sniff text/html fallbacks.
 */

import { randomUUID } from "crypto";

export type CanzoiaErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "SHOW_NOT_FOUND"
  | "SHOW_NOT_PUBLISHED"
  | "SHOW_DEGRADED"
  | "STALE_REVISION"
  | "VOICE_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "QUOTA_EXCEEDED"
  | "GENERATION_TIMEOUT"
  | "INTERNAL_ERROR";

export const HTTP_STATUS_FOR_ERROR: Record<CanzoiaErrorCode, number> = {
  UNAUTHORIZED: 401,
  INVALID_INPUT: 400,
  SHOW_NOT_FOUND: 404,
  SHOW_NOT_PUBLISHED: 404,
  // SHOW_DEGRADED: Show *is* published but fails readiness — admin
  // removed cast/disabled foki after publish. 503 so the Canzoia
  // client can retry later (after admin fixes it) without invalidating
  // the catalog entry wholesale.
  SHOW_DEGRADED: 503,
  STALE_REVISION: 409,
  VOICE_UNAVAILABLE: 503,
  IDEMPOTENCY_CONFLICT: 409,
  QUOTA_EXCEEDED: 429,
  GENERATION_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

export function canzoiaError(
  code: CanzoiaErrorCode,
  message: string,
  details?: Record<string, unknown>,
  statusOverride?: number
) {
  const incidentId = randomUUID();
  return Response.json(
    {
      error: { code, message, ...(details && { details }), incidentId },
    },
    { status: statusOverride ?? HTTP_STATUS_FOR_ERROR[code] }
  );
}

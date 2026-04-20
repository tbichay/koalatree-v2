/**
 * Audio-Proxy Token Signing
 *
 * Vercel Blob Stores können nicht nachträglich von private → public
 * geflippt werden. Wir brauchen also einen Server-side Proxy
 * (`GET /api/canzoia/jobs/[jobId]/audio.mp3`) der das MP3 aus unserem
 * private Store lädt und an Canzoia streamt. Weil Canzoia den URL
 * ggf. als `<audio src="...">` oder in einem Backend-Fetch ohne
 * HMAC-Header verwendet, hängen wir einen Self-signed Token per
 * Query-Param an — selbes Pattern wie AWS S3 Presigned URLs, nur
 * selbstgebaut gegen `KOALATREE_TO_CANZOIA_SECRET` (existiert schon).
 *
 * Token = HMAC(jobId, secret)[0:16 hex chars]
 *   - Kein exp-Feld: Canzoia-Flow lädt sofort runter + re-uploadet.
 *     Eine stabile URL ist auch praktisch falls wir den Webhook
 *     später retried'en müssen oder Canzoia ihn vorübergehend cached.
 *   - Rotation über Env-Var: wenn wir das Secret austauschen, werden
 *     alle alten URLs ungültig — das ist der Revoke-Hebel.
 *   - 16 hex = 64 bits — unguessable gegen Bruteforce, klein genug
 *     für kurze URLs.
 *
 * Wenn Phase 2 (R2 mit public bucket) kommt, kann diese Datei weg —
 * R2-Public-URLs brauchen keinen Proxy.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LEN = 16; // hex chars = 64 bits entropy

function getSecret(): string {
  const s = process.env.KOALATREE_TO_CANZOIA_SECRET;
  if (!s) {
    throw new Error(
      "KOALATREE_TO_CANZOIA_SECRET missing — required for audio-proxy token signing"
    );
  }
  return s;
}

/** Mint a stable token tied to the jobId. Throws if secret missing. */
export function signAudioToken(jobId: string): string {
  return createHmac("sha256", getSecret()).update(jobId).digest("hex").slice(0, TOKEN_LEN);
}

/** Constant-time verify. Returns false on any failure — never throws. */
export function verifyAudioToken(jobId: string, token: string | null | undefined): boolean {
  if (!token || token.length !== TOKEN_LEN || !/^[0-9a-f]+$/.test(token)) return false;
  let expected: string;
  try {
    expected = signAudioToken(jobId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Build the full external-facing audio URL for a given jobId.
 * Prefers VERCEL_URL (matches current deployment host exactly) and falls
 * back to NEXT_PUBLIC_APP_URL for local dev.
 */
export function buildAudioProxyUrl(jobId: string): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/canzoia/jobs/${jobId}/audio.mp3?t=${signAudioToken(jobId)}`;
}

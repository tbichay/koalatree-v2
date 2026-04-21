/**
 * Config-Health — GET /api/health/config
 *
 * Reports which expected environment variables are set vs missing, grouped
 * by integration area. Zero side effects: no network calls, no AI calls,
 * no blob writes. Just `process.env.X ? "set" : "missing"`.
 *
 * Why this exists: on 2026-04-20 we lost a `generation.completed` webhook
 * because Canzoia's prod had no `CRON_SECRET` env var — the ingest cron
 * silently 401'd its own scheduler calls for weeks, and nobody noticed.
 * A 10-second "is your config sane" check would have caught it immediately.
 *
 * NOT returned: env *values*. Only "set"/"missing". Never leak secrets here.
 *
 * Auth: Bearer `CRON_SECRET`, same as the cron endpoints. Manual curl
 * works fine:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.koalatree.ai/api/health/config
 *
 * In development (no CRON_SECRET set) auth is skipped so local smoke-tests
 * don't need an env dance.
 */

export const runtime = "nodejs";
// Never cache — env vars can change without a redeploy (via `vercel env`
// → redeploy), and this endpoint is specifically for verifying the
// current prod state.
export const dynamic = "force-dynamic";

type VarStatus = "set" | "missing";

interface AreaCheck {
  area: string;
  /** Required vars — missing any of these flips the area to not-ok. */
  required: Record<string, VarStatus>;
  /** Optional vars — informational only, never fails the check. */
  optional?: Record<string, VarStatus>;
  ok: boolean;
  /** Human-readable note when the area is in a known-degraded state. */
  note?: string;
}

function status(name: string): VarStatus {
  return process.env[name] ? "set" : "missing";
}

function mkArea(
  area: string,
  requiredNames: string[],
  optionalNames: string[] = [],
  note?: string,
): AreaCheck {
  const required: Record<string, VarStatus> = {};
  for (const name of requiredNames) required[name] = status(name);
  const optional: Record<string, VarStatus> = {};
  for (const name of optionalNames) optional[name] = status(name);

  const ok = Object.values(required).every((v) => v === "set");
  return {
    area,
    required,
    optional: optionalNames.length ? optional : undefined,
    ok,
    note,
  };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Areas are grouped by failure-blast-radius. A missing var in
  // "canzoia-egress" means episodes never arrive in Canzoia. A missing
  // var in "ai-optional" just means a specific clip-provider is off.
  const checks: AreaCheck[] = [
    mkArea(
      "cron",
      ["CRON_SECRET"],
      [],
      "Vercel Cron uses this to authenticate its own scheduled calls. Missing = crons silently 401.",
    ),
    mkArea(
      "database",
      ["DATABASE_URL"],
      [],
    ),
    mkArea(
      "auth",
      ["RESEND_API_KEY"],
      ["EMAIL_FROM", "AUTH_URL", "NEXTAUTH_URL", "NEXT_PUBLIC_APP_URL"],
    ),
    mkArea(
      "canzoia-ingress",
      ["CANZOIA_TO_KOALATREE_SECRET"],
      [],
      "HMAC secret Canzoia uses to sign inbound webhooks (job-create, etc). Must match Canzoia's `KOALATREE_HMAC_SECRET`.",
    ),
    mkArea(
      "canzoia-egress",
      ["CANZOIA_WEBHOOK_URL", "KOALATREE_TO_CANZOIA_SECRET"],
      [],
      "Target URL + HMAC secret for outbound generation.completed/failed webhooks. Must match Canzoia's `KOALATREE_TO_CANZOIA_SECRET`.",
    ),
    mkArea(
      "storage",
      ["BLOB_READ_WRITE_TOKEN"],
      [],
      "Vercel Blob private-store token. Episode audio lands here before Canzoia pulls it via the signed proxy.",
    ),
    mkArea(
      "ai-core",
      ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ELEVENLABS_API_KEY"],
      [],
      "Required for story generation (Anthropic = script, OpenAI = structuring, ElevenLabs = TTS).",
    ),
    mkArea(
      "ai-optional",
      [],
      ["FAL_KEY", "GOOGLE_AI_API_KEY", "RUNWAY_API_KEY", "HEDRA_API_KEY"],
      "Clip-provider keys. Missing any one just disables that provider; the Studio falls back to the next available.",
    ),
    mkArea(
      "remotion",
      [],
      ["REMOTION_SERVE_URL", "REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY"],
      "Lambda-render credentials. Missing = film-rendering falls back to local CLI only.",
    ),
  ];

  const missingRequired: string[] = [];
  for (const c of checks) {
    for (const [name, st] of Object.entries(c.required)) {
      if (st === "missing") missingRequired.push(name);
    }
  }

  const ok = missingRequired.length === 0;
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";

  return Response.json({
    ok,
    environment,
    service: "koalatree",
    checks,
    missingRequired,
    generatedAt: new Date().toISOString(),
  });
}

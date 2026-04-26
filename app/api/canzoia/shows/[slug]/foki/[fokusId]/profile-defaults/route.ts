/**
 * Canzoia API — POST /api/canzoia/shows/[slug]/foki/[fokusId]/profile-defaults
 *
 * Liefert LLM-vorgeschlagene Default-Werte fuer das `userInputSchema` eines
 * ShowFokus, abgestimmt auf das uebergebene Profile. Frontend rendert pro
 * Select-Feld einen "✨ Fuer dich: <Empfehlung>"-Hint, den der User per
 * Klick uebernimmt (KEIN Auto-Set — der User soll bewusst entscheiden).
 *
 * Body:
 *   {
 *     canzoiaProfileId: string,    // required
 *     profileSnapshot:  Record<string, unknown>  // required, wird whitelisted
 *   }
 *
 * Response:
 *   {
 *     defaults: { [fieldId]: { value, label, rationale? } },
 *     cached: boolean,             // true => aus DB-Cache, false => fresh LLM
 *     skippedFields: string[]      // Fields ohne Match (Resolver liefert null)
 *   }
 *
 * Auth: HMAC via CANZOIA_TO_KOALATREE_SECRET (gleiches Schema wie generate).
 *
 * Cache: Compound-Key (canzoiaProfileId, showFokusId), invalidiert via
 * profileFingerprint (whitelisted snapshot) + ShowFokus.updatedAt. Kein
 * TTL — Cache bleibt gueltig bis Profil oder Schema sich aendert.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifyCanzoiaRequest } from "@/lib/canzoia/signing";
import { canzoiaError } from "@/lib/canzoia/errors";
import {
  whitelistProfileForLLM,
  profileFingerprint,
  resolveOptionMatch,
} from "@/lib/canzoia/profile-defaults";
import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

interface SchemaOption {
  value: string;
  label: string;
}
interface SchemaField {
  id: string;
  label: string;
  kind: "text" | "select" | "number";
  options?: SchemaOption[];
  default?: string | number;
  required?: boolean;
}

interface DefaultEntry {
  value: string;
  label: string;
  rationale?: string;
}

interface Body {
  canzoiaProfileId?: string;
  profileSnapshot?: Record<string, unknown>;
}

type Ctx = { params: Promise<{ slug: string; fokusId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const rawBody = await request.text();
  const auth = verifyCanzoiaRequest(request, rawBody);
  if (!auth.ok) return canzoiaError("UNAUTHORIZED", auth.message);

  const { slug, fokusId } = await ctx.params;

  let body: Body;
  try {
    body = JSON.parse(rawBody || "{}") as Body;
  } catch {
    return canzoiaError("INVALID_INPUT", "Invalid JSON body");
  }

  if (!body.canzoiaProfileId) {
    return canzoiaError("INVALID_INPUT", "canzoiaProfileId is required");
  }
  const snapshot = body.profileSnapshot ?? {};

  // ── Fokus + Show laden (bestehen + Membership) ────────────────────
  const fokus = await prisma.showFokus.findUnique({
    where: { id: fokusId },
    include: {
      show: {
        select: { id: true, slug: true, title: true, description: true, brandVoice: true },
      },
      fokusTemplate: { select: { displayName: true, description: true, formatType: true } },
    },
  });
  if (!fokus) return canzoiaError("SHOW_NOT_FOUND", "Fokus nicht gefunden");
  if (fokus.show.slug !== slug) {
    return canzoiaError("INVALID_INPUT", "Fokus gehoert nicht zu dieser Show");
  }

  const schema = fokus.userInputSchema as { fields?: SchemaField[] } | null;
  const selectFields = (schema?.fields ?? []).filter(
    (f): f is SchemaField & { options: SchemaOption[] } =>
      f.kind === "select" && Array.isArray(f.options) && f.options.length > 0,
  );

  // Keine Select-Felder => keine Defaults zu berechnen. Fruehzeitig out
  // damit wir kein LLM-Geld verbrennen.
  if (selectFields.length === 0) {
    return Response.json({ defaults: {}, cached: false, skippedFields: [] });
  }

  // ── Cache-Lookup ──────────────────────────────────────────────────
  const whitelisted = whitelistProfileForLLM(snapshot);
  const fingerprint = profileFingerprint(whitelisted);

  const cached = await prisma.profileFokusDefaults.findUnique({
    where: {
      canzoiaProfileId_showFokusId: {
        canzoiaProfileId: body.canzoiaProfileId,
        showFokusId: fokusId,
      },
    },
  });

  if (
    cached &&
    cached.profileFingerprint === fingerprint &&
    cached.schemaUpdatedAt.getTime() === fokus.updatedAt.getTime()
  ) {
    return Response.json({
      defaults: cached.defaults,
      cached: true,
      skippedFields: [],
    });
  }

  // ── LLM-Call ──────────────────────────────────────────────────────
  const system = buildSystemPrompt({
    showTitle: fokus.show.title,
    showDescription: fokus.show.description ?? "",
    showBrandVoice: fokus.show.brandVoice ?? "",
    fokusLabel: fokus.displayLabel ?? fokus.fokusTemplate.displayName,
    fokusDescription: fokus.fokusTemplate.description ?? "",
    fokusOverlay: fokus.showOverlay ?? "",
    formatType: fokus.fokusTemplate.formatType ?? "narrative",
  });
  const user = buildUserPrompt({
    profile: whitelisted,
    fields: selectFields,
  });

  let raw: string;
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  } catch (err) {
    console.error("[profile-defaults] anthropic call failed:", err);
    return canzoiaError(
      "INTERNAL_ERROR",
      `LLM-Call fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const llmDefaults = parseDefaultsJson(raw);
  if (!llmDefaults) {
    console.error("[profile-defaults] could not parse Claude output:", raw.slice(0, 500));
    return canzoiaError("INTERNAL_ERROR", "LLM-Antwort konnte nicht geparst werden");
  }

  // ── Resolver: Claude-Output gegen tatsaechliche Schema-Options ────
  const resolved: Record<string, DefaultEntry> = {};
  const skippedFields: string[] = [];
  for (const field of selectFields) {
    const candidate = llmDefaults[field.id];
    if (!candidate) {
      skippedFields.push(field.id);
      continue;
    }
    const match = resolveOptionMatch(candidate.value, field.options);
    if (!match) {
      skippedFields.push(field.id);
      continue;
    }
    resolved[field.id] = {
      value: match.value,
      label: match.label,
      ...(candidate.rationale ? { rationale: candidate.rationale } : {}),
    };
  }

  // ── Cache-Upsert ──────────────────────────────────────────────────
  // Auch wenn alle Fields skipped wurden, cachen wir das leere Objekt —
  // sonst laeuft der LLM-Call bei jedem Reload erneut.
  await prisma.profileFokusDefaults.upsert({
    where: {
      canzoiaProfileId_showFokusId: {
        canzoiaProfileId: body.canzoiaProfileId,
        showFokusId: fokusId,
      },
    },
    create: {
      canzoiaProfileId: body.canzoiaProfileId,
      showFokusId: fokusId,
      profileFingerprint: fingerprint,
      schemaUpdatedAt: fokus.updatedAt,
      defaults: resolved as unknown as Prisma.InputJsonValue,
    },
    update: {
      profileFingerprint: fingerprint,
      schemaUpdatedAt: fokus.updatedAt,
      defaults: resolved as unknown as Prisma.InputJsonValue,
    },
  });

  return Response.json({
    defaults: resolved,
    cached: false,
    skippedFields,
  });
}

function buildSystemPrompt(args: {
  showTitle: string;
  showDescription: string;
  showBrandVoice: string;
  fokusLabel: string;
  fokusDescription: string;
  fokusOverlay: string;
  formatType: string;
}): string {
  return [
    `Du hilfst einem Hoerer beim Ausfuellen einer Episoden-Generator-Form.`,
    `Aufgabe: pro Form-Feld die EINE Auswahl-Option vorschlagen, die am besten zum Profil + zur Show + zum Fokus passt.`,
    ``,
    `KONTEXT:`,
    `Show: "${args.showTitle}"`,
    args.showDescription ? `Beschreibung: ${args.showDescription}` : "",
    args.showBrandVoice ? `Brand-Voice: ${args.showBrandVoice}` : "",
    `Fokus: "${args.fokusLabel}"${args.fokusDescription ? ` — ${args.fokusDescription}` : ""}`,
    args.fokusOverlay ? `Fokus-Overlay: ${args.fokusOverlay}` : "",
    `Format-Typ: ${args.formatType}`,
    ``,
    `ANTWORT-FORMAT:`,
    `Antworte AUSSCHLIESSLICH mit gueltigem JSON in dieser Form (kein Markdown, keine Erklaerung davor oder danach):`,
    `{"defaults": {"<fieldId>": {"value": "<option_value_oder_label>", "rationale": "kurzer satz auf deutsch warum"}, ...}}`,
    ``,
    `REGELN:`,
    `- Pro Feld GENAU einen Wert. Verwende den value oder das label aus der Optionsliste.`,
    `- "rationale" ist OPTIONAL, max 80 Zeichen, sehr knapp ("kindgerechtes Alter", "ruhiger Stil passt zur Profil-Stimmung").`,
    `- Wenn keines der Optionen wirklich passt: Feld AUSLASSEN (kein null, kein Default — einfach nicht ins Output).`,
    `- Wenn das Profil leer/leerig ist: nur Felder mit klarer Show-Default-Empfehlung beantworten.`,
    `- Diskretion: keine Annahmen ueber sensible Themen die nicht im Profil stehen.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(args: {
  profile: Record<string, unknown>;
  fields: Array<SchemaField & { options: SchemaOption[] }>;
}): string {
  const profileLines = Object.entries(args.profile).map(
    ([k, v]) => `${k}: ${JSON.stringify(v)}`,
  );
  const profileBlock =
    profileLines.length > 0
      ? profileLines.join("\n")
      : "(Profil leer — bitte konservative Defaults pro Feld anhand der Show-Defaults waehlen.)";

  const fieldsBlock = args.fields
    .map((f) => {
      const opts = f.options
        .map((o) => `    - ${o.value} ("${o.label}")`)
        .join("\n");
      return `${f.id} ("${f.label}"):\n${opts}`;
    })
    .join("\n\n");

  return [
    `PROFIL:`,
    profileBlock,
    ``,
    `FELDER MIT OPTIONEN:`,
    fieldsBlock,
    ``,
    `Schlage jetzt pro Feld die EINE passende Option vor.`,
  ].join("\n");
}

interface RawDefault {
  value: string;
  rationale?: string;
}

/**
 * Parsing identisch zur Studio-suggest-options-Route — Code-Fences strippen,
 * erstes {...}-Block extrahieren, JSON parsen.
 */
function parseDefaultsJson(raw: string): Record<string, RawDefault> | null {
  const candidates: string[] = [raw];
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1]);
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch?.[0]) candidates.push(objMatch[0]);

  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate.trim()) as { defaults?: unknown };
      if (typeof obj.defaults !== "object" || obj.defaults === null) continue;
      const out: Record<string, RawDefault> = {};
      for (const [fieldId, entry] of Object.entries(obj.defaults)) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as { value?: unknown; rationale?: unknown };
        const value = typeof e.value === "string" ? e.value.trim() : "";
        if (!value) continue;
        out[fieldId] = {
          value,
          ...(typeof e.rationale === "string" && e.rationale.trim()
            ? { rationale: e.rationale.trim().slice(0, 80) }
            : {}),
        };
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

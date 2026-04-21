/**
 * Publish-Gates — Readiness-Check fuer Shows.
 *
 * Bevor eine Show in den Canzoia-Katalog rutscht (GET /api/canzoia/shows
 * filtert auf `publishedAt IS NOT NULL`), muss sie auf Minimal-Setup
 * geprueft werden — sonst wirft der Generator 500er, sobald ein Kid
 * eine Episode requestet. Diese Datei ist die *single source of truth*
 * fuer "was muss stimmen":
 *
 *   - `blocking` Checks: API verweigert Publish, UI disabled den Button
 *   - `warning` Checks: werden angezeigt, blocken aber nichts
 *
 * Die Liste orientiert sich an dem, was `loadEpisodeInput()` in
 * `show-episode-generator.ts` voraussetzt — d.h. jede neue harte
 * Annahme im Generator soll hier einen Blocking-Check bekommen.
 *
 * Pure read: keine Mutation, billige Query, OK auf jedem GET zu
 * laufen.
 */

import type { Show, ShowActor, ShowFokus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ReadinessSeverity = "blocking" | "warning";

export type ReadinessCheckId =
  | "cast-exists"
  | "enabled-foki-exists"
  | "foki-cast-roles"
  | "cover-image"
  | "featured-foki"
  | "brand-voice";

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  severity: ReadinessSeverity;
  ok: boolean;
  /** Optional context shown below the label when ok=false. */
  detail?: string;
}

export interface ShowReadiness {
  /** true ⇔ keine `blocking` Checks fehlgeschlagen. */
  ready: boolean;
  blockingFailures: number;
  warningFailures: number;
  checks: ReadinessCheck[];
}

/**
 * Shape the readiness computation expects — a Show with cast + foki
 * already hydrated. Callers that fetch via list endpoints can include
 * these fields once and call `computeShowReadinessFromLoaded()` per
 * show without issuing N additional DB round-trips.
 */
export type LoadedShowForReadiness = Show & {
  cast: ShowActor[];
  foki: ShowFokus[];
};

/**
 * Compute readiness for a single show by id.
 *
 * Returns a `ShowReadiness` with every check listed (passed or failed)
 * so the UI can render a checklist. `ready=true` iff no blocking check
 * failed; warnings are informational.
 *
 * Throws if the show doesn't exist.
 */
export async function computeShowReadiness(showId: string): Promise<ShowReadiness> {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: {
      cast: { include: { actor: true } },
      foki: true,
    },
  });
  if (!show) throw new Error(`Show '${showId}' nicht gefunden`);

  return computeShowReadinessFromLoaded(show);
}

/**
 * Pure variant: caller has already fetched the show with `cast` and
 * `foki` included. Used by list endpoints to compute readiness for N
 * shows in a single `findMany`.
 */
export function computeShowReadinessFromLoaded(
  show: LoadedShowForReadiness,
): ShowReadiness {
  const checks: ReadinessCheck[] = [];

  // ── BLOCKING ──────────────────────────────────────────────────
  // 1. Cast: mind. ein ShowActor. Generator wirft explizit bei leer
  //    ("Show hat keinen Cast" — show-episode-generator.ts:162).
  const hasCast = show.cast.length > 0;
  checks.push({
    id: "cast-exists",
    label: "Cast hat mind. einen Actor",
    severity: "blocking",
    ok: hasCast,
    detail: hasCast ? undefined : "Keine Actors in der Besetzung — Cast-Tab oeffnen.",
  });

  // 2. Enabled Foki: mind. ein ShowFokus mit enabled=true. Ohne kann
  //    Canzoia nichts generieren (POST /generate braucht showFokusId).
  const enabledFoki = show.foki.filter((f) => f.enabled);
  const hasEnabledFokus = enabledFoki.length > 0;
  checks.push({
    id: "enabled-foki-exists",
    label: "Mind. ein aktiver Fokus",
    severity: "blocking",
    ok: hasEnabledFokus,
    detail: hasEnabledFokus
      ? undefined
      : show.foki.length === 0
        ? "Keine Foki angelegt — Foki-Tab oeffnen."
        : `${show.foki.length} Fokus/Foki vorhanden, aber alle deaktiviert.`,
  });

  // 3. castRoles per enabled Fokus: muss mind. einen bekannten Actor
  //    referenzieren, sonst kann der Generator keinen lead/support
  //    zuordnen. Wir akzeptieren beide Formen (raw-map, lead/support/
  //    minimal arrays) genauso wie der Generator.
  const castActorIds = new Set(show.cast.map((c) => c.actorId));
  const rolesMissing: string[] = [];
  for (const f of enabledFoki) {
    if (!castRolesHasKnownActor(f.castRoles, castActorIds)) {
      rolesMissing.push(f.id);
    }
  }
  const rolesOk = rolesMissing.length === 0 && hasEnabledFokus;
  checks.push({
    id: "foki-cast-roles",
    label: "castRoles jedes Fokus referenzieren Cast",
    severity: "blocking",
    ok: rolesOk,
    detail:
      !hasEnabledFokus
        ? "Erst Fokus aktivieren, dann castRoles pruefen."
        : rolesMissing.length > 0
          ? `${rolesMissing.length} Fokus/Foki ohne gueltige castRoles — alle support-Rollen landen dann auf allen Cast-Actors.`
          : undefined,
  });

  // ── WARNINGS ──────────────────────────────────────────────────
  // 4. Cover-Image: Canzoia rendert sonst einen Platzhalter. Nicht
  //    blocking — man kann zur Not depublizieren + nachliefern, aber
  //    fuer Launch unschoen.
  checks.push({
    id: "cover-image",
    label: "Cover-Bild gesetzt",
    severity: "warning",
    ok: !!show.coverUrl,
    detail: show.coverUrl ? undefined : "Ohne Cover wirkt die Show im Katalog kaputt.",
  });

  // 5. featuredShowFokusId: Canzoia UI waehlt den default-Fokus fuer
  //    die Generate-Buttons. Ohne faellt Canzoia auf orderIndex=0
  //    zurueck, was meistens OK ist — nur Warnung.
  const featuredOk =
    !show.featuredShowFokusId ||
    enabledFoki.some((f) => f.id === show.featuredShowFokusId);
  checks.push({
    id: "featured-foki",
    label: "Featured-Fokus zeigt auf aktiven Fokus",
    severity: "warning",
    ok: featuredOk,
    detail: featuredOk
      ? undefined
      : "Featured-Fokus ist gesetzt, aber der referenzierte Fokus ist deaktiviert oder geloescht.",
  });

  // 6. brandVoice: leer = Generator nimmt nur fokus-Skeleton, Stories
  //    klingen dann sehr generisch. Warnung, kein Blocker.
  checks.push({
    id: "brand-voice",
    label: "Brand-Voice beschrieben",
    severity: "warning",
    ok: show.brandVoice.trim().length > 0,
    detail:
      show.brandVoice.trim().length > 0
        ? undefined
        : "Ohne Brand-Voice klingt die Show wie jede andere — Brand-Tab oeffnen.",
  });

  const blockingFailures = checks.filter(
    (c) => c.severity === "blocking" && !c.ok,
  ).length;
  const warningFailures = checks.filter(
    (c) => c.severity === "warning" && !c.ok,
  ).length;

  return {
    ready: blockingFailures === 0,
    blockingFailures,
    warningFailures,
    checks,
  };
}

/**
 * castRoles kennt mehrere JSON-Shapes (siehe show-episode-generator.ts
 * L107-132). Wir verifizieren hier nur: enthaelt die JSON *irgendeinen*
 * Actor-ID-Verweis, der in show.cast existiert? Das reicht fuer den
 * Gate — der Generator faellt bei unbekannten IDs ohnehin silent auf
 * "support" zurueck, also wollen wir nur den "komplett leer oder alle
 * IDs falsch"-Fall abfangen.
 */
function castRolesHasKnownActor(
  raw: unknown,
  castActorIds: Set<string>,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;

  // Shape A: { raw: { actorId: role, ... } }
  if (obj.raw && typeof obj.raw === "object") {
    for (const aid of Object.keys(obj.raw as Record<string, unknown>)) {
      if (castActorIds.has(aid)) return true;
    }
  }

  // Shape B: { lead, support, minimal } — lead can be string or array
  const lead = obj.lead;
  if (typeof lead === "string" && castActorIds.has(lead)) return true;
  if (Array.isArray(lead) && lead.some((a) => typeof a === "string" && castActorIds.has(a))) {
    return true;
  }
  for (const key of ["support", "minimal"] as const) {
    const v = obj[key];
    if (Array.isArray(v) && v.some((a) => typeof a === "string" && castActorIds.has(a))) {
      return true;
    }
  }

  return false;
}

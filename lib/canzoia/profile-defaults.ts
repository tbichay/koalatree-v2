/**
 * Helpers fuer Feature B (Profile-aware Default-Selection).
 *
 * Drei Bausteine die der profile-defaults-Endpoint kombiniert:
 *
 *   1) `whitelistProfileForLLM` — der Profile-Snapshot kann beliebige
 *      Felder enthalten (Email, Telefon, Adress-Hints, Kalender-IDs aus
 *      Drittsystemen). An Claude darf nur, was fuer Default-Auswahl
 *      relevant ist: Anzeige-Name, Alter, Sprache, Interessen, Stil.
 *      Whitelist statt Blacklist — sicherer beim Hinzufuegen neuer Felder.
 *
 *   2) `profileFingerprint` — stabiler Hash ueber den whitelisted
 *      Snapshot, fuer Cache-Invalidierung. Wenn der User sein Profil
 *      aendert (Alter, Interessen), entsteht ein neuer Fingerprint und
 *      der gecachte Default ist obsolet — der naechste Form-View triggert
 *      einen frischen LLM-Call.
 *
 *   3) `resolveOptionMatch` — Claude liefert vermutlich Labels oder
 *      Slugs zurueck, manchmal mit kleinen Abweichungen ("Kindgerecht"
 *      vs. value="kindgerecht_4_8"). Resolver versucht in dieser Reihen-
 *      folge: exact value → exact label → case-insensitive value/label
 *      → substring match. Kein Match → null (Frontend zeigt keine Empfehlung).
 */

import { createHash } from "crypto";

/**
 * Felder die an Claude fliessen duerfen. Alles andere wird stripped —
 * bewusste Whitelist statt Blacklist, damit neue Profile-Felder nicht
 * versehentlich exfiltriert werden.
 */
const PROFILE_LLM_WHITELIST = new Set([
  "displayName",
  "ageYears",
  "ageBand",
  "language",
  "preferredLanguage",
  "interests",
  "favoriteThemes",
  "personalityTraits",
  "energyLevel",
  "moodTendency",
  "sleepQuality",
  "stressLevel",
  "spiritualOrientation",
  "lifeStage",
  "occupation",
]);

/**
 * Filtert den Profile-Snapshot auf die LLM-erlaubten Felder. Werte mit
 * `null` / `undefined` / Leerstring werden zusaetzlich ausgesiebt — kein
 * Sinn, leere Felder mitzuschicken (Token-Verschwendung + verwirrt das LLM).
 */
export function whitelistProfileForLLM(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!PROFILE_LLM_WHITELIST.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Stabiler Hash ueber den whitelisted Snapshot fuer Cache-Invalidierung.
 * Reihenfolge-unabhaengig (sortierte Keys) — gleiche Daten in anderer
 * Reihenfolge produzieren denselben Fingerprint.
 */
export function profileFingerprint(
  whitelisted: Record<string, unknown>,
): string {
  const sortedKeys = Object.keys(whitelisted).sort();
  const canonical = sortedKeys
    .map((k) => `${k}=${JSON.stringify(whitelisted[k])}`)
    .join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

interface SchemaOption {
  value: string;
  label: string;
}

/**
 * Versucht, Claudes Output (z.B. "Kindgerecht" oder "kindgerecht_4_8")
 * gegen die Schema-Options zu matchen. Reihenfolge der Strategien:
 *
 *   1. exact value
 *   2. exact label
 *   3. case-insensitive value
 *   4. case-insensitive label
 *   5. substring (case-insensitive) auf value oder label
 *
 * Gibt null zurueck wenn nichts passt — der Caller sollte dann KEINE
 * Empfehlung anzeigen (besser keine als eine falsche).
 */
export function resolveOptionMatch(
  claudeValue: string,
  options: SchemaOption[],
): SchemaOption | null {
  if (!claudeValue || options.length === 0) return null;
  const needle = claudeValue.trim();
  if (!needle) return null;

  // 1. exact value
  const exactValue = options.find((o) => o.value === needle);
  if (exactValue) return exactValue;

  // 2. exact label
  const exactLabel = options.find((o) => o.label === needle);
  if (exactLabel) return exactLabel;

  const lower = needle.toLowerCase();

  // 3. case-insensitive value
  const ciValue = options.find((o) => o.value.toLowerCase() === lower);
  if (ciValue) return ciValue;

  // 4. case-insensitive label
  const ciLabel = options.find((o) => o.label.toLowerCase() === lower);
  if (ciLabel) return ciLabel;

  // 5. substring — bidirektional, weil Claude evtl. "kindgerecht" liefert
  // wenn die Option "kindgerecht_4_8" heisst, oder umgekehrt.
  const substr = options.find((o) => {
    const v = o.value.toLowerCase();
    const l = o.label.toLowerCase();
    return (
      v.includes(lower) ||
      lower.includes(v) ||
      l.includes(lower) ||
      lower.includes(l)
    );
  });
  return substr ?? null;
}

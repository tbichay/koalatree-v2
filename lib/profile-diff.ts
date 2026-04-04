/**
 * Profile evolution tracking — computes diffs between profile versions
 * and builds prompt sections for story generation.
 */

// --- Types ---

interface ProfileLike {
  interessen: string[];
  charaktereigenschaften: string[];
  herausforderungen: string[];
  tags: string[];
  lieblingsfarbe: string | null;
  lieblingstier: string | null;
}

export interface ProfilEventInput {
  feld: string;
  aktion: "added" | "removed" | "changed";
  wert: string;
  alterWert?: string;
}

export interface ProfilEventRow {
  id: string;
  feld: string;
  aktion: string;
  wert: string;
  alterWert: string | null;
  createdAt: Date | string;
}

// --- Diff computation ---

const ARRAY_FIELDS: (keyof ProfileLike)[] = [
  "interessen",
  "charaktereigenschaften",
  "herausforderungen",
  "tags",
];

// lieblingsfarbe + lieblingstier removed — deprecated, no longer tracked
const SCALAR_FIELDS: (keyof ProfileLike)[] = [];

/**
 * Compare old and new profile, return list of atomic change events.
 * Skips identity fields (name, geburtsdatum, geschlecht).
 */
export function computeProfileDiff(
  oldProfile: ProfileLike,
  newProfile: ProfileLike
): ProfilEventInput[] {
  const events: ProfilEventInput[] = [];

  // Array fields: set comparison
  for (const field of ARRAY_FIELDS) {
    const oldSet = new Set(oldProfile[field] as string[]);
    const newSet = new Set(newProfile[field] as string[]);

    for (const val of newSet) {
      if (!oldSet.has(val)) {
        events.push({ feld: field, aktion: "added", wert: val });
      }
    }
    for (const val of oldSet) {
      if (!newSet.has(val)) {
        events.push({ feld: field, aktion: "removed", wert: val });
      }
    }
  }

  // Scalar fields: simple comparison
  for (const field of SCALAR_FIELDS) {
    const oldVal = (oldProfile[field] as string | null) || "";
    const newVal = (newProfile[field] as string | null) || "";
    if (oldVal !== newVal && (oldVal || newVal)) {
      events.push({
        feld: field,
        aktion: "changed",
        wert: newVal || "(leer)",
        alterWert: oldVal || "(leer)",
      });
    }
  }

  return events;
}

// --- Prompt builder ---

const FELD_LABELS: Record<string, string> = {
  interessen: "Interessen",
  charaktereigenschaften: "Charakter",
  herausforderungen: "Herausforderungen",
  tags: "Persönliche Themen",
};

/**
 * Build a German-language prompt section describing the listener's evolution.
 * Used in buildStoryPrompt() to give story characters awareness of growth.
 *
 * Only includes events from the last 90 days, max 15.
 * Deleted events won't exist in DB → automatically excluded.
 */
export function buildProfileEvolution(
  name: string,
  events: ProfilEventRow[]
): string {
  if (events.length === 0) return "";

  // Categorize events
  const resolved: string[] = [];
  const processedTags: string[] = [];
  const newInterests: string[] = [];
  const newTraits: string[] = [];
  const newChallenges: string[] = [];
  const scalarChanges: string[] = [];

  for (const e of events) {
    if (e.feld === "herausforderungen" && e.aktion === "removed") {
      resolved.push(e.wert);
    } else if (e.feld === "herausforderungen" && e.aktion === "added") {
      newChallenges.push(e.wert);
    } else if (e.feld === "tags" && e.aktion === "removed") {
      processedTags.push(e.wert);
    } else if (e.feld === "interessen" && e.aktion === "added") {
      newInterests.push(e.wert);
    } else if (e.feld === "charaktereigenschaften" && e.aktion === "added") {
      newTraits.push(e.wert);
    } else if (e.aktion === "changed") {
      const label = FELD_LABELS[e.feld] || e.feld;
      scalarChanges.push(`${label}: ${e.alterWert} → ${e.wert}`);
    }
  }

  // Build prompt section — only include non-empty categories
  const lines: string[] = [];

  if (resolved.length > 0) {
    lines.push(`- Überwundene Herausforderungen: ${resolved.join(", ")} — das zeigt echtes Wachstum!`);
  }
  if (processedTags.length > 0) {
    lines.push(`- Verarbeitete Themen: ${processedTags.join(", ")} — nicht mehr aktuell`);
  }
  if (newInterests.length > 0) {
    lines.push(`- Neue Interessen: ${newInterests.join(", ")}`);
  }
  if (newTraits.length > 0) {
    lines.push(`- Neue Stärken: ${newTraits.join(", ")}`);
  }
  if (newChallenges.length > 0) {
    lines.push(`- Aktuelle neue Herausforderungen: ${newChallenges.join(", ")}`);
  }
  if (scalarChanges.length > 0) {
    lines.push(`- Änderungen: ${scalarChanges.join("; ")}`);
  }

  if (lines.length === 0) return "";

  return `
ENTWICKLUNG VON ${name.toUpperCase()} (letzte Wochen):
${lines.join("\n")}

Nutze diese Entwicklung SUBTIL und nur wenn es NATÜRLICH passt:
- Bei überwundenen Herausforderungen: "Du hast so viel gelernt..." oder "Erinnerst du dich, als..."
- Bei neuen Interessen: Baue sie natürlich in die Handlung ein
- NIEMALS belehrend oder bewertend — immer ermutigend und warmherzig`;
}

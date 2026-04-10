/**
 * KoalaTree Studio — Story Generator
 *
 * Generic story generation from a StoryBrief.
 * Used by:
 * - Studio Engine UI (manual brief input)
 * - Kids App (brief built from child profile + format selection)
 * - Future: Public API for third parties
 *
 * The generator is intentionally source-agnostic — it doesn't know
 * or care where the brief came from.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Story Brief (Generic Input) ───────────────────────────────────

export interface StoryBrief {
  // Core
  title?: string;              // Optional pre-set title
  theme: string;               // "Ein Koala lernt mutig zu sein", "Freundschaft im Wald"
  tone: StoryTone;             // Overall feeling
  length: StoryLength;

  // Characters
  characters: BriefCharacter[];
  narratorId?: string;         // Which character narrates (default: first lead)

  // Audience
  audience?: {
    name?: string;             // Listener name (for personalization)
    age?: number;              // Affects vocabulary + complexity
    gender?: "m" | "w" | "d";
    interests?: string[];      // "Dinosaurier", "Weltraum", "Pferde"
  };

  // Creative direction
  setting?: string;            // "Magischer Wald", "Unterwasserwelt", "Weltraum"
  pedagogicalGoal?: string;    // "Mut", "Selbstbewusstsein", "Einschlafen"
  specialInstructions?: string; // Free-form creative direction
  language?: string;           // "de" | "en" (default: "de")

  // KoalaTree-specific (optional, ignored by generic engine)
  format?: string;             // "traumreise", "abenteuer", etc.
  kindProfilId?: string;       // Reference to kids app profile
}

export interface BriefCharacter {
  id: string;
  name: string;
  markerId: string;            // "[KODA]"
  role: "lead" | "supporting" | "narrator" | "minor";
  personality?: string;        // "weise und geduldig", "frech und keck"
  species?: string;            // "Koala", "Eule"
  speakingStyle?: string;      // "langsam und bedaechtig", "schnell und aufgeregt"
}

export type StoryTone =
  | "warm"         // Warm, geborgen (default)
  | "adventurous"  // Aufregend, spannend
  | "calming"      // Beruhigend, zum Einschlafen
  | "funny"        // Lustig, albern
  | "dramatic"     // Dramatisch, emotional
  | "educational"  // Lehrreich, wissensvermittelnd
  | "reflective";  // Nachdenklich, philosophisch

export type StoryLength =
  | "short"        // ~2-3 min (~300-500 Woerter)
  | "medium"       // ~5-7 min (~800-1200 Woerter)
  | "long";        // ~10-15 min (~1500-2500 Woerter)

// ── Story Generation Result ───────────────────────────────────────

export interface StoryResult {
  title: string;
  text: string;                // Full story with character markers
  wordCount: number;
  estimatedDurationSec: number;
  characters: string[];        // Character IDs found in text
  language: string;
}

// ── Word count targets ────────────────────────────────────────────

const LENGTH_TARGETS: Record<StoryLength, { min: number; max: number; label: string }> = {
  short:  { min: 300,  max: 500,  label: "kurz (2-3 Minuten)" },
  medium: { min: 800,  max: 1200, label: "mittel (5-7 Minuten)" },
  long:   { min: 1500, max: 2500, label: "lang (10-15 Minuten)" },
};

const TONE_DESCRIPTIONS: Record<StoryTone, string> = {
  warm: "Warm, geborgen, liebevoll. Wie eine Umarmung.",
  adventurous: "Aufregend, spannend, voller Ueberraschungen. Tempo wechselt zwischen Action und ruhigen Momenten.",
  calming: "Sehr ruhig, sanft, beruhigend. Langsame Saetze, viel Atmosphaere. Perfekt zum Einschlafen.",
  funny: "Lustig, verspielt, mit Wortwitzen und ueberraschenden Wendungen.",
  dramatic: "Emotional, dramatisch, mit Hoehen und Tiefen. Starke Gefuehle.",
  educational: "Lehrreich aber unterhaltsam. Vermittelt Wissen spielerisch.",
  reflective: "Nachdenklich, philosophisch, tiefgruendig. Laesst Raum zum Nachdenken.",
};

// ── Build the Generation Prompt ───────────────────────────────────

function buildSystemPrompt(brief: StoryBrief): string {
  const lang = brief.language || "de";
  const isGerman = lang === "de";
  const target = LENGTH_TARGETS[brief.length];
  const toneDesc = TONE_DESCRIPTIONS[brief.tone];

  const charDescriptions = brief.characters.map((c) => {
    const parts = [`${c.markerId} = ${c.name}`];
    if (c.species) parts.push(`(${c.species})`);
    if (c.role === "lead") parts.push("— Hauptcharakter");
    if (c.role === "narrator") parts.push("— Erzaehler");
    if (c.personality) parts.push(`— ${c.personality}`);
    if (c.speakingStyle) parts.push(`Spricht: ${c.speakingStyle}`);
    return parts.join(" ");
  }).join("\n");

  // Adapt persona based on whether characters are provided
  const hasCharacters = brief.characters.length > 0;
  const persona = brief.audience?.age && brief.audience.age <= 12
    ? "Du bist ein preisgekroenter Kinderbuch-Autor und Geschichtenerzaehler.\nDu schreibst Geschichten die Kinder UND Erwachsene beruehren."
    : "Du bist ein preisgekroenter Drehbuchautor und Geschichtenerzaehler.\nDu schreibst packende, emotionale Geschichten fuer Film und Audio.";

  // Narrator marker
  const narratorMarker = brief.narratorId
    ? brief.characters.find((c) => c.id === brief.narratorId)?.markerId || "[ERZAEHLER]"
    : brief.characters.find((c) => c.role === "lead" || c.role === "narrator")?.markerId || "[ERZAEHLER]";

  return `${persona}

## AUFGABE
Schreibe eine ${isGerman ? "Geschichte" : "story"} basierend auf dem Brief des Users.

## FORMAT-REGELN (KRITISCH!)

### Charakter-Marker
${hasCharacters ? `Diese Charaktere stehen zur Verfuegung:\n${charDescriptions}\n\nDu darfst auch WEITERE Charaktere einfuehren wenn es zur Geschichte passt.` : `Erfinde passende Charaktere fuer die Geschichte. Gib jedem Charakter einen Namen und verwende Marker im Format [NAME_GROSSBUCHSTABEN] (z.B. [FAHRER], [ARZT], [MECHANIKER]).`}
Verwende fuer jeden Charakter den Marker [NAME_GROSSBUCHSTABEN].
Jeder Charakter braucht eine eigene Stimme und Persoenlichkeit.

[SFX:beschreibung] = Soundeffekt (z.B. [SFX:Motor heult auf], [SFX:Explosion], [SFX:Sirene])
[AMBIENCE:beschreibung] = Hintergrundatmosphaere (1x am Anfang, z.B. [AMBIENCE:Rennstrecke mit Zuschauern])
[PAUSE] = Kurze Pause (1 Sekunde)
[ATEMPAUSE] = Laengere Pause (2 Sekunden, bei emotionalen Momenten)

### Marker-Regeln
- JEDER Sprecherwechsel bekommt einen neuen Marker
- Erzaehltext bekommt den Marker des Erzaehlers (${narratorMarker})
- Dialog-Text ist DIREKTE REDE ohne Anfuehrungszeichen
- KEIN "sagte er", KEIN "fluesterte sie" — der Marker reicht
- [SFX] kommt VOR dem Satz den es begleitet
- [PAUSE] nach emotionalen Momenten oder vor Pointen

## STIMMUNG
${toneDesc}

## LAENGE
${target.label}: ${target.min}-${target.max} Woerter.
${brief.length === "short" ? "Komm schnell zum Punkt. Wenige Szenen, ein klarer Handlungsbogen." : ""}
${brief.length === "long" ? "Nimm dir Zeit fuer Atmosphaere, Dialoge und Charakter-Entwicklung." : ""}

## SPRACHE
${isGerman ? "Deutsch" : "English"}. ${brief.audience?.age ? `Zielgruppe: ${brief.audience.age} Jahre — passe Vokabular und Komplexitaet an.` : ""}
${brief.audience?.age && brief.audience.age <= 4 ? "Sehr einfache Saetze. Wiederholungen sind gut. Max 8-10 Woerter pro Satz." : ""}
${brief.audience?.age && brief.audience.age >= 8 ? "Komplexere Satzstrukturen erlaubt. Metaphern und Wortspiele sind willkommen." : ""}

## QUALITAETS-REGELN
- Zeige, erzaehle nicht (show don't tell)
- Jeder Charakter hat eine EIGENE Stimme und Persoenlichkeit
- Baue einen klaren Spannungsbogen: Einfuehrung → Konflikt → Hoehepunkt → Loesung
- Schreibe so, dass man beim Zuhoeren Bilder im Kopf sieht
- KEIN Meta-Text, KEINE Regieanweisungen, NUR die Geschichte
- Beginne DIREKT mit der Geschichte (kein "Es war einmal" es sei denn es passt)`;
}

function buildUserPrompt(brief: StoryBrief): string {
  const parts: string[] = [];

  parts.push(`## Thema\n${brief.theme}`);

  if (brief.setting) {
    parts.push(`## Setting\n${brief.setting}`);
  }

  if (brief.audience?.name) {
    parts.push(`## Personalisierung\nDas Kind heisst ${brief.audience.name}${brief.audience.age ? ` und ist ${brief.audience.age} Jahre alt` : ""}.${brief.audience.interests?.length ? ` Interessen: ${brief.audience.interests.join(", ")}.` : ""}`);
  }

  if (brief.pedagogicalGoal) {
    parts.push(`## Paedagogisches Ziel\n${brief.pedagogicalGoal} — vermittle dies subtil durch die Handlung, nicht durch Belehrung.`);
  }

  if (brief.specialInstructions) {
    parts.push(`## Besondere Anweisungen\n${brief.specialInstructions}`);
  }

  parts.push("Schreibe jetzt die Geschichte. Nur den Text, keine Kommentare.");

  return parts.join("\n\n");
}

// ── Generate Story ────────────────────────────────────────────────

export async function generateStory(
  brief: StoryBrief,
  onProgress?: (chunk: string) => void,
): Promise<StoryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

  const client = new Anthropic({ apiKey });

  const system = buildSystemPrompt(brief);
  const user = buildUserPrompt(brief);

  let fullText = "";

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      onProgress?.(event.delta.text);
    }
  }

  // Generate title if not provided
  let title = brief.title || "";
  if (!title) {
    const titleResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 50,
      messages: [{
        role: "user",
        content: `Gib dieser Geschichte einen kurzen, poetischen Titel (max 6 Woerter, keine Anfuehrungszeichen):\n\n${fullText.slice(0, 500)}`,
      }],
    });
    title = titleResponse.content[0].type === "text"
      ? titleResponse.content[0].text.trim()
      : "Unbenannt";
  }

  // Extract character IDs from text
  const markerRegex = /\[([A-Z_]+)\]/g;
  const foundMarkers = new Set<string>();
  let match;
  while ((match = markerRegex.exec(fullText)) !== null) {
    if (!["SFX", "AMBIENCE", "PAUSE", "ATEMPAUSE"].includes(match[1])) {
      foundMarkers.add(match[1]);
    }
  }
  const characterIds = brief.characters
    .filter((c) => foundMarkers.has(c.markerId.replace(/[\[\]]/g, "")))
    .map((c) => c.id);

  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  return {
    title,
    text: fullText.trim(),
    wordCount,
    estimatedDurationSec: Math.ceil(wordCount / 2.5),
    characters: characterIds,
    language: brief.language || "de",
  };
}

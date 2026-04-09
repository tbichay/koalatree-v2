/**
 * KoalaTree Studio — Character Extractor
 *
 * Analyzes a story text and extracts character definitions:
 * - Name, species, personality from context
 * - Speaking role (lead, supporting, minor)
 * - Suggested visual description for portrait generation
 * - Suggested voice characteristics
 */

import Anthropic from "@anthropic-ai/sdk";
import { CHARACTERS } from "@/lib/types";
import type { StudioCharacterDef } from "./types";

const anthropic = new Anthropic();

/** Known KoalaTree characters — auto-assign portraits and voice IDs */
const KNOWN_CHARACTERS: Record<string, { portraitUrl: string; voiceId: string; emoji: string }> = {};
for (const [id, char] of Object.entries(CHARACTERS)) {
  KNOWN_CHARACTERS[id] = { portraitUrl: char.portrait, voiceId: char.voiceId, emoji: char.emoji };
}

/**
 * Extract character definitions from a story text.
 * Uses AI to analyze character traits from dialog and narrative.
 */
export async function extractCharacters(storyText: string): Promise<StudioCharacterDef[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `Du analysierst Geschichten und extrahierst Charakter-Definitionen.
Fuer jeden Charakter-Marker [NAME] im Text, erstelle eine Charakter-Definition.

Antworte NUR mit JSON — ein Array von Charakter-Objekten.`,
    messages: [{
      role: "user",
      content: `Analysiere diese Geschichte und extrahiere die Charaktere:

${storyText}

Pro Charakter:
{
  "name": "Anzeige-Name",
  "markerId": "[MARKER]",
  "description": "Visuelle Beschreibung fuer Portrait-Generierung (detailliert, 2-3 Saetze)",
  "personality": "Persoenlichkeit und Sprechstil (1-2 Saetze)",
  "species": "Tierart oder 'Mensch'",
  "role": "lead" | "supporting" | "minor",
  "emoji": "Passendes Emoji",
  "voiceHint": "Beschreibung der idealen Stimme (Alter, Ton, Tempo)"
}`,
    }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  const rawMatch = text.match(/\[[\s\S]*\]/);
  const jsonStr = codeBlockMatch?.[1] || rawMatch?.[0];

  if (!jsonStr) throw new Error("Character extraction failed: no valid JSON");

  const raw = JSON.parse(jsonStr) as Array<Record<string, string>>;

  return raw.map((c, i) => {
    // Auto-assign known KoalaTree character data
    const knownId = (c.name || "").toLowerCase();
    const known = KNOWN_CHARACTERS[knownId];

    return {
      id: `char-${i}`,
      name: c.name || `Charakter ${i + 1}`,
      markerId: c.markerId || `[CHAR${i + 1}]`,
      description: c.description || "",
      personality: c.personality || "",
      species: c.species || "",
      role: (c.role as StudioCharacterDef["role"]) || "supporting",
      emoji: known?.emoji || c.emoji || "🎭",
      color: undefined,
      portraitUrl: known?.portraitUrl,
      voiceId: known?.voiceId,
      voiceSettings: undefined,
    };
  });
}

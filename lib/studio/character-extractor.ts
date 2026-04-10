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
import { list } from "@vercel/blob";
import { CHARACTERS } from "@/lib/types";
import { loadReferences } from "@/lib/references";
import type { StudioCharacterDef } from "./types";
import type { CharacterVoiceSettings } from "@/lib/types";

const anthropic = new Anthropic();

/** Voice presets for auto-assignment based on character type */
const VOICE_PRESETS: Record<string, { voiceId: string; voiceSettings: CharacterVoiceSettings }> = {
  male_adult: {
    voiceId: "IeQubAjK1ujbppIdhJw4", // Markus - dynamic, energetic
    voiceSettings: { stability: 0.35, similarity_boost: 0.75, style: 0.60, use_speaker_boost: true, speed: 1.0 },
  },
  female_adult: {
    voiceId: "HVqeRiiDmMNf0O9hGdSN", // Custom female
    voiceSettings: { stability: 0.40, similarity_boost: 0.70, style: 0.50, use_speaker_boost: true, speed: 0.95 },
  },
  male_old: {
    voiceId: "dFA3XRddYScy6ylAYTIO", // Helmut - warm, deep
    voiceSettings: { stability: 0.50, similarity_boost: 0.65, style: 0.45, use_speaker_boost: true, speed: 0.85 },
  },
  male_young: {
    voiceId: "njAr83fGD1mgwXYCZL48", // Robert - bright, curious
    voiceSettings: { stability: 0.40, similarity_boost: 0.80, style: 0.65, use_speaker_boost: true, speed: 1.05 },
  },
  female_young: {
    voiceId: "zndmYEEoWWxRYyEL2ZZY", // Lumi - playful
    voiceSettings: { stability: 0.38, similarity_boost: 0.80, style: 0.70, use_speaker_boost: false, speed: 1.0 },
  },
  narrator: {
    voiceId: "dFA3XRddYScy6ylAYTIO", // Deep narrator
    voiceSettings: { stability: 0.55, similarity_boost: 0.65, style: 0.40, use_speaker_boost: true, speed: 0.90 },
  },
};

/** Known KoalaTree characters — auto-assign portraits and voice IDs */
const KNOWN_CHARACTERS: Record<string, { portraitUrl: string; voiceId: string; emoji: string }> = {};
for (const [id, char] of Object.entries(CHARACTERS)) {
  KNOWN_CHARACTERS[id] = { portraitUrl: char.portrait, voiceId: char.voiceId, emoji: char.emoji };
}

/** Resolve a Blob storage path to its HTTP URL */
async function resolveBlobUrl(blobPath: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: blobPath, limit: 1 });
    return blobs[0]?.url || null;
  } catch { return null; }
}

/** Load primary portrait URLs from the references system (StudioSettings) */
async function loadPrimaryPortraits(): Promise<Record<string, string>> {
  const refs = await loadReferences();
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(refs)) {
    if (!key.startsWith("portrait:")) continue;
    const charId = key.replace("portrait:", "");
    if (entry.primary) {
      const url = await resolveBlobUrl(entry.primary);
      if (url) result[charId] = url;
    }
  }

  return result;
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
  "voiceType": "male_adult" | "female_adult" | "male_old" | "male_young" | "female_young" | "narrator",
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

  // Load primary portraits from references system (StudioSettings)
  const primaryPortraits = await loadPrimaryPortraits();

  return raw.map((c, i) => {
    // Auto-assign known KoalaTree character data
    const knownId = (c.name || "").toLowerCase();
    const known = KNOWN_CHARACTERS[knownId];

    // Priority: References system portrait > static portrait
    const portraitUrl = primaryPortraits[knownId] || known?.portraitUrl;

    // Auto-assign voice from AI voiceType hint
    const voiceType = (c.voiceType as string) || "narrator";
    const voicePreset = VOICE_PRESETS[voiceType] || VOICE_PRESETS.narrator;

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
      portraitUrl,
      voiceId: known?.voiceId || voicePreset.voiceId,
      voiceSettings: voicePreset.voiceSettings,
    };
  });
}

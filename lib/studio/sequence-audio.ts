/**
 * Studio V2 — Sequence Audio Generator
 *
 * Generates audio for a single sequence by:
 * 1. Building marked story text from screenplay scenes
 * 2. Calling the multi-voice audio pipeline
 * 3. Returning audio buffer + timeline with scene timing
 *
 * Supports both KoalaTree characters (from CHARACTERS map)
 * and custom characters (with voiceId + voiceSettings from DB).
 */

import { CHARACTERS, CharacterVoiceSettings, StorySegment } from "@/lib/types";
import { cleanSegmentForTTS } from "@/lib/story-parser";
import type { StudioScene } from "./types";

// Re-use the internal TTS generation from elevenlabs
// We can't import generateSegmentAudio directly (it's private),
// so we export a new function from here that handles V2 characters.

export interface SequenceCharacter {
  id: string;
  name: string;
  markerId: string;       // "[KODA]"
  voiceId?: string;
  voiceSettings?: CharacterVoiceSettings;
}

export interface SequenceAudioResult {
  mp3Buffer: ArrayBuffer;
  timeline: { characterId: string; startMs: number; endMs: number }[];
  durationMs: number;
  sceneTiming: { sceneId: string; startMs: number; endMs: number }[];
}

/**
 * Build marked story text from screenplay scenes.
 * Output format: [MARKER] spoken text [SFX:...] etc.
 * This format is compatible with the existing story parser.
 */
export function buildMarkedTextFromScenes(
  scenes: StudioScene[],
  characters: SequenceCharacter[],
): string {
  const charMap = new Map(characters.map((c) => [c.id, c]));
  const parts: string[] = [];

  for (const scene of scenes) {
    if (scene.type === "intro" || scene.type === "outro") continue;

    if (scene.type === "landscape" || scene.type === "transition") {
      // Landscape scenes might have ambient atmosphere
      // No speech, but may add a pause
      if (scene.spokenText) {
        // Narrator speaks over landscape
        parts.push("[KODA]");
        parts.push(scene.spokenText);
      }
      continue;
    }

    // Dialog scene
    if (scene.characterId && scene.spokenText) {
      const char = charMap.get(scene.characterId);
      if (char) {
        // Use the marker (e.g., [KODA], [KIKI], or custom [CUSTOM_NAME])
        parts.push(char.markerId);
      } else {
        // Fallback to narrator
        parts.push("[KODA]");
      }
      parts.push(scene.spokenText);
    }
  }

  return parts.join("\n");
}

/**
 * Convert screenplay scenes to StorySegments for the audio pipeline.
 * This is more precise than text parsing — we know exactly which
 * character speaks in each scene.
 */
export function scenesToSegments(
  scenes: StudioScene[],
  characters: SequenceCharacter[],
): StorySegment[] {
  // Primary lookup by ID (handles both CUID and char-N formats)
  const charMap = new Map(characters.map((c) => [c.id, c]));
  // Secondary lookup by markerId (e.g. "[KODA]" → character) for screenplay char references
  const markerMap = new Map(characters.map((c) => [c.markerId, c]));
  // Tertiary lookup by name (lowercase) for legacy references
  const nameMap = new Map(characters.map((c) => [c.name.toLowerCase(), c]));

  const segments: StorySegment[] = [];

  for (const scene of scenes) {
    if (scene.type === "intro" || scene.type === "outro") continue;

    if (scene.spokenText) {
      // Try multiple lookup strategies to find the character
      const char = scene.characterId
        ? (charMap.get(scene.characterId)
          || markerMap.get(scene.characterId)
          || nameMap.get(scene.characterId.toLowerCase()))
        : null;

      // Map character to the ID the audio pipeline knows
      let characterId: string;
      if (char) {
        // Check if this is a known KoalaTree character
        const knownId = char.name.toLowerCase();
        if (CHARACTERS[knownId]) {
          characterId = knownId;
        } else {
          // Custom character — use their DB ID (CUID) for voice override matching
          characterId = char.id;
        }
      } else {
        characterId = "koda"; // narrator fallback
      }

      segments.push({
        type: "speech",
        characterId,
        text: scene.spokenText,
        emotion: scene.emotion,
      });
    }
  }

  return segments;
}

/**
 * Register custom character voices so the audio pipeline can find them.
 * This sets temporary environment variables for the TTS function.
 *
 * For known characters (koda, kiki, etc.) the voiceId comes from env vars.
 * For custom characters, we need to make their voiceId available.
 */
export function registerCustomVoices(characters: SequenceCharacter[]): Map<string, { voiceId: string; settings: CharacterVoiceSettings }> {
  const customVoices = new Map<string, { voiceId: string; settings: CharacterVoiceSettings }>();

  for (const char of characters) {
    const knownId = char.name.toLowerCase();
    if (CHARACTERS[knownId]) continue; // Known character, uses env vars

    if (char.voiceId && char.voiceSettings) {
      customVoices.set(char.id, {
        voiceId: char.voiceId,
        settings: char.voiceSettings,
      });
    }
  }

  return customVoices;
}

/**
 * Calculate scene timing from the audio timeline.
 * Maps each scene's spoken text to the corresponding timeline entries.
 */
export function calculateSceneTiming(
  scenes: StudioScene[],
  timeline: { characterId: string; startMs: number; endMs: number }[],
): { sceneId: string; startMs: number; endMs: number }[] {
  const result: { sceneId: string; startMs: number; endMs: number }[] = [];
  let timelineIdx = 0;

  for (const scene of scenes) {
    if (!scene.spokenText || scene.type === "intro" || scene.type === "outro") {
      // No audio — keep existing timing or set to 0
      result.push({ sceneId: scene.id, startMs: scene.audioStartMs || 0, endMs: scene.audioEndMs || 0 });
      continue;
    }

    if (timelineIdx < timeline.length) {
      const entry = timeline[timelineIdx];
      result.push({ sceneId: scene.id, startMs: entry.startMs, endMs: entry.endMs });
      timelineIdx++;
    } else {
      result.push({ sceneId: scene.id, startMs: 0, endMs: 0 });
    }
  }

  // Handle landscape scenes that occur during speech — place them between dialog entries
  // For now, landscape scenes without speech get timing from surrounding scenes
  for (let i = 0; i < result.length; i++) {
    if (result[i].startMs === 0 && result[i].endMs === 0 && i > 0) {
      // Use previous scene's end time as start
      result[i].startMs = result[i - 1].endMs;
      // Use next scene's start time as end (or add 3 seconds for landscape)
      const nextWithAudio = result.slice(i + 1).find((r) => r.endMs > 0);
      result[i].endMs = nextWithAudio ? nextWithAudio.startMs : result[i].startMs + 3000;
    }
  }

  return result;
}

/**
 * Verify that all characters with spoken text have voice configuration.
 * Returns missing character names if any.
 */
export function validateVoiceConfig(
  scenes: StudioScene[],
  characters: SequenceCharacter[],
): string[] {
  const charMap = new Map(characters.map((c) => [c.id, c]));
  const missing: string[] = [];

  for (const scene of scenes) {
    if (!scene.spokenText || !scene.characterId) continue;
    const char = charMap.get(scene.characterId);
    if (!char) continue;

    const knownId = char.name.toLowerCase();
    if (CHARACTERS[knownId]) continue; // Known character, has voice

    if (!char.voiceId) {
      if (!missing.includes(char.name)) {
        missing.push(char.name);
      }
    }
  }

  return missing;
}

/**
 * Estimate audio duration from scene text (before generation).
 */
export function estimateAudioDuration(scenes: StudioScene[]): number {
  let totalWords = 0;
  for (const scene of scenes) {
    if (scene.spokenText) {
      totalWords += cleanSegmentForTTS(scene.spokenText)?.split(/\s+/).filter(Boolean).length || 0;
    }
  }
  // ~2.5 words per second for German, plus gaps
  return Math.ceil(totalWords / 2.5) + scenes.length * 0.35;
}

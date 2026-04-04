import { StorySegment } from "./types";

const CHARACTER_MARKER = /\[(KODA|KIKI|LUNA|MIKA|PIP|SAGE|NUKI)\]/g;
const SFX_MARKER = /\[SFX:([^\]]+)\]/g;
const AMBIENCE_MARKER = /\[AMBIENCE:([^\]]+)\]/g;
const ALL_MARKERS = /\[(KODA|KIKI|LUNA|MIKA|PIP|SAGE|NUKI|SFX:[^\]]+|AMBIENCE:[^\]]+)\]/g;

/**
 * Parst den generierten Story-Text in Segmente für Multi-Voice Audio.
 *
 * Marker-Format:
 * - [KODA] = Koda spricht (bis zum nächsten Marker)
 * - [KIKI] = Kiki spricht (bis zum nächsten Marker)
 * - [SFX:description] = Soundeffekt
 * - [PAUSE], [ATEMPAUSE] bleiben innerhalb der Segmente erhalten
 */
export function parseStorySegments(rawText: string): StorySegment[] {
  const segments: StorySegment[] = [];

  // Finde alle Marker-Positionen
  const markers: { type: "speech" | "sfx" | "ambience"; value: string; index: number; length: number }[] = [];

  let match: RegExpExecArray | null;

  // Character markers
  const charRegex = /\[(KODA|KIKI|LUNA|MIKA|PIP|SAGE|NUKI)\]/g;
  while ((match = charRegex.exec(rawText)) !== null) {
    markers.push({
      type: "speech",
      value: match[1].toLowerCase(),
      index: match.index,
      length: match[0].length,
    });
  }

  // SFX markers
  const sfxRegex = /\[SFX:([^\]]+)\]/g;
  while ((match = sfxRegex.exec(rawText)) !== null) {
    markers.push({
      type: "sfx",
      value: match[1].trim(),
      index: match.index,
      length: match[0].length,
    });
  }

  // Ambience markers
  const ambienceRegex = /\[AMBIENCE:([^\]]+)\]/g;
  while ((match = ambienceRegex.exec(rawText)) !== null) {
    markers.push({
      type: "ambience" as "speech" | "sfx",
      value: match[1].trim(),
      index: match.index,
      length: match[0].length,
    });
  }

  // Sortiere nach Position
  markers.sort((a, b) => a.index - b.index);

  // Text vor dem ersten Marker → default zu Koda
  if (markers.length === 0) {
    const trimmed = rawText.trim();
    if (trimmed) {
      segments.push({ type: "speech", characterId: "koda", text: trimmed });
    }
    return segments;
  }

  const beforeFirst = rawText.slice(0, markers[0].index).trim();
  if (beforeFirst) {
    segments.push({ type: "speech", characterId: "koda", text: beforeFirst });
  }

  // Verarbeite jeden Marker
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];
    const textStart = marker.index + marker.length;
    const textEnd = nextMarker ? nextMarker.index : rawText.length;
    const text = rawText.slice(textStart, textEnd).trim();

    if (marker.type === "ambience") {
      segments.push({
        type: "ambience",
        ambiencePrompt: marker.value,
        text: marker.value,
      });
    } else if (marker.type === "sfx") {
      segments.push({
        type: "sfx",
        sfxPrompt: marker.value,
        text: marker.value,
      });
      // Text nach SFX ohne folgenden Character-Marker:
      // Nur als Speech übernehmen wenn es echter deutscher Text ist (nicht geleakte SFX-Beschreibung)
      if (text && (!nextMarker || nextMarker.type === "sfx")) {
        const isLikelyGermanText = text.length > 10 && /[äöüßÄÖÜ]/.test(text);
        if (isLikelyGermanText) {
          const lastSpeaker = findLastSpeaker(segments);
          segments.push({ type: "speech", characterId: lastSpeaker, text });
        }
      }
    } else {
      // Speech marker
      if (text) {
        segments.push({
          type: "speech",
          characterId: marker.value,
          text,
        });
      }
    }
  }

  return segments;
}

function findLastSpeaker(segments: StorySegment[]): string {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === "speech" && segments[i].characterId) {
      return segments[i].characterId!;
    }
  }
  return "koda";
}

/**
 * Bereinigt Segment-Text für die TTS-Engine.
 * Wandelt [PAUSE] in Ellipsen um und entfernt alle anderen Marker.
 */
export function cleanSegmentForTTS(text: string): string {
  return text
    // Lach-Wörter in natürlichere Phoneme umwandeln (ElevenLabs kann "Ha ha!" besser als "Hihi!")
    .replace(/\bHihi\b!?/gi, "Ha ha!")
    .replace(/\bHaha\b!?/gi, "Ha ha ha!")
    .replace(/\bHehe\b!?/gi, "He he!")
    .replace(/\bHoho\b!?/gi, "Ho ho ho!")
    // Marker in Pausen/Stille umwandeln
    .replace(/\[ATEMPAUSE\]/g, "... ... ...")
    .replace(/\[PAUSE\]/g, "... ...")
    .replace(/\[LANGSAM\]/g, "")
    .replace(/\[DANKBARKEIT\]/g, "")
    .replace(/\[KOALA\]/g, "")
    .replace(/\[(KODA|KIKI|LUNA|MIKA|PIP|SAGE|NUKI)\]/g, "")
    .replace(/\[SFX:[^\]]+\]/g, "")
    .replace(/\[AMBIENCE:[^\]]+\]/g, "")
    .replace(/\*[^*]+\*/g, "")          // *action descriptions* entfernen
    .replace(/\([^)]*lacht[^)]*\)/gi, "") // (lacht), (kichert) etc. entfernen
    .replace(/\([^)]*kicher[^)]*\)/gi, "")
    .trim();
}

/**
 * Parst Text für die Display-Ansicht — gibt Segmente mit Charakter-Zuordnung zurück.
 */
export function parseForDisplay(rawText: string): {
  type: "speech" | "sfx" | "pause";
  characterId?: string;
  text: string;
}[] {
  const segments = parseStorySegments(rawText);
  const displaySegments: { type: "speech" | "sfx" | "pause"; characterId?: string; text: string }[] = [];

  for (const segment of segments) {
    if (segment.type === "sfx") {
      displaySegments.push({ type: "sfx", text: segment.sfxPrompt || segment.text });
      continue;
    }

    // Splitte Speech-Segments an [PAUSE] Markern für visuelle Pausen
    const parts = segment.text.split(/\[(?:PAUSE|ATEMPAUSE)\]/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
        .replace(/\[LANGSAM\]/g, "")
        .replace(/\[DANKBARKEIT\]/g, "")
        .trim();

      if (part) {
        displaySegments.push({
          type: "speech",
          characterId: segment.characterId,
          text: part,
        });
      }
      // Füge Pause zwischen Parts ein (nicht nach dem letzten)
      if (i < parts.length - 1) {
        displaySegments.push({ type: "pause", text: "" });
      }
    }
  }

  return displaySegments;
}

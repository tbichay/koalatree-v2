/**
 * KoalaTree Studio — Screenplay Generator
 *
 * Takes a basis storyboard (story beats) and generates a full film screenplay:
 * - Detects location changes → creates sequences
 * - Adds camera directions, transitions, landscape scenes
 * - Applies directing style and atmosphere
 * - Optimizes timing for video (shorter clips, visual storytelling)
 *
 * This is the "AI Director" for V2 — replaces the V1 video-director.ts
 * for new studio projects.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getDirectingStylePrompt, ATMOSPHERE_PRESETS } from "../directing-styles";
import type { BasisStoryboard, Screenplay, ScreenplaySequence, StudioScene, StudioCharacterDef } from "./types";

const anthropic = new Anthropic();

/** Location reference from Library */
export interface LocationRef {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  tags: string[];
}

interface ScreenplayOptions {
  storyboard: BasisStoryboard;
  characters: StudioCharacterDef[];
  directingStyle?: string;
  atmosphere?: string;
  atmospherePreset?: string;
  stylePrompt?: string;
  targetFormat?: "portrait" | "wide";
  targetDurationSec?: number; // Target film duration in seconds (e.g. 20, 60, 300, 1200)
  mode?: "film" | "hoerspiel" | "audiobook";
  /** Available locations from Library — AI will reference these in the screenplay */
  locations?: LocationRef[];
  /** Available props from Library — AI will reference these in the screenplay */
  props?: { id: string; name: string; description: string }[];
}

const SCREENPLAY_SYSTEM = `Du bist ein preisgekroenter Film-Regisseur und Drehbuch-Autor.
Du erhaelst Story-Beats und erstellst daraus ein professionelles Film-Drehbuch.

## Deine Aufgabe

Aus den Story-Beats erstellst du:
1. **Sequenzen**: Gruppen von Szenen am gleichen Ort mit gleicher Atmosphaere
2. **Szenen**: Einzelne Kamera-Einstellungen mit DETAILLIERTEN Regie-Anweisungen

## Sequenzen erkennen

Eine neue Sequenz beginnt wenn:
- Der Ort wechselt
- Die Atmosphaere wechselt (z.B. von Tag zu Nacht)
- Ein grosser Zeitsprung passiert

Wenn die ganze Geschichte am selben Ort spielt → eine einzige Sequenz.

## Szenen-Typen

- **landscape**: Establishing Shot, Kameraschwenk, Umgebung. Kein Dialog, kein spokenText.
- **dialog**: Charakter spricht. Lip-Sync wird generiert. Close-Up oder Medium.
- **transition**: Uebergang zwischen Szenen. Kurz (2-4s).

## KRITISCH: Szenen-Beschreibungen — EXTREM DETAILLIERT

Die sceneDescription ist der EINZIGE Input fuer die Video-AI. Sie sieht NICHTS anderes.
Daher MUSS jede sceneDescription ALLE visuellen Details enthalten:

### Was JEDE sceneDescription enthalten MUSS (in Englisch!):
1. **Objekt-Konsistenz**: Farbe, Form, Zustand von Objekten EXAKT wiederholen
   - RICHTIG: "A red Formula 1 car #3 with white racing stripes races through the wet track"
   - FALSCH: "A car races through the track"
2. **Charakter-Konsistenz**: Aussehen EXAKT wiederholen (Kleidung, Helm, Haarfarbe)
   - RICHTIG: "Close-up of Max, a 30-year-old man with stubble, wearing a black racing helmet with red visor"
   - FALSCH: "Close-up of the driver"
3. **Wetter/Licht**: In JEDER Szene wiederholen
   - RICHTIG: "Heavy rain pours down, water sprays from tires, dark stormy sky"
   - FALSCH: (nichts ueber Wetter)
4. **Kamera-Position und Bewegung**: Praezise
   - RICHTIG: "Low-angle tracking shot from track level, camera follows the red F1 car from left to right"
   - FALSCH: "Wide shot of the race"
5. **Koerper-Haltung bei Charakteren**: Exakt was Haende, Kopf, Koerper tun
   - RICHTIG: "Max grips the steering wheel tightly with both hands, his knuckles white, leaning forward"
   - FALSCH: "Max drives"
6. **Kontinuitaet zur vorherigen Szene**: Erwaehne was gerade passiert ist
   - RICHTIG: "Following the crash from the previous shot, the red F1 car lies upside down, smoke rising"
   - FALSCH: "The car is crashed"

### Laenge: Minimum 3-5 Saetze pro sceneDescription. Mehr Detail = besseres Video.

## EMOTIONEN IM DIALOG (Audio-Tags) — EXTREM WICHTIG!
Baue Emotionen DIREKT und INTENSIV in den spokenText ein.
Die Emotionen muessen UEBERTRIEBEN und EXTREM sein — wie in einem Pixar-Film!

### Audio-Tags (vor dem Text platzieren):
- [laughing] — NICHT nur ein kurzes Lachen! Lass den Charakter sich KAPUTTLACHEN:
  RICHTIG: "[laughing] HAHAHAHA! Oh mein Gott! HAHAHA! Ich kann nicht mehr! [laughing] HAHAHAHA!"
  FALSCH: "[laughing] Haha, das ist witzig."
- [sighing] — tiefer, dramatischer Seufzer
- [whispering] — echtes leises Fluestern
- [gasping] — ueberraschter Aufschrei
- [crying] — echtes Weinen mit Schluchzen
- [screaming] — lautes Schreien
- [excited] — totale Aufregung, fast schon schreiend

### Lach-Regeln:
- Wenn jemand lacht, MUSS es MINDESTENS 3 Sekunden sein
- Benutze GROSSBUCHSTABEN: "HAHAHAHA!" nicht "haha"
- Wiederhole [laughing] mehrfach fuer anhaltendes Lachen
- Lachen ist ANSTECKEND — wenn einer lacht, lachen bald ALLE
- Bei einer lustigen Pointe: erst kurze Pause... dann EXPLOSION des Lachens
- Beispiel: "[laughing] BAHAHAHA! [laughing] Nein! HAHAHAHA! Ich kann nicht! [laughing] AHAHAHA!"

### Pausen und Timing:
- Benutze "..." fuer dramatische Pausen
- Benutze "—" fuer abrupte Unterbrechungen
- Nach einem Witz: PAUSE (eigene landscape-Szene) → dann Lach-Explosion

WICHTIG: Lachen, Seufzen, Weinen etc. gehoeren in den spokenText, NICHT in sfx!
Die Stimme des Charakters macht diese Emotionen selbst.

## SOUNDEFFEKTE (separate Felder — NUR Umgebungsgeraeusche)
- sfx: NUR echte Umgebungsgeraeusche auf Englisch (z.B. "door creaking, wind howling")
  NICHT: Lachen, Seufzen, Schreien — das gehoert in spokenText mit Audio-Tags!
- ambience: Hintergrund-Atmosphaere (z.B. "rain on asphalt, distant crowd cheering")

## KAMERA-REGELN (EXTREM WICHTIG fuer Video-Generierung!)

Die Kamera bestimmt WER im Bild zu sehen ist:
- "close-up": NUR der sprechende Charakter. Wird fuer Lip-Sync verwendet.
  → Nutze close-up fuer: emotionale Momente, Pointen, Lachen, Weinen, Fluestern
- "medium": Der sprechende Charakter + Umgebung. KEINE Lip-Sync.
  → Nutze medium fuer: normale Dialoge wo man den Kontext sehen will
- "wide": ALLE Charaktere in der Szene. KEINE Lip-Sync.
  → Nutze wide fuer: Establishing Shots, Gruppenreaktionen, Lachexplosionen aller
- "slow-pan": Langsame Kamerabewegung ueber die Szene
- "zoom-in": Langsam naeher → wird wie close-up behandelt (mit Lip-Sync)
- "zoom-out": Langsam weiter → zeigt mehr Umgebung

WECHSLE HAEUFIG zwischen close-up und medium/wide!
Ein guter Film hat ca. 60% close-up und 40% medium/wide.
Nie mehr als 3 close-ups hintereinander — dann MUSS ein medium/wide kommen.

## Regeln

1. Jede Szene maximal 15 Sekunden
2. Lange Dialog-Beats in mehrere 5-10s Szenen aufteilen
3. Szenen muessen LUECKENLOS aneinander anschliessen
4. sceneDescription IMMER auf ENGLISCH (Video-AI versteht Englisch am besten)
5. spokenText in der Sprache der Geschichte (z.B. Deutsch) MIT Audio-Tags fuer Emotionen
6. WIEDERHOLE visuelle Details (Farben, Kleidung, Wetter) in JEDER Szene
7. WECHSLE Kamera-Einstellungen: close-up ↔ medium ↔ wide (siehe KAMERA-REGELN)

## Output-Format

Antworte mit einem JSON-Objekt:
{
  "sequences": [
    {
      "name": "Sequenzname",
      "location": "Detaillierte Ort-Beschreibung",
      "atmosphere": "Wetter und Lichtstimmung...",
      "characterIds": ["char-0", "char-1"],
      "transitionType": "fade-to-black" | "visual-transition" | "hard-cut",
      "scenes": [
        {
          "beatIds": ["beat-0", "beat-1"],
          "type": "landscape" | "dialog" | "transition",
          "characterId": "char-0" | null,
          "spokenText": "[laughing] Dialog-Text MIT Audio-Tags fuer Emotionen (max 120 Zeichen, in Story-Sprache)",
          "sceneDescription": "DETAILED English description: 3-5 sentences with ALL visual details, colors, positions, weather, camera movement, character appearance, body language",
          "emotion": "tense" | "dramatic" | "calm" | "excited" | "neutral",
          "sfx": "English SFX description",
          "ambience": "English ambience description",
          "camera": "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out",
          "transitionTo": "cut" | "flow" | "zoom-to-character",
          "emotion": "neutral" | "tense" | "dramatic" | "calm" | "excited" | "sad" | "angry" | "joyful",
          "sfx": "Short SFX description in English for sound effect generation",
          "ambience": "Background atmosphere description in English",
          "durationHint": 5
        }
      ]
    }
  ]
}`;

/**
 * Generate a full film screenplay from a basis storyboard.
 */
export async function generateScreenplay(options: ScreenplayOptions): Promise<Screenplay> {
  const {
    storyboard,
    characters,
    directingStyle,
    atmosphere,
    atmospherePreset,
    stylePrompt,
    targetDurationSec,
    mode = "audiobook",
    locations,
    props,
  } = options;

  // Resolve atmosphere — try DB block first, fall back to inline presets
  let atmosphereText = atmosphere;
  if (!atmosphereText && atmospherePreset) {
    try {
      const { getBlockContent } = await import("@/lib/prompt-composer");
      const block = await getBlockContent(`atmosphere:${atmospherePreset}`);
      if (block) atmosphereText = block.content;
    } catch { /* DB block not found, use inline */ }
  }
  if (!atmosphereText) {
    atmosphereText = (atmospherePreset ? ATMOSPHERE_PRESETS[atmospherePreset]?.prompt : undefined)
      || ATMOSPHERE_PRESETS["golden-hour"].prompt;
  }

  // Build directing style — try DB block first, fall back to inline presets
  let styleSection: string;
  try {
    const { getBlockContent } = await import("@/lib/prompt-composer");
    const block = await getBlockContent(`style:${directingStyle || "pixar-classic"}`);
    styleSection = block?.content || getDirectingStylePrompt(directingStyle || "pixar-classic");
  } catch {
    styleSection = directingStyle
      ? getDirectingStylePrompt(directingStyle)
      : getDirectingStylePrompt("pixar-classic");
  }

  // Build character descriptions with char-N aliases for AI
  const charIdMap = new Map<string, string>(); // "char-0" → real character ID
  const charDescriptions = characters.map((c, i) => {
    const alias = `char-${i}`;
    charIdMap.set(alias, c.id);
    return `- ${alias} = ${c.markerId} "${c.name}" (${c.species || "Charakter"}): ${c.description || "Keine Beschreibung"}. Persoenlichkeit: ${c.personality || "Neutral"}`;
  }).join("\n");

  // Build beats summary
  const beatsSummary = storyboard.beats.map((b) =>
    `${b.id}: [${b.characterId || "NARRATOR"}] "${b.text.substring(0, 80)}${b.text.length > 80 ? "..." : ""}" (${b.emotion}, ~${(b.estimatedDurationMs / 1000).toFixed(1)}s${b.sfx ? `, SFX: ${b.sfx}` : ""})`
  ).join("\n");

  const prompt = `Erstelle ein Film-Drehbuch aus diesen Story-Beats.

## Story-Beats (${storyboard.beats.length} Beats, ~${(storyboard.totalEstimatedDurationMs / 1000).toFixed(0)}s):

${beatsSummary}

## Charaktere:
${charDescriptions}

## Atmosphaere (in JEDER Szene identisch):
${atmosphereText}

${locations && locations.length > 0 ? `## Verfuegbare Locations/Sets:
Die folgenden Locations wurden VOR dem Drehbuch erstellt und stehen als Sets bereit.
Verwende diese Locations in den Sequenzen und referenziere ihre Details in den sceneDescriptions.
Setze locationId im Sequenz-Objekt auf die ID der verwendeten Location.

${locations.map((loc) => `- ID: "${loc.id}" — "${loc.name}": ${loc.description}${loc.tags.length > 0 ? ` (Tags: ${loc.tags.join(", ")})` : ""}`).join("\n")}

WICHTIG: Benutze die EXAKTEN Details der Location (Baumstamm, Felsen, Bach etc.) in den sceneDescriptions!
Landscape-Szenen sollen die Location-Details VISUELL zeigen.
` : ""}
${props && props.length > 0 ? `## Verfuegbare Props/Requisiten:
Die folgenden Objekte/Requisiten stehen als visuelle Referenzen bereit.
Erwaehne sie in den sceneDescriptions wenn passend.

${props.map((p) => `- "${p.name}": ${p.description}`).join("\n")}

Beschreibe Props EXAKT in der sceneDescription: Farbe, Form, Material, Position im Bild.
` : ""}
${stylePrompt ? `## Visueller Stil:\n${stylePrompt}\n` : ""}

Erstelle das Drehbuch als JSON. Beachte:
- Erkenne Ortswechsel und erstelle separate Sequenzen
- Teile lange Beats (>15s) in mehrere Szenen auf
- Fuege Landscape-Szenen vor dem ersten Dialog einer Sequenz ein
- Jede Szene hat audioStartMs/audioEndMs basierend auf den Beat-Timings
- Die erste Szene einer Sequenz ist IMMER landscape (Establishing Shot)
${targetDurationSec ? `\n## ZIEL-FILMLAENGE: ${targetDurationSec} Sekunden (~${Math.round(targetDurationSec / 60)} Minuten)
- Passe die Anzahl der Szenen an die Ziel-Laenge an
- Bei kurzen Filmen (< 30s): Nur 3-5 Szenen, sehr kompakt, jede Szene ~5s
- Bei mittleren Filmen (30-120s): 8-15 Szenen, gutes Tempo
- Bei langen Filmen (> 120s): Viele Szenen, mehr Dialog, mehr Establishing Shots
- Jede Szene hat durationHint in Sekunden — die Summe aller durationHints sollte ~${targetDurationSec}s ergeben` : ""}`;

  // Build mode section
  const modeDescriptions: Record<string, { title: string; instructions: string }> = {
    film: {
      title: "FILM — Wie ein Kinofilm, KEIN Erzaehler",
      instructions: `WICHTIG: Dies ist ein KINOFILM. Es gibt KEINEN Erzaehler. KEINE Off-Stimme. KEIN Voiceover.

Die Geschichte wird NUR durch Bilder, Dialoge der Charaktere und Soundeffekte erzaehlt.
- landscape-Szenen: KEIN spokenText, KEIN characterId. Nur visuelle Szene + SFX/Ambience.
- dialog-Szenen: NUR echte gesprochene Saetze des Charakters. KEINE Beschreibung was passiert.
  Beispiel RICHTIG: spokenText = "Verdammt, die Bremsen reagieren nicht!"
  Beispiel FALSCH: spokenText = "Max kaempft mit dem Lenkrad waehrend der Regen auf die Scheibe prasselt"
- Der spokenText ist EXAKT das was der Charakter SAGT. Nicht was er tut oder fuehlt.
- Lip-Sync wird automatisch generiert — die Lippen des Charakters bewegen sich zum Text.
- Nutze VIELE landscape-Szenen fuer Action die OHNE Worte erzaehlt wird.
- Dialog ist KURZ und PRAEGNANT — wie im echten Film. Max 1-2 Saetze pro dialog-Szene.`,
    },
    hoerspiel: {
      title: "HOERSPIEL mit mehreren Stimmen & SFX",
      instructions: `Mehrere Charaktere sprechen mit eigenen Stimmen. Es gibt einen Erzaehler UND direkte Dialoge.
Aber: KEIN Lip-Sync. Die Szenen zeigen die Charaktere visuell, aber die Muender bewegen sich nicht.
Setze characterId bei dialog-Szenen damit die richtige Stimme zugewiesen wird.
Nutze viele SFX-Beschreibungen in den Szenen (Schritte, Tuergeraeusche, Naturklaenge).
Mische landscape, dialog und transition Szenen fuer Abwechslung.`,
    },
    audiobook: {
      title: "HOERBUCH mit einem Erzaehler",
      instructions: `Die Geschichte wird von EINEM Erzaehler vorgelesen. Keine direkten Dialoge.
Die meisten Szenen sind landscape oder transition — sie zeigen die Umgebung und Stimmung.
dialog-Szenen zeigen den Charakter visuell aber ohne Lip-Sync — der Erzaehler spricht.
Ruhiges Pacing, viel Atmosphaere, wenige Schnitte. Die Bilder begleiten die Erzaehlung.`,
    },
  };

  const modeInfo = modeDescriptions[mode] || modeDescriptions.audiobook;
  const modeSection = `\n\n## MODUS: ${modeInfo.title}\n${modeInfo.instructions}`;

  // Build system prompt with directing style
  const systemPrompt = SCREENPLAY_SYSTEM + modeSection + "\n\n" + styleSection + `\n\n## LICHT & ATMOSPHAERE (IDENTISCH in JEDER Szene)\n${atmosphereText}\nWiederhole diese Beschreibung in jeder sceneDescription.`;

  console.log(`[Screenplay] Generating from ${storyboard.beats.length} beats, ${characters.length} characters...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Extract JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const rawMatch = text.match(/\{[\s\S]*"sequences"[\s\S]*\}/);
  const jsonStr = codeBlockMatch?.[1] || rawMatch?.[0];

  if (!jsonStr) {
    console.error("[Screenplay] No valid JSON found:", text.substring(0, 500));
    throw new Error("Screenplay-Generator: Kein valides JSON");
  }

  const raw = JSON.parse(jsonStr) as { sequences: Array<Record<string, unknown>> };

  // Process sequences and calculate timing
  let audioOffsetMs = 0;
  const sequences: ScreenplaySequence[] = [];

  for (let si = 0; si < raw.sequences.length; si++) {
    const rawSeq = raw.sequences[si];
    const rawScenes = (rawSeq.scenes as Array<Record<string, unknown>>) || [];

    const scenes: StudioScene[] = [];
    for (let sci = 0; sci < rawScenes.length; sci++) {
      const rs = rawScenes[sci];
      const duration = ((rs.durationHint as number) || 5) * 1000;

      // Map char-N alias back to real character ID
      const rawCharId = rs.characterId as string | undefined;
      const resolvedCharId = rawCharId ? (charIdMap.get(rawCharId) || rawCharId) : undefined;

      scenes.push({
        id: `seq${si}-scene${sci}`,
        index: sci,
        beatIds: (rs.beatIds as string[]) || [],
        characterId: resolvedCharId,
        spokenText: rs.spokenText as string | undefined,
        type: (rs.type as StudioScene["type"]) || "dialog",
        sceneDescription: (rs.sceneDescription as string) || "",
        location: (rawSeq.location as string) || "",
        mood: atmosphereText,
        camera: (rs.camera as string) || "medium",
        transitionTo: rs.transitionTo as StudioScene["transitionTo"],
        emotion: ((rs.emotion as string) as StudioScene["emotion"]) || "neutral",
        sfx: (rs.sfx as string) || undefined,
        ambience: (rs.ambience as string) || undefined,
        audioStartMs: audioOffsetMs,
        audioEndMs: audioOffsetMs + duration,
        durationHint: (rs.durationHint as number) || 5,
        status: "pending",
      });

      audioOffsetMs += duration;
    }

    sequences.push({
      id: `seq-${si}`,
      orderIndex: si,
      name: (rawSeq.name as string) || `Sequenz ${si + 1}`,
      location: (rawSeq.location as string) || "",
      atmosphere: atmosphereText,
      directingStyle: directingStyle || "pixar-classic",
      storySegment: "", // Filled by caller
      characterIds: ((rawSeq.characterIds as string[]) || []).map((cid) => charIdMap.get(cid) || cid),
      scenes,
      transitionType: (rawSeq.transitionType as ScreenplaySequence["transitionType"]) || "fade-to-black",
    });
  }

  const totalScenes = sequences.reduce((sum, seq) => sum + seq.scenes.length, 0);

  console.log(`[Screenplay] Generated: ${sequences.length} sequences, ${totalScenes} scenes, ~${(audioOffsetMs / 1000).toFixed(0)}s`);

  return {
    title: storyboard.title,
    acts: [{ name: "Film", sequences }], // Simple single-act for now
    totalScenes,
    totalEstimatedDurationSec: audioOffsetMs / 1000,
  };
}

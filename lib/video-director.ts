/**
 * AI Video Director — Analyzes a story and creates a scene list for film generation.
 *
 * Takes the story text (with character markers) and the audio timeline,
 * and produces a structured list of film scenes with camera directions,
 * locations, moods, and timing.
 */

import Anthropic from "@anthropic-ai/sdk";
import { parseStorySegments } from "./story-parser";

const anthropic = new Anthropic();

// --- Types ---

export interface FilmScene {
  type: "dialog" | "landscape" | "transition";
  characterId?: string;
  spokenText?: string;
  sceneDescription: string;
  location: string;
  mood: string;
  camera: "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out";
  durationHint: number; // seconds
  audioStartMs: number;
  audioEndMs: number;
}

export interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

// --- Director ---

const DIRECTOR_SYSTEM = `Du bist ein Animations-Regisseur fuer den KoalaTree — ein magischer Eukalyptusbaum in dem verschiedene australische Tiere leben. Dein Stil ist Disney 1994 (Lion King, Jungle Book): warme Farben, flache 2D-Animation, lebendige Charaktere.

## Die KoalaTree-Welt

Der KoalaTree ist ein riesiger, uralter Eukalyptusbaum. Die Charaktere leben auf verschiedenen Ebenen:
- **Koda** (alter weiser Koala mit goldener Brille) — sitzt meist oben auf einem dicken Ast, klettert langsam und gemuetlich
- **Kiki** (frecher Kookaburra/Lachvogel) — fliegt, flattert, landet auf Aesten, ist immer in Bewegung
- **Luna** (traeumerische Eule) — erscheint bei Nacht/Daemmerung, sitzt still, grosse sanfte Augen
- **Mika** (mutiger Dingo) — lebt am Boden unter dem Baum, springt und rennt
- **Pip** (neugieriges Schnabeltier) — lebt am Wasser/Bach neben dem Baum, taucht auf und unter
- **Sage** (weiser Wombat) — sitzt meditierend zwischen den Wurzeln, bewegt sich langsam und bedacht
- **Nuki** (froehlicher Quokka) — huepft und springt, immer lachelnd, etwas tollpatschig

## Deine Aufgabe

Erstelle eine Szenen-Liste die wie ein echter ANIMATIONSFILM funktioniert. NICHT nur sprechende Portraits — sondern BEWEGUNG, INTERAKTION, SZENENWECHSEL.

## Bewegungs-Regeln (WICHTIG!)

1. **Charaktere BEWEGEN sich**: Wenn Koda einen neuen Charakter vorstellt, KLETTERT er zu diesem hin. Zeige das!
2. **Eintritte inszenieren**: Kiki FLIEGT ins Bild. Mika RENNT herbei. Pip TAUCHT aus dem Wasser auf. Nuki HUEPFT ins Bild.
3. **Koerpersprache**: Waehrend des Sprechens gestikulieren die Tiere, schauen sich um, reagieren aufeinander
4. **Kamerabewegung**: Nutze slow-pan, zoom-in, zoom-out aktiv. Die Kamera FOLGT den Charakteren
5. **Szenenwechsel**: Wenn der Ort wechselt (z.B. von oben im Baum nach unten zum Boden), zeige den Uebergang
6. **Reaktionen**: Wenn ein Charakter etwas Lustiges sagt, zeige die Reaktion der anderen

## Szenen-Typen

- **dialog**: Charakter spricht UND bewegt sich dabei. Beschreibe WAS er tut waehrend er spricht.
  Beispiel: "Koda klettert langsam einen Ast entlang, bleibt stehen und dreht sich zur Kamera. Er laechelt warm und spricht mit ruhiger Stimme."

- **landscape**: Establishing Shot oder Szenenwechsel. Zeigt die Umgebung.
  Beispiel: "Kamera schwenkt langsam den KoalaTree hinunter, vorbei an leuchtenden Gluehwuermchen, bis zum Boden wo Mika wartet."

- **transition**: Kurzer Uebergang zwischen Szenen.
  Beispiel: "Blaetter wehen durchs Bild, die Tageszeit wechselt von Sonnenuntergang zu Daemmerung."

## Technische Regeln

1. Fasse kurze aufeinanderfolgende Segmente desselben Charakters zusammen
2. Halte die Gesamtzahl der Szenen zwischen 10 und 20
3. Die audioStartMs/audioEndMs muessen exakt mit der Timeline uebereinstimmen
4. sceneDescription muss IMMER Bewegung und Aktion beschreiben, NIE nur "Portrait von X"
5. Jede sceneDescription sollte 2-3 Saetze lang sein und klar beschreiben was visuell passiert

Antworte NUR mit validem JSON — ein Array von FilmScene-Objekten.`;

export async function analyzeStoryForFilm(
  storyText: string,
  timeline: TimelineEntry[]
): Promise<FilmScene[]> {
  // Parse the story segments for context
  const segments = parseStorySegments(storyText);

  // Build the prompt
  const prompt = `Analysiere diese Geschichte und erstelle eine Film-Szenen-Liste.

## Story-Text:
${storyText}

## Audio-Timeline (wann spricht wer):
${JSON.stringify(timeline, null, 2)}

## Story-Segmente (geparsed):
${segments.map((s, i) => `${i}: [${s.type}] ${s.characterId || s.sfxPrompt || s.ambiencePrompt} — "${s.text.substring(0, 80)}..."`).join("\n")}

Erstelle die Szenen-Liste als JSON-Array. WICHTIG: Beschreibe in sceneDescription immer die BEWEGUNG und AKTION, nicht nur wer spricht. Beispiel SCHLECHT: "Koda spricht". Beispiel GUT: "Koda klettert gemuetlich einen dicken Ast entlang, bleibt stehen, rueckt seine goldene Brille zurecht und dreht sich laechelnd zur Kamera."

Jede Szene:
{
  "type": "dialog" | "landscape" | "transition",
  "characterId": "koda" | "kiki" | "luna" | "mika" | "pip" | "sage" | "nuki" | null,
  "spokenText": "Was der Charakter sagt (kurz, max 100 Zeichen)",
  "sceneDescription": "2-3 Saetze: Was PASSIERT visuell? Welche BEWEGUNG? Welche AKTION? Wie REAGIEREN die Charaktere?",
  "location": "Wo genau am/im/unter dem KoalaTree",
  "mood": "Stimmung, Licht, Tageszeit",
  "camera": "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out",
  "durationHint": Sekunden,
  "audioStartMs": exakte Start-Position im Audio (aus Timeline),
  "audioEndMs": exakte End-Position im Audio (aus Timeline)
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract JSON from response
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Find JSON array in response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI Director returned no valid JSON scene list");
  }

  const scenes: FilmScene[] = JSON.parse(jsonMatch[0]);

  // Validate and clean
  const validScenes = scenes.filter((s) => {
    if (!s.type || !s.sceneDescription) return false;
    if (s.type === "dialog" && !s.characterId) return false;
    return true;
  });

  console.log(`[Director] Analyzed story → ${validScenes.length} scenes`);
  return validScenes;
}

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
  type: "dialog" | "landscape" | "transition" | "intro" | "outro";
  characterId?: string;
  spokenText?: string;
  sceneDescription: string;
  location: string;
  mood: string;
  camera: "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out" | "slow-zoom-in" | "slow-zoom-out";
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

const DIRECTOR_SYSTEM = `Du bist ein preisgekroenter Animations-Regisseur. Du denkst wie ein Filmemacher, nicht wie ein Slideshow-Ersteller. Jeder Film den du planst soll sich anfuehlen wie ein ECHTER Zeichentrickfilm — mit filmischer Dramaturgie, Spannung, Timing und Emotion.

## GOLDENE REGEL: Video und Audio sind NICHT dasselbe

Ein haeufiger Fehler: Audio-Segment 1 = Video-Szene 1. FALSCH! In einem echten Film:
- Die KAMERA zeigt etwas BEVOR jemand spricht (Establishing Shot, Ankunft)
- Ein Charakter ist SICHTBAR bevor er den Mund aufmacht
- NACH dem Dialog zeigt man Reaktionen der anderen
- Stille Momente erzeugen Spannung

Beispiel fuer den ANFANG eines Films:
1. [landscape, 0-3s] Totale auf den magischen Baum, Kamera schwenkt langsam naeher
2. [landscape, 3-6s] Kamera gleitet den Stamm hinauf, zeigt Details, Licht faellt durch Blaetter
3. [dialog, 6-8s] Koda sitzt auf seinem Ast, rueckt seine Brille zurecht, schaut auf — JETZT erst spricht er
→ Der Zuschauer SIEHT die Welt bevor er sie HOERT. Das ist Film!

## Professionelle Film-Prinzipien

### 1. Anticipation (Vorwegnahme)
Zeige dem Zuschauer WO die Aktion stattfinden wird, BEVOR sie passiert.
- Bevor Kiki spricht: Kamera schwenkt nach oben, man hoert Fluegel flattern, dann landet Kiki im Bild
- Bevor Mika auftaucht: Blaetter am Boden bewegen sich, dann springt Mika ins Bild

### 2. Show Don't Tell
Wenn die Geschichte sagt "Kiki ist lustig" — ZEIGE Kiki wie sie etwas Lustiges tut.
Wenn die Geschichte sagt "es wurde Nacht" — ZEIGE wie das Licht sich veraendert.

### 3. Reaction Shots
Nach jedem wichtigen Dialog: Zeige kurz die Reaktion anderer Charaktere.
- Koda sagt etwas Weises → Kurzer Shot auf die anderen die nicken/staunen
- Kiki macht einen Witz → Kurzer Shot auf Koda der die Augen verdreht

### 4. Kamerabewegung = Emotion
- **slow-zoom-in**: Intimier Moment, Geheimnis, etwas Wichtiges wird gesagt
- **zoom-out**: Staunen, Ehrfurcht, die grosse weite Welt zeigen
- **slow-pan**: Entdeckung, Ueberblick, den Ort vorstellen
- **close-up**: Emotion, Detail, Augen, Gesichtsausdruck
- **medium**: Standard-Dialog, Koerpersprache sichtbar
- **wide**: Alle zusammen, Gruppenszene, Landschaft

### 5. Tempo und Rhythmus
- Schnelle Dialoge → kurze Schnitte, medium shots
- Ruhige Momente → lange Einstellungen, wide/slow-pan
- Spannende Momente → zoom-in, close-up
- Uebergaenge → landscape/transition Szenen als Atempause

## Die KoalaTree-Welt

Der KoalaTree ist ein riesiger, uralter Eukalyptusbaum. Die Charaktere leben auf verschiedenen Ebenen:
- **Koda** (alter weiser Koala, goldene Brille) — oben auf dickem Ast, klettert langsam, vaeterliche Gesten
- **Kiki** (frecher Kookaburra) — fliegt und flattert, landet auf Aesten, kopfueber haengend, expressiv
- **Luna** (traeumerische Eule) — bei Nacht/Daemmerung, stille Eleganz, grosse sanfte Augen, schwebt lautlos
- **Mika** (mutiger Dingo) — am Boden, springt und rennt, heldenhaft, Bandana flattert im Wind
- **Pip** (neugieriges Schnabeltier) — am Bach, taucht auf/unter, Lupe in der Pfote, staunende Augen
- **Sage** (weiser Wombat) — zwischen Wurzeln, meditiert, bewegt sich bedacht, Lotusblume daneben
- **Nuki** (froehlicher Quokka) — huepft und springt, immer grinsend, tollpatschig, faellt fast vom Ast

## Szenen-Typen

- **landscape**: Establishing Shot, Kameraschwenk, Umgebung zeigen. KEIN Dialog. Nutze diese Szenen um visuell in die naechste Situation einzufuehren. Musik und Ambiente spielen.
- **dialog**: Charakter spricht UND BEWEGT sich. Beschreibe die AKTION waehrend des Dialogs. Lip-Sync wird automatisch generiert. Die sceneDescription beschreibt was der Charakter VISUELL TUT.
- **transition**: Kurzer visueller Uebergang — Blaetter wehen, Licht aendert sich, Kamera gleitet.

## KRITISCH: Audio-Timing

- landscape/transition Szenen MUESSEN audioStartMs/audioEndMs haben die einen Zeitbereich ZWISCHEN den Dialog-Segmenten abdecken (oder den Anfang/Ende)
- Dialog-Szenen: audioStartMs/audioEndMs muessen EXAKT mit der Timeline uebereinstimmen
- Du DARFST landscape-Szenen VOR den ersten Dialog-Eintrag legen (audioStartMs: 0, audioEndMs: z.B. 3000)
- Wenn die Timeline erst bei 8000ms startet, nutze 0-8000ms fuer ein schoenes Intro!
- WICHTIG: Dialog-audioStartMs muss GENAU dem Timeline-Eintrag entsprechen — NICHT verschieben!

## Format

Antworte NUR mit validem JSON — ein Array von Szenen-Objekten. 10-20 Szenen.
camera Werte: "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out" | "slow-zoom-in" | "slow-zoom-out"
type Werte: "dialog" | "landscape" | "transition"
`;

export async function analyzeStoryForFilm(
  storyText: string,
  timeline: TimelineEntry[],
  audioDurationSec?: number,
): Promise<FilmScene[]> {
  // Parse the story segments for context
  const segments = parseStorySegments(storyText);

  const hasTimeline = timeline.length > 0;
  const firstDialogMs = hasTimeline ? timeline[0].startMs : 0;
  const lastDialogEndMs = hasTimeline ? timeline[timeline.length - 1].endMs : 0;
  const estimatedDurationSec = audioDurationSec || (hasTimeline ? lastDialogEndMs / 1000 : segments.length * 8);

  // Build timeline section based on whether we have real data
  let timelineSection: string;
  if (hasTimeline) {
    timelineSection = `## Audio-Timeline (exakte Zeiten — verwende diese!):
${JSON.stringify(timeline, null, 2)}

## Timing-Info:
- Erster Dialog startet bei: ${firstDialogMs}ms (${(firstDialogMs / 1000).toFixed(1)}s)
- Letzter Dialog endet bei: ${lastDialogEndMs}ms (${(lastDialogEndMs / 1000).toFixed(1)}s)
${firstDialogMs > 2000 ? `- Du hast ${(firstDialogMs / 1000).toFixed(1)}s VOR dem ersten Dialog fuer ein visuelles Intro!` : ""}

WICHTIG: Die audioStartMs/audioEndMs fuer Dialog-Szenen MUESSEN exakt den Timeline-Eintraegen entsprechen!`;
  } else {
    // No timeline — director must estimate timing from text
    timelineSection = `## ACHTUNG: Keine exakte Audio-Timeline vorhanden!

Du musst die Zeiten SCHAETZEN basierend auf dem Text. Geschaetzte Audio-Dauer: ~${estimatedDurationSec.toFixed(0)} Sekunden.

Regeln fuer die Schaetzung:
- Jedes gesprochene Wort dauert ca. 0.4 Sekunden
- Pausen zwischen Sprechern: ~1-2 Sekunden
- Zaehle die Woerter pro Segment und rechne: Woerter * 0.4s = Dauer
- Beginne Dialog-Szenen NICHT bei 0ms — lasse 3-5 Sekunden fuer ein Intro
- Die Szenen muessen LUECKENLOS aneinander anschliessen (audioEndMs von Szene N = audioStartMs von Szene N+1)

Berechne die Zeiten sorgfaeltig und trage sie in audioStartMs/audioEndMs ein.`;
  }

  // Build the prompt
  const prompt = `Erstelle einen professionellen Film-Szenenplan fuer diese Geschichte.

## Story-Text:
${storyText}

${timelineSection}

## Story-Segmente (geparsed):
${segments.map((s, i) => `${i}: [${s.type}] ${s.characterId || s.sfxPrompt || s.ambiencePrompt} — "${s.text.substring(0, 80)}..."`).join("\n")}

## Anweisungen:

1. **Intro-Szenen** (1-2 landscape-Szenen BEVOR der Dialog beginnt):
   - Zeige den KoalaTree von aussen, Kamera gleitet naeher, Naturgeraeusche (Voegel, Wind)
   - Diese Szenen haben KEIN Story-Audio — setze audioStartMs: 0 und audioEndMs: 0
   - Kling generiert automatisch passende Ambient-Geraeusche zum Bild
   - ERST DANACH kommt die erste Dialog-Szene mit audioStartMs: ${firstDialogMs}
   - Wichtig: Die Dialog-Szene audioStartMs muss EXAKT dem ersten Timeline-Eintrag entsprechen!

2. **Zwischen Sprecherwechseln**: Fuege kurze transition-Szenen ein
   - Kamera schwenkt von einem Charakter zum naechsten
   - Zeige kurz die Reaktion bevor der naechste spricht

3. **Dialog-Szenen**: Beschreibe was der Charakter VISUELL TUT waehrend er spricht
   - SCHLECHT: "Koda spricht"
   - GUT: "Koda sitzt auf seinem dicken Ast, lehnt sich zurueck, schiebt seine goldene Brille hoch und schaut den Zuschauer mit einem warmen Grossvater-Laecheln an"

4. **Ende**: 1-2 Szenen NACH dem letzten Dialog
   - Kamera zieht langsam zurueck, zeigt den ganzen Baum

## Format pro Szene:
{
  "type": "dialog" | "landscape" | "transition",
  "characterId": "koda" | "kiki" | "luna" | "mika" | "pip" | "sage" | "nuki" | null,
  "spokenText": "Gesprochener Text (kurz, max 100 Zeichen)",
  "sceneDescription": "2-3 Saetze: AKTION + BEWEGUNG + KOERPERSPRACHE",
  "location": "Wo genau am/im/unter dem KoalaTree",
  "mood": "Stimmung, Licht, Tageszeit, Farben",
  "camera": "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out" | "slow-zoom-in" | "slow-zoom-out",
  "durationHint": Sekunden,
  "audioStartMs": Start-Position in Millisekunden,
  "audioEndMs": End-Position in Millisekunden
}

Antworte NUR mit einem JSON-Array.`;

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
    // Ensure timing exists
    if (typeof s.audioStartMs !== "number") s.audioStartMs = 0;
    if (typeof s.audioEndMs !== "number") s.audioEndMs = s.audioStartMs + (s.durationHint || 5) * 1000;
    return true;
  });

  console.log(`[Director] Analyzed story → ${validScenes.length} scenes`);
  return validScenes;
}

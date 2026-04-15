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
import { getDirectingStylePrompt, ATMOSPHERE_PRESETS, STYLE_TRANSITION_RULES } from "../directing-styles";
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

/** Existing sequence context for "next" mode */
export interface ExistingSequenceRef {
  name: string;
  location: string;
  sceneCount: number;
  summary?: string;
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
  /** Existing sequences for "next" mode — passed as context so AI doesn't repeat */
  existingSequences?: ExistingSequenceRef[];
  /** "full" = generate all sequences, "next" = generate only the next one */
  sequenceMode?: "full" | "next";
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

- **landscape**: Visuelle Szene OHNE gesprochenen Dialog. Kein spokenText.
  WICHTIG: Landscape-Szenen KOENNEN und SOLLEN Charaktere zeigen die NICHT sprechen!
  Beispiele: Charakter kommt an und steigt aus Auto, laeuft am Strand, schaut aufs Meer.
  Setze characterId wenn ein Charakter SICHTBAR ist (auch ohne Dialog).
  NUR wenn KEIN Charakter im Bild ist → characterId: null.
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

### KRITISCH: HAENDE, GESICHTER, PHYSIK — das vergisst die Video-AI sonst!

Die Video-AI generiert EXAKT was beschrieben wird — und NICHTS was fehlt.
Wenn du "ein Auto faehrt" schreibst, generiert sie ein Auto OHNE FAHRER.
Wenn du "jemand kocht" schreibst, fehlen die HAENDE am Topf.

REGEL: Beschreibe IMMER was Haende, Gesicht und Koerper tun:

**Haende/Finger (IMMER beschreiben wenn Charakter etwas benutzt):**
- RICHTIG: "Lia grips the surfboard with her right hand, fingers wrapped tightly around the edge, left hand trailing in the water"
- FALSCH: "Lia holds her surfboard"

**Gesicht/Augen (IMMER wenn der Charakter im Bild ist):**
- RICHTIG: "Lia's eyes widen with excitement, her mouth breaks into a broad grin, wind pushing her wet hair across her face"
- FALSCH: "Lia looks excited"

**Koerper/Gewicht/Physik (IMMER beschreiben wie sich der Koerper verhaelt):**
- RICHTIG: "Lia shifts her weight forward on the board, knees bent, arms extended for balance, water spraying around her ankles"
- FALSCH: "Lia surfs"

**Fahrzeuge/Maschinen (FAHRER/BEDIENER MUSS SICHTBAR SEIN):**
- RICHTIG: "A vintage VW T2 bus drives along the coastal road, the driver visible through the windshield with both hands on the steering wheel, sun-bronzed arm resting on the open window"
- FALSCH: "A VW bus drives down the road" → generiert ein fahrerloses Auto!

**Umgebungs-Interaktion (Charakter reagiert auf Umgebung):**
- RICHTIG: "Sand shifts under Lia's bare feet with each step, leaving deep footprints, ocean spray mists her sun-kissed skin, her loose cotton shirt flutters in the salty breeze"
- FALSCH: "Lia walks on the beach"

### Laenge: Minimum 4-6 Saetze pro sceneDescription. Mehr Detail = besseres Video.

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

## CLIP-UEBERGAENGE (clipTransition) — WICHTIG fuer nahtlose Clips!

Jede Szene hat ein clipTransition-Feld das bestimmt wie Clip N in Clip N+1 uebergeht:
- "seamless": Der letzte Frame von Clip N wird als Startbild fuer Clip N+1 genutzt.
  Die Kamera MUSS in der gleichen Richtung weiterbewegen. Kein sichtbarer Schnitt.
- "hard-cut": Frischer Start — neues Bild, neue Perspektive. Bewusster Schnitt.
- "fade-to-black": Schwarzblende dazwischen. Dramatische Pause.
- "match-cut": Letzter Frame als Start, ABER dramatischer Perspektivwechsel (z.B. close-up → wide).

### KAMERA-KONTINUITAET bei seamless:
Wenn Szene N cameraMotion "pan-right" hat und clipTransition "seamless":
→ Szene N+1 MUSS auch "pan-right" oder "tracking" als cameraMotion haben!
Die Kamera darf bei seamless NICHT ploetzlich die Richtung aendern.

### Regeln:
1. Erste Szene einer Sequenz: IMMER clipTransition = "hard-cut" (neuer Ort)
2. Letzte Szene einer Sequenz: Uebergang zur naechsten Sequenz basierend auf Location-Aehnlichkeit
   - Aehnliche Locations (Strand → Wasser): "seamless"
   - Komplett verschiedene Locations (Strand → Stadt): "hard-cut" oder "fade-to-black"
3. Innerhalb einer Sequenz: Der Regie-Stil bestimmt die Verteilung (siehe CLIP-UEBERGANGS-REGELN unten)

## BEWEGUNGS-DETAILS in sceneDescription (EXTREM WICHTIG!)

Jede sceneDescription MUSS diese 7 Elemente enthalten:
1. LICHT: Wie faellt das Licht? (Gegenlicht, Seitenlicht, golden hour glow, rim lighting)
2. BEWEGUNG: Wie bewegt sich der Character? (confident stride, hesitant steps, explosive sprint)
3. HAENDE: Was tun die Haende? (gripping, reaching, resting, gesturing, holding)
4. GESICHT: Welcher Ausdruck? Wohin schaut der Blick? (eyes scanning, mouth slightly open, brow furrowed)
5. PHYSISCHE DETAILS: Haare, Kleidung, Wasser, Sand — was bewegt sich im Wind/Wasser?
6. ATMOSPHAERE: Wind, Wasserspritzer, Staub, Lichtreflexe, Partikel
7. NEGATIVE MOTION: Fuege IMMER hinzu: "Natural fluid motion, not static, not frozen, not robotic"

Beispiel RICHTIG: "Tracking shot follows Lia as she walks confidently toward the turquoise water, sun-kissed skin glistening, dark hair tousled by ocean breeze. Her right hand grips the surfboard edge firmly, left arm swings naturally at her side. Her eyes scan the waves ahead, a slight smile forming on her lips. Sand shifts under her bare feet leaving deep prints, morning light casting a long golden shadow behind her. Natural fluid motion, not static."
Beispiel FALSCH: "Character walks to the water."

## Regeln

1. Jede Szene maximal 15 Sekunden
2. Lange Dialog-Beats in mehrere 5-10s Szenen aufteilen
3. Szenen muessen LUECKENLOS aneinander anschliessen
4. sceneDescription IMMER auf ENGLISCH (Video-AI versteht Englisch am besten)
5. spokenText in der Sprache der Geschichte (z.B. Deutsch) MIT Audio-Tags fuer Emotionen
6. WIEDERHOLE visuelle Details (Farben, Kleidung, Wetter) in JEDER Szene
7. WECHSLE Kamera-Einstellungen: close-up ↔ medium ↔ wide (siehe KAMERA-REGELN)

## PFLICHT-CHECKLISTE — Pruefe JEDE sceneDescription bevor du sie schreibst!

Gehe diese Checkliste mental durch. Wenn ein Punkt fehlt, ERGAENZE ihn:

□ Ist ein MENSCH in der Szene? → Beschreibe WO er steht/sitzt, was seine HAENDE tun, wohin seine AUGEN schauen
□ Benutzt jemand ein FAHRZEUG? → Der FAHRER/BEIFAHRER MUSS sichtbar sein ("driver visible through windshield, hands on steering wheel")
□ Steigt jemand EIN oder AUS? → Beschreibe WELCHE Seite (driver's side), WELCHE Hand an der Tuer, WIE der Koerper sich bewegt
□ Haelt jemand etwas? → Beschreibe WELCHE Hand, WIE fest, WELCHE Finger
□ Gibt es BEWEGUNG? → Beschreibe Schritt fuer Schritt: Fuss hebt sich → setzt auf → naechster Fuss
□ Gibt es WETTER? → Wind, Sonne, Regen → WIE reagiert Kleidung, Haare, Haut darauf?
□ Gibt es eine UEBERGANGS-AKTION (jemand kommt an, geht weg, setzt sich)? → Beschreibe den GESAMTEN Ablauf in Einzelschritten

### TYPISCHE FEHLER die du VERMEIDEN musst:

FALSCH: "The red VW T2 bus sits parked on the sand"
→ FEHLER: Kein Fahrer sichtbar! Wer hat es dorthin gefahren? Wo sind die Insassen?
RICHTIG: "The red VW T2 bus rolls slowly onto the sandy beach, the driver — a tanned young woman with sunglasses pushed up on her forehead — visible through the open window, her left arm resting casually on the door frame. She turns off the engine, the bus settling with a gentle creak."

FALSCH: "Lia steps out of the VW bus"
→ FEHLER: Keine Zwischenschritte! Wie steigt sie aus?
RICHTIG: "Lia pushes open the driver-side door of the red VW T2 with her left hand, swings her tanned legs out first, bare feet touching the warm sand. She stands up, stretching her arms overhead, then reaches back inside to grab her surfboard from the passenger seat."

FALSCH: "A surfer paddles into the water"
→ FEHLER: Keine Koerperdetails! Wie paddelt er?
RICHTIG: "Lia lies flat on her surfboard, chest slightly raised, both arms pulling through the turquoise water in steady alternating strokes. Her fingers spread wide as they enter the water, pulling back with force. Saltwater splashes across her shoulders, her wet hair plastered to one side of her face."

## Output-Format

Antworte mit einem JSON-Objekt:
{
  "sequences": [
    {
      "name": "Sequenzname",
      "location": "Detaillierte Ort-Beschreibung",
      "locationId": "ID der verwendeten Location aus der Liste oben (oder null wenn keine passt)",
      "atmosphere": "Wetter und Lichtstimmung...",
      "characterIds": ["char-0", "char-1"],
      "transitionType": "fade-to-black" | "visual-transition" | "hard-cut",
      "scenes": [
        {
          "beatIds": ["beat-0", "beat-1"],
          "type": "landscape" | "dialog" | "transition",
          "characterId": "char-0" | null (bei landscape: setzen wenn Charakter SICHTBAR, null wenn nur Umgebung),
          "spokenText": "[laughing] Dialog-Text MIT Audio-Tags (max 120 Zeichen, in Story-Sprache). NUR bei dialog-Szenen, bei landscape: null",
          "sceneDescription": "DETAILED English description: 4-6 sentences with ALL visual details including HANDS, FACE, BODY POSITION, colors, weather, camera, character appearance",
          "camera": "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out",
          "cameraMotion": "static" | "pan-left" | "pan-right" | "tilt-up" | "tilt-down" | "zoom-in" | "zoom-out" | "dolly-forward" | "dolly-back" | "tracking" | "rotation",
          "clipTransition": "seamless" | "hard-cut" | "fade-to-black" | "match-cut",
          "transitionTo": "cut" | "flow" | "zoom-to-character",
          "emotion": "neutral" | "tense" | "dramatic" | "calm" | "excited" | "sad" | "angry" | "joyful",
          "sfx": "Short English SFX description (environment sounds only, NOT character sounds)",
          "ambience": "Background atmosphere in English",
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
    existingSequences,
    sequenceMode = "full",
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

  // Inject style-specific transition rules
  const transitionRules = STYLE_TRANSITION_RULES[directingStyle || "pixar-classic"] || STYLE_TRANSITION_RULES["pixar-classic"];
  if (transitionRules) {
    styleSection += `\n\n${transitionRules}`;
  }

  // Build character descriptions with char-N aliases for AI
  const charIdMap = new Map<string, string>(); // "char-0" → real character ID
  const charDescriptions = characters.map((c, i) => {
    const alias = `char-${i}`;
    charIdMap.set(alias, c.id);
    return `- ${alias} = ${c.markerId} "${c.name}" (${c.species || "Charakter"}): ${c.description || "Keine Beschreibung"}. Persoenlichkeit: ${c.personality || "Neutral"}`;
  }).join("\n");

  // Build beats summary — clearly mark DIALOG vs NARRATION
  const beatsSummary = storyboard.beats.map((b) => {
    const isDialog = b.characterId && b.characterId !== "narrator" && b.text.trim().length > 0;
    const typeHint = isDialog ? "DIALOG" : b.characterId === "narrator" ? "NARRATION" : "SFX/PAUSE";
    return `${b.id}: [${b.characterId || "—"}] (${typeHint}) "${b.text.substring(0, 100)}${b.text.length > 100 ? "..." : ""}" (${b.emotion}, ~${(b.estimatedDurationMs / 1000).toFixed(1)}s${b.sfx ? `, SFX: ${b.sfx}` : ""})`;
  }).join("\n");

  // Count dialog beats for verification instruction
  const dialogBeatCount = storyboard.beats.filter((b) => b.characterId && b.characterId !== "narrator" && b.text.trim().length > 0).length;

  const prompt = `Erstelle ein Film-Drehbuch aus diesen Story-Beats.

WICHTIG: Es gibt ${dialogBeatCount} DIALOG-Beats. Das Drehbuch MUSS mindestens ${dialogBeatCount} dialog-Szenen enthalten!
Jeder Beat mit Typ "DIALOG" MUSS eine eigene dialog-Szene werden mit spokenText!
Beats mit Typ "NARRATION" oder "SFX/PAUSE" werden landscape- oder transition-Szenen.
KEIN EINZIGER DIALOG DARF FEHLEN — ueberpruefe am Ende ob alle da sind.

## Story-Beats (${storyboard.beats.length} Beats, ~${(storyboard.totalEstimatedDurationMs / 1000).toFixed(0)}s):

${beatsSummary}

## Charaktere:
${charDescriptions}

## Atmosphaere (in JEDER Szene identisch):
${atmosphereText}

${locations && locations.length > 0 ? `## Verfuegbare Locations/Sets:
Die folgenden Locations stehen als Sets bereit. JEDE Sequenz MUSS eine locationId bekommen!
Weise VERSCHIEDENE Locations verschiedenen Sequenzen zu — nicht alle die gleiche.
Wenn eine Location thematisch zur Sequenz passt (z.B. "Strand" zu einer Strand-Szene), verwende sie.
Setze locationId im Sequenz-Objekt auf die ID der passenden Location.

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
${sequenceMode === "next" && existingSequences && existingSequences.length > 0 ? `## BESTEHENDE SEQUENZEN (bereits erstellt — NICHT wiederholen!):
${existingSequences.map((s, i) => `- Sequenz ${i + 1}: "${s.name}" — Ort: ${s.location} (${s.sceneCount} Szenen)${s.summary ? ` — ${s.summary}` : ""}`).join("\n")}

WICHTIG: Erstelle NUR EINE EINZIGE neue Sequenz die die Geschichte WEITERFUEHRT.
- Wiederhole NICHTS was bereits erzaehlt wurde
- Die neue Sequenz soll nahtlos an die letzte anschliessen
- Nutze einen ANDEREN Ort oder eine ANDERE Atmosphaere wenn es zur Geschichte passt
- Das JSON muss genau 1 Sequenz im "sequences" Array enthalten
` : ""}
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

### SZENEN-TYP ENTSCHEIDUNG — PFLICHT-REGEL:
Wenn ein Beat einen characterId hat UND der Beat Text enthaelt den der Charakter SPRICHT:
→ Das ist IMMER eine **dialog**-Szene. NIEMALS landscape.
→ spokenText = genau der Text aus dem Beat
→ characterId = der sprechende Charakter

Wenn ein Beat KEINEN characterId hat ODER der Charakter nichts sagt (nur Aktion):
→ Das ist eine **landscape**-Szene.
→ spokenText = null
→ characterId = setzen wenn Charakter SICHTBAR ist

### DIALOG-SZENEN:
- spokenText ist EXAKT was der Charakter SAGT. Nicht was er tut oder fuehlt.
- Lip-Sync wird automatisch generiert — die Lippen bewegen sich zum Text.
- Dialog ist KURZ und PRAEGNANT — max 1-2 Saetze pro dialog-Szene.
- JEDER Beat mit [CHARAKTER]-Marker UND gesprochenem Text = dialog-Szene!
  Beispiel Beat: "[KIKI] Das hier ist Luna!" → dialog-Szene, characterId="kiki", spokenText="Das hier ist Luna!"

### LANDSCAPE-SZENEN:
- KEIN spokenText. Rein visuell + SFX/Ambience.
- characterId setzen wenn Charakter SICHTBAR ist (z.B. laeuft, ankommt).
- Nutze landscape fuer: Establishing Shots, Uebergaenge, Action ohne Worte.

### FEHLER VERMEIDEN:
FALSCH: Beat "[KODA] Hallo, schoen dass ihr da seid!" → landscape-Szene (DIALOG GEHT VERLOREN!)
RICHTIG: Beat "[KODA] Hallo, schoen dass ihr da seid!" → dialog-Szene mit spokenText

### KEIN DIALOG DARF FEHLEN:
JEDER DIALOG-Beat MUSS eine eigene dialog-Szene bekommen. Keinen einzigen ueberspringen!
Wenn 10 DIALOG-Beats existieren, muessen mindestens 10 dialog-Szenen im Drehbuch sein.
Zaehle die DIALOG-Beats und vergleiche mit den dialog-Szenen — die Anzahl muss stimmen.
Wenn zwei verschiedene Charaktere hintereinander sprechen → ZWEI separate dialog-Szenen.`,
    },
    hoerspiel: {
      title: "HOERSPIEL mit mehreren Stimmen & SFX",
      instructions: `Mehrere Charaktere sprechen mit eigenen Stimmen. Es gibt einen Erzaehler UND direkte Dialoge.

### SZENEN-TYP ENTSCHEIDUNG — gleiche Regel wie Film:
JEDER Beat mit characterId + gesprochenem Text = dialog-Szene.
Beats ohne Dialog = landscape-Szene.
Erzaehler-Beats (characterId: "narrator") = dialog-Szene mit characterId des Hauptcharakters.

### HOERSPIEL-BESONDERHEITEN:
- Lip-Sync wird fuer dialog-Szenen automatisch generiert.
- Setze characterId bei dialog-Szenen damit die richtige Stimme zugewiesen wird.
- Nutze viele SFX-Beschreibungen in den Szenen (Schritte, Tuergeraeusche, Naturklaenge).
- Mische landscape, dialog und transition Szenen fuer Abwechslung.
- Jeder sprechende Charakter bekommt seine eigene Stimme.`,
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

  console.log(`[Screenplay] Generating ${sequenceMode === "next" ? "NEXT sequence" : "full screenplay"} from ${storyboard.beats.length} beats, ${characters.length} characters${existingSequences?.length ? `, ${existingSequences.length} existing sequences` : ""}...`);

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
  // For "next" mode, offset indices so they continue from existing sequences
  const seqOffset = sequenceMode === "next" ? (existingSequences?.length || 0) : 0;
  let audioOffsetMs = 0;
  const sequences: ScreenplaySequence[] = [];

  for (let si = 0; si < raw.sequences.length; si++) {
    const rawSeq = raw.sequences[si];
    const rawScenes = (rawSeq.scenes as Array<Record<string, unknown>>) || [];
    const globalSeqIdx = si + seqOffset;

    const scenes: StudioScene[] = [];
    for (let sci = 0; sci < rawScenes.length; sci++) {
      const rs = rawScenes[sci];
      const duration = ((rs.durationHint as number) || 5) * 1000;

      // Map char-N alias back to real character ID
      const rawCharId = rs.characterId as string | undefined;
      const resolvedCharId = rawCharId ? (charIdMap.get(rawCharId) || rawCharId) : undefined;

      // Determine clipTransition: first scene of sequence = hard-cut, rest from AI or style default
      let clipTransition = rs.clipTransition as StudioScene["clipTransition"];
      if (sci === 0) {
        clipTransition = "hard-cut"; // First scene always hard-cut (establishing shot)
      } else if (!clipTransition) {
        // Fallback based on style: one-take always seamless, others default to seamless
        const styleId = directingStyle || "pixar-classic";
        clipTransition = styleId === "long-take" ? "seamless"
          : styleId === "action" ? "hard-cut"
          : "seamless";
      }

      scenes.push({
        id: `seq${globalSeqIdx}-scene${sci}`,
        index: sci,
        beatIds: (rs.beatIds as string[]) || [],
        characterId: resolvedCharId,
        spokenText: rs.spokenText as string | undefined,
        type: (rs.type as StudioScene["type"]) || "dialog",
        sceneDescription: (rs.sceneDescription as string) || "",
        location: (rawSeq.location as string) || "",
        mood: atmosphereText,
        camera: (rs.camera as string) || "medium",
        cameraMotion: (rs.cameraMotion as StudioScene["cameraMotion"]) || undefined,
        clipTransition,
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
      id: `seq-${globalSeqIdx}`,
      orderIndex: globalSeqIdx,
      name: (rawSeq.name as string) || `Sequenz ${globalSeqIdx + 1}`,
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

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

interface ScreenplayOptions {
  storyboard: BasisStoryboard;
  characters: StudioCharacterDef[];
  directingStyle?: string;
  atmosphere?: string;
  atmospherePreset?: string;
  stylePrompt?: string; // Visual style (Disney 2D, Pixar 3D, etc.)
  targetFormat?: "portrait" | "wide";
}

const SCREENPLAY_SYSTEM = `Du bist ein preisgekroenter Animations-Regisseur und Drehbuch-Autor.
Du erhaelst Story-Beats (die atomaren Erzaehl-Einheiten einer Geschichte) und erstellst daraus ein professionelles Film-Drehbuch.

## Deine Aufgabe

Aus den Story-Beats erstellst du:
1. **Sequenzen**: Gruppen von Szenen am gleichen Ort mit gleicher Atmosphaere
2. **Szenen**: Einzelne Kamera-Einstellungen mit Regie-Anweisungen

## Sequenzen erkennen

Eine neue Sequenz beginnt wenn:
- Der Ort wechselt (z.B. vom Baum zum Meer)
- Die Atmosphaere wechselt (z.B. von Tag zu Nacht)
- Eine "Geschichte in der Geschichte" beginnt (Rueckblende, Traum, Erzaehlung)
- Ein grosser Zeitsprung passiert

Wenn die ganze Geschichte am selben Ort spielt → eine einzige Sequenz.

## Szenen-Typen

- **landscape**: Establishing Shot, Kameraschwenk, Umgebung zeigen. Kein Dialog.
- **dialog**: Charakter spricht. Lip-Sync wird generiert. Close-Up oder Medium.
- **transition**: Uebergang zwischen Szenen/Sequenzen. Kurz (2-4s).

## Regeln

1. Jede Szene maximal 15 Sekunden (Video-Generierung Limit)
2. Lange Dialog-Beats in mehrere 5-10s Szenen aufteilen
3. Vor JEDEM neuen Charakter: zoom-to-character Szene
4. Szenen muessen LUECKENLOS aneinander anschliessen (audioEndMs von N = audioStartMs von N+1)
5. Landscape-Szenen VOR Dialogen (nicht mitten im Dialog)
6. Beschreibe in jeder sceneDescription die AKTION, nicht nur "X spricht"

## Output-Format

Antworte mit einem JSON-Objekt:
{
  "sequences": [
    {
      "name": "Am KoalaTree",
      "location": "Riesiger magischer Eukalyptusbaum",
      "atmosphere": "Warmes goldenes Abendlicht...",
      "characterIds": ["koda", "kiki"],
      "transitionType": "fade-to-black" | "visual-transition" | "hard-cut",
      "scenes": [
        {
          "beatIds": ["beat-0", "beat-1"],
          "type": "landscape" | "dialog" | "transition",
          "characterId": "koda" | null,
          "spokenText": "Kurzer Text (max 100 Zeichen)",
          "sceneDescription": "2-3 Saetze: AKTION + BEWEGUNG + KAMERA",
          "camera": "close-up" | "medium" | "wide" | "slow-pan" | "zoom-in" | "zoom-out",
          "transitionTo": "cut" | "flow" | "zoom-to-character",
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

  // Build character descriptions
  const charDescriptions = characters.map((c) =>
    `- ${c.markerId} = "${c.name}" (${c.species || "Charakter"}): ${c.description || "Keine Beschreibung"}. Persoenlichkeit: ${c.personality || "Neutral"}`
  ).join("\n");

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

${stylePrompt ? `## Visueller Stil:\n${stylePrompt}\n` : ""}

Erstelle das Drehbuch als JSON. Beachte:
- Erkenne Ortswechsel und erstelle separate Sequenzen
- Teile lange Beats (>15s) in mehrere Szenen auf
- Fuege Landscape-Szenen vor dem ersten Dialog einer Sequenz ein
- Jede Szene hat audioStartMs/audioEndMs basierend auf den Beat-Timings
- Die erste Szene einer Sequenz ist IMMER landscape (Establishing Shot)`;

  // Build system prompt with directing style
  const systemPrompt = SCREENPLAY_SYSTEM + "\n\n" + styleSection + `\n\n## LICHT & ATMOSPHAERE (IDENTISCH in JEDER Szene)\n${atmosphereText}\nWiederhole diese Beschreibung in jeder sceneDescription.`;

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

      scenes.push({
        id: `seq${si}-scene${sci}`,
        index: sci,
        beatIds: (rs.beatIds as string[]) || [],
        characterId: rs.characterId as string | undefined,
        spokenText: rs.spokenText as string | undefined,
        type: (rs.type as StudioScene["type"]) || "dialog",
        sceneDescription: (rs.sceneDescription as string) || "",
        location: (rawSeq.location as string) || "",
        mood: atmosphereText,
        camera: (rs.camera as string) || "medium",
        transitionTo: rs.transitionTo as StudioScene["transitionTo"],
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
      characterIds: (rawSeq.characterIds as string[]) || [],
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

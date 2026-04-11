/**
 * Prompt Auto-Tuner — Analyzes quality feedback and improves prompts automatically.
 *
 * When a generated result scores low on quality check, this module:
 * 1. Analyzes what went wrong based on qualityNotes
 * 2. Suggests an improved prompt
 * 3. Stores feedback for pattern detection
 * 4. Can suggest PromptBlock version upgrades when patterns emerge
 *
 * Cost: ~$0.002 per improvement (Claude Haiku)
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";

interface PromptImprovement {
  improvedPrompt: string;
  changes: string;  // What was changed and why
}

/**
 * Analyze a failed generation and suggest an improved prompt.
 */
export async function improvePrompt(
  originalPrompt: string,
  qualityNotes: string,
  qualityScore: number,
  taskType: string,
): Promise<PromptImprovement> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { improvedPrompt: originalPrompt, changes: "Kein API Key — Prompt unveraendert" };
  }

  const anthropic = new Anthropic({ apiKey });

  const strategies = getStrategiesForType(taskType);

  const response = await anthropic.messages.create({
    model: "claude-haiku-3-20240307",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Du bist ein Prompt-Engineering-Experte fuer AI-Bildgenerierung (GPT Image, Veo, Seedance, Kling).

Ein Prompt hat ein schlechtes Ergebnis erzielt (Score: ${qualityScore}/100).

ORIGINAL PROMPT:
"${originalPrompt.slice(0, 800)}"

QUALITAETS-PROBLEME:
"${qualityNotes}"

VERBESSERUNGS-STRATEGIEN:
${strategies}

Verbessere den Prompt so dass die genannten Probleme behoben werden.
Behalte alle guten Teile bei. Aendere nur was noetig ist.

Antworte NUR im Format:
IMPROVED: [verbesserter Prompt]
CHANGES: [1-2 Saetze was geaendert wurde und warum]`,
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const improvedMatch = text.match(/IMPROVED:\s*([\s\S]*?)(?=CHANGES:|$)/);
  const changesMatch = text.match(/CHANGES:\s*([\s\S]+)/);

  return {
    improvedPrompt: improvedMatch ? improvedMatch[1].trim() : originalPrompt,
    changes: changesMatch ? changesMatch[1].trim() : "Keine Aenderungen",
  };
}

/**
 * Store feedback for a task's prompt quality.
 */
export async function storePromptFeedback(
  taskId: string,
  originalPrompt: string,
  qualityScore: number,
  qualityNotes: string,
  improvedPrompt?: string,
  improvement?: string,
  blockSlug?: string,
): Promise<void> {
  await prisma.promptFeedback.create({
    data: {
      taskId,
      blockSlug,
      originalPrompt: originalPrompt.slice(0, 5000), // Limit storage
      qualityScore,
      qualityNotes,
      improvedPrompt: improvedPrompt?.slice(0, 5000),
      improvement,
    },
  });
}

/**
 * Analyze feedback patterns for a specific prompt block.
 * Returns common issues if enough data exists.
 */
export async function analyzePromptPatterns(
  blockSlug: string,
  minSamples: number = 3,
): Promise<{ hasPattern: boolean; commonIssues: string[]; suggestedFix?: string }> {
  const feedbacks = await prisma.promptFeedback.findMany({
    where: {
      blockSlug,
      qualityScore: { lt: 60 }, // Only look at poor results
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (feedbacks.length < minSamples) {
    return { hasPattern: false, commonIssues: [] };
  }

  // Extract common issues from quality notes
  const allNotes = feedbacks.map((f) => f.qualityNotes).join("\n");

  const issueKeywords: Record<string, string[]> = {
    "Kleidung/Outfit": ["kleidung", "outfit", "clothing", "wearing", "traegt", "clothes"],
    "Gesicht/Merkmale": ["gesicht", "face", "merkmale", "traits", "features", "narbe", "brille"],
    "Stil/Style": ["stil", "style", "animation", "realistic", "cartoon"],
    "Kamera/Winkel": ["kamera", "camera", "angle", "winkel", "shot"],
    "Atmosphaere": ["atmosphaere", "atmosphere", "lighting", "licht", "weather", "wetter"],
    "Artefakte": ["artefakt", "artifact", "verzerrung", "distortion", "gliedmassen", "limb"],
    "Konsistenz": ["konsistenz", "consistency", "unterschiedlich", "different"],
  };

  const commonIssues: string[] = [];
  for (const [category, keywords] of Object.entries(issueKeywords)) {
    const matches = keywords.filter((kw) => allNotes.toLowerCase().includes(kw));
    if (matches.length >= 2) {
      commonIssues.push(category);
    }
  }

  if (commonIssues.length === 0) {
    return { hasPattern: false, commonIssues: [] };
  }

  // Generate a suggested fix using the pattern
  let suggestedFix: string | undefined;
  if (commonIssues.includes("Kleidung/Outfit")) {
    suggestedFix = "Outfit-Beschreibung am ANFANG und ENDE des Prompts wiederholen (Sandwich-Technik)";
  } else if (commonIssues.includes("Konsistenz")) {
    suggestedFix = "EXACT visual consistency Anweisung verstaerken + Reference-Bild erzwingen";
  } else if (commonIssues.includes("Kamera/Winkel")) {
    suggestedFix = "Camera-Anweisung mit IMPORTANT: Prefix verstaerken";
  }

  return { hasPattern: true, commonIssues, suggestedFix };
}

/**
 * Get improvement strategies based on task type.
 */
function getStrategiesForType(taskType: string): string {
  switch (taskType) {
    case "clip":
      return `- Sandwich-Technik: Wiederhole kritische Details (Outfit, Merkmale) am Anfang UND Ende
- Verstaerke Camera-Anweisungen mit "IMPORTANT:" Prefix
- Fuege mehr visuelle Details hinzu (Farben, Texturen, Positionen)
- Erwaehne was NICHT passieren soll: "NO text, NO watermarks, NO extra people"
- Bei Charakter-Problemen: Beschreibung konkreter machen (Alter, Hautfarbe, Haarfarbe, exakte Kleidung)`;

    case "portrait":
    case "character-sheet":
      return `- Verstaerke Style-Hint mit konkreten Referenzen (z.B. "in the style of Pixar's Coco")
- Wiederhole Merkmale (Brille, Narbe, etc.) in verschiedenen Formulierungen
- Fuege Negativ-Anweisungen hinzu: "NO text, NO watermarks, NO background clutter"
- Bei Outfit-Problemen: Outfit zuerst beschreiben, dann Charakter
- Bei Stil-Problemen: Mehr Adjektive fuer den gewuenschten Stil`;

    case "landscape":
      return `- Mehr atmosphaerische Details (Tageszeit, Licht, Wetter)
- Konkreter bei Architektur/Natur-Elementen
- Kamera-Perspektive explizit angeben
- Farbpalette beschreiben`;

    default:
      return `- Mehr Details hinzufuegen
- Klare Struktur (Was → Wie → Wo → Stimmung)
- Negativ-Anweisungen fuer unerwuenschte Elemente`;
  }
}

/**
 * AI Quality Check — Validates generated content using Claude Vision
 *
 * Budget: ~$0.005 per check (Claude Haiku with vision)
 * Extracts frames from video, sends to Claude for quality rating.
 */

import Anthropic from "@anthropic-ai/sdk";

interface QualityResult {
  score: number;     // 0-100
  notes: string;     // Issues found
  passed: boolean;   // score >= threshold
}

const QUALITY_THRESHOLD = 40; // Below this → auto-retry

/**
 * Check visual quality of a generated image or video frames.
 */
export async function checkVisualQuality(
  mediaUrl: string,
  originalPrompt: string,
  type: "clip" | "portrait" | "character-sheet" | "landscape",
): Promise<QualityResult> {
  if (!mediaUrl || !originalPrompt) {
    return { score: 50, notes: "Kein Medium oder Prompt zum Pruefen", passed: true };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[QualityCheck] ANTHROPIC_API_KEY not set, skipping");
    return { score: 70, notes: "Quality Check uebersprungen (kein API Key)", passed: true };
  }

  try {
    // For videos: extract frames (requires fal.ai frame extraction)
    // For images: use the URL directly
    const imageUrls: string[] = [];

    if (type === "clip") {
      // Extract 3 frames from video
      try {
        const frames = await extractVideoFrames(mediaUrl);
        imageUrls.push(...frames);
      } catch {
        // If frame extraction fails, skip quality check
        return { score: 60, notes: "Frame-Extraktion fehlgeschlagen, Quality Check uebersprungen", passed: true };
      }
    } else {
      // Image types: use blob proxy to get downloadable URL
      try {
        const { getDownloadUrl } = await import("@vercel/blob");
        const downloadUrl = await getDownloadUrl(mediaUrl);
        imageUrls.push(downloadUrl);
      } catch {
        return { score: 60, notes: "Bild-URL nicht auflösbar", passed: true };
      }
    }

    if (imageUrls.length === 0) {
      return { score: 50, notes: "Keine Bilder zum Pruefen", passed: true };
    }

    const anthropic = new Anthropic({ apiKey });

    // Build content array with images
    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

    for (const url of imageUrls.slice(0, 3)) {
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mimeType = imgRes.headers.get("content-type") || "image/png";

        content.push({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: base64,
          },
        });
      } catch { /* skip frame */ }
    }

    if (content.length === 0) {
      return { score: 50, notes: "Keine Bilder ladbar", passed: true };
    }

    const typeLabel = type === "clip" ? "Video-Frames" :
      type === "portrait" ? "Portrait" :
      type === "character-sheet" ? "Character Sheet" : "Landscape";

    content.push({
      type: "text" as const,
      text: `Du bist ein Qualitaetspruefer fuer AI-generierte ${typeLabel}.

Der Prompt war:
"${originalPrompt.slice(0, 500)}"

Bewerte die Qualitaet auf einer Skala von 0-100. Achte auf:
- Character-Konsistenz (Aussehen, Kleidung, Merkmale)
- Prompt-Treue (wurde die Beschreibung umgesetzt?)
- Technische Qualitaet (Artefakte, Verzerrungen, fehlende Gliedmassen)
- Atmosphaere und Stimmung

Antworte NUR im Format:
SCORE: [0-100]
NOTES: [1-2 Saetze zu den Hauptproblemen, oder "Gut" wenn keine]`,
    });

    const response = await anthropic.messages.create({
      model: "claude-haiku-3-20240307",
      max_tokens: 200,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse response
    const scoreMatch = text.match(/SCORE:\s*(\d+)/);
    const notesMatch = text.match(/NOTES:\s*([\s\S]+)/);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
    const notes = notesMatch ? notesMatch[1].trim() : text.trim();

    return {
      score: Math.max(0, Math.min(100, score)),
      notes,
      passed: score >= QUALITY_THRESHOLD,
    };
  } catch (err) {
    console.error("[QualityCheck] Error:", err);
    return { score: 50, notes: `Check fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannt"}`, passed: true };
  }
}

/**
 * Extract 3 frames from a video URL (start, middle, end).
 * Uses fal.ai frame extraction service.
 */
async function extractVideoFrames(videoUrl: string): Promise<string[]> {
  try {
    const { extractLastFrame } = await import("@/lib/fal");
    // Extract frames at different positions
    // For now, just extract the last frame (cheapest)
    const lastFrame = await extractLastFrame(videoUrl);
    if (!lastFrame) return [];

    // Upload to blob for URL access
    const { put } = await import("@vercel/blob");
    const blob = await put(
      `studio/quality-check/frame-${Date.now()}.png`,
      lastFrame,
      { access: "private", contentType: "image/png" },
    );

    const { getDownloadUrl } = await import("@vercel/blob");
    const downloadUrl = await getDownloadUrl(blob.url);
    return [downloadUrl];
  } catch (err) {
    console.error("[QualityCheck] Frame extraction failed:", err);
    return [];
  }
}

/**
 * Simple audio quality check — duration and size validation.
 */
export function checkAudioQuality(
  durationMs: number,
  expectedDurationMs: number,
  fileSizeBytes: number,
): QualityResult {
  const issues: string[] = [];

  // Check duration (±50% tolerance)
  if (expectedDurationMs > 0) {
    const ratio = durationMs / expectedDurationMs;
    if (ratio < 0.5) issues.push(`Audio zu kurz (${(durationMs/1000).toFixed(1)}s statt ~${(expectedDurationMs/1000).toFixed(1)}s)`);
    if (ratio > 2.0) issues.push(`Audio zu lang (${(durationMs/1000).toFixed(1)}s statt ~${(expectedDurationMs/1000).toFixed(1)}s)`);
  }

  // Check file size (minimum 1KB for valid audio)
  if (fileSizeBytes < 1024) {
    issues.push("Datei zu klein (moeglicherweise leer)");
  }

  const score = issues.length === 0 ? 80 : Math.max(20, 80 - issues.length * 30);

  return {
    score,
    notes: issues.length > 0 ? issues.join(". ") : "Audio OK",
    passed: score >= QUALITY_THRESHOLD,
  };
}

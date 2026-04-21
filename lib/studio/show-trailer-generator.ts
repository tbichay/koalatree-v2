/**
 * Show-Trailer Generator — 15-25s Audio-Teaser fuer eine Show.
 *
 * Zweck: Canzoia zeigt in der Show-Detail einen Play-Button, der diesen
 * Trailer abspielt — als Sound-Sample, wie sich Ton und Cast anfuehlen,
 * bevor der User eine echte Generierung startet. Ohne Trailer bleibt
 * die Show im Katalog "taub".
 *
 * Pipeline ist eine geschrumpfte Version des Episode-Generators:
 *   1. Claude schreibt 15-25s Teaser-Script mit [ACTORID]-Markern
 *   2. parseStorySegments + generateAudio (Multi-Voice) → MP3
 *   3. Upload nach Vercel Blob (private store, gleich wie Episoden)
 *   4. Show.trailerAudioUrl + revisionHash update
 *
 * Warum sync (nicht cron-queued wie Episoden):
 *   - Total ~15-25s + upload → passt in Vercel-Pro's 300s limit
 *   - Admin klickt "Generieren" und will sofort horchen
 *   - Keine idempotencyKey-Mechanik noetig — Admin-Only, no Canzoia
 *
 * Gegen Schnellfeuer: die Route (app/api/studio/shows/[slug]/trailer)
 * serialisiert implizit durch `trailerAudioUrl`-Overwrite, aber zwei
 * parallele Clicks koennen Blob-Zombies produzieren. Fuer Admin-Only
 * OK — Kostenimpact waere $0.02/Trailer.
 */

import { createAnthropicClient } from "@/lib/ai-clients";
import { generateAudio, setVoiceOverrides, clearVoiceOverrides } from "@/lib/elevenlabs";
import { prisma } from "@/lib/db";
import { put } from "@vercel/blob";
import { newRevisionHash } from "./show-revision";
import type { CharacterVoiceSettings } from "@/lib/types";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const TRAILER_SECONDS_TARGET = 20; // ~20s Richtwert
const TRAILER_CHARS_APPROX = 350; // ~20s gesprochener deutscher Text

export interface TrailerResult {
  trailerAudioUrl: string;
  text: string;
  durationSec: number;
  revisionHash: string;
}

/**
 * Baut einen kompletten Trailer fuer eine Show und persistiert das
 * Ergebnis auf Show.trailerAudioUrl. Wirft, wenn die Show kein passendes
 * Setup hat (kein Cast, kein brandVoice) — der Caller soll den Fehler
 * dem Admin zeigen statt einen halbfertigen Trailer zu speichern.
 */
export async function generateShowTrailer(slug: string): Promise<TrailerResult> {
  const show = await prisma.show.findUnique({
    where: { slug },
    include: { cast: { include: { actor: true }, orderBy: { orderIndex: "asc" } } },
  });
  if (!show) throw new Error(`Show '${slug}' nicht gefunden`);
  if (show.cast.length === 0) {
    throw new Error("Show hat keinen Cast — Actors erst im Cast-Tab anlegen");
  }

  const castDescription = show.cast
    .map((c) => {
      const parts = [
        `[${c.actor.id}] ${c.actor.displayName} (${c.actor.species ?? "—"})`,
        c.actor.personality ? `Wesen: ${c.actor.personality}` : null,
        c.actor.speechStyle ? `Sprechweise: ${c.actor.speechStyle}` : null,
        c.actor.catchphrases.length > 0
          ? `Signature: ${c.actor.catchphrases.slice(0, 3).map((p) => `"${p}"`).join(", ")}`
          : null,
      ].filter(Boolean);
      return parts.join(" · ");
    })
    .join("\n");

  const actorIdList = show.cast.map((c) => c.actor.id).join(", ");

  const systemPrompt = `Du schreibst einen Audio-Trailer fuer eine Show — ca. ${TRAILER_SECONDS_TARGET} Sekunden gesprochen, ~${TRAILER_CHARS_APPROX} Zeichen. Der Trailer muss sich fuer ein Kind/Erwachsenen wie ein "Das-will-ich-hoeren" anfuehlen.

SHOW:
  Titel: ${show.title}
  Untertitel: ${show.subtitle ?? "—"}
  Beschreibung: ${show.description}
  Kategorie: ${show.category}
  Altersband: ${show.ageBand ?? "alle Altersstufen"}
  Brand-Voice: ${show.brandVoice || "(nicht gesetzt — nutze die Beschreibung)"}

CAST (IDs sind fix, nutze GENAU diese):
${castDescription}

MARKER-FORMAT (pflicht):
- Jede Zeile, die jemand spricht, beginnt mit [ACTORID] — z.B. [${show.cast[0].actor.id}]
- Optional: [SFX: kurze Beschreibung] fuer 1 Soundeffekt (z.B. [SFX: Glockenspiel])
- Optional: [AMBIENCE: Atmosphaere] fuer Hintergrund (nur 1 Mal, ganz am Anfang)
- Keine Regieanweisungen in Klammern im Sprechtext

REGELN:
1. Erlaubte Actor-IDs: ${actorIdList}. KEINE anderen — nicht erfinden.
2. 2-4 kurze Dialogzeilen, NICHT monolog. Wenn ein Actor existiert, sollte er/sie eine Zeile bekommen. Nicht alle muessen sprechen, wenn Cast gross ist (dann die 2-3 charakteristischsten).
3. Ende mit einem catchy Satz, der die Show "verkauft" — eine Einladung, nicht eine Zusammenfassung. Passender Actor spricht diese Schlusszeile.
4. Keine expliziten Zeitangaben ("In 5 Minuten…"), keine Dauer-Versprechen, keine Platform-Nennung ("Koalatree", "Canzoia" etc.)
5. Gesamtlaenge: etwa ${TRAILER_CHARS_APPROX} Zeichen inkl. Markern. Lieber etwas kuerzer als laenger.
6. Sprache: matche die Sprache der Show-Beschreibung (meistens Deutsch).
7. KEIN Markdown, KEINE Kommentare. Nur der Plain-Text-Trailer wie er gesprochen werden soll.

Beispiel-Struktur:
[AMBIENCE: ruhige Abendatmosphaere]
[${show.cast[0].actor.id}] Kurze einladende Zeile, 1-2 Saetze.
[${show.cast[Math.min(1, show.cast.length - 1)].actor.id}] Antwort oder Erwiderung, 1-2 Saetze.
[${show.cast[0].actor.id}] Schlusszeile, die neugierig macht.`;

  const userPrompt = `Schreibe jetzt den Trailer. Plain-Text, keine Erklaerung.`;

  const client = createAnthropicClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude hat keinen Trailer-Text geliefert");
  }
  const trailerText = textBlock.text.trim();
  if (!trailerText) {
    throw new Error("Claude hat einen leeren Trailer-Text geliefert");
  }
  // Sanity: enthaelt mind. einen bekannten ACTORID-Marker?
  const knownIds = new Set(show.cast.map((c) => c.actor.id));
  const markerUsed = [...trailerText.matchAll(/\[([A-Z][A-Z0-9_]*)\]/g)].some((m) =>
    knownIds.has(m[1]),
  );
  if (!markerUsed) {
    throw new Error(
      "Claude hat keinen gueltigen [ACTORID]-Marker genutzt — Trailer nicht sprechbar",
    );
  }

  // Voice-Overrides setzen (gleich wie Episode-Generator), damit Multi-Voice
  // auf die Cast-Actors resolved statt auf Kids-App-Default-Voices.
  const overrides = new Map<string, { voiceId: string; settings: CharacterVoiceSettings }>();
  for (const c of show.cast) {
    overrides.set(c.actor.id, {
      voiceId: c.actor.voiceId,
      settings: c.actor.voiceSettings as unknown as CharacterVoiceSettings,
    });
  }
  setVoiceOverrides(overrides);

  let audio;
  try {
    audio = await generateAudio(trailerText);
  } finally {
    clearVoiceOverrides();
  }

  const durationSec = audio.timeline.length
    ? Math.ceil(audio.timeline[audio.timeline.length - 1].endMs / 1000)
    : TRAILER_SECONDS_TARGET;

  // Upload: eigener Pfad, damit er neben dem Episode-Blob koexistiert.
  // addRandomSuffix, damit Re-Generate den alten Blob nicht ueberschreibt
  // — Canzoia-Clients, die gerade mit dem alten URL laden, brechen sonst
  // mit 404 ab. Der alte Blob bleibt als Waise, Cleanup via GC-Cron
  // (falls wir mal einen brauchen).
  const blob = await put(
    `shows/${slug}/trailer.mp3`,
    Buffer.from(audio.wav),
    {
      access: "private",
      contentType: "audio/mpeg",
      addRandomSuffix: true,
    },
  );

  const revisionHash = newRevisionHash();
  await prisma.show.update({
    where: { id: show.id },
    data: {
      trailerAudioUrl: blob.url,
      revisionHash,
    },
  });

  return {
    trailerAudioUrl: blob.url,
    text: trailerText,
    durationSec,
    revisionHash,
  };
}

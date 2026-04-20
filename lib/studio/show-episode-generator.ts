/**
 * ShowEpisode Generator — text + audio pipeline for Canzoia-facing shows.
 *
 * Analog zur Kids-App-Pipeline (`lib/prompts.ts → buildStoryPrompt + /api/generate-story`),
 * aber ALLE Constants kommen aus der DB:
 *
 *   Show.brandVoice                         → Brand-Overlay (Show-Ebene)
 *   ShowFokus.showOverlay                   → Fine-Tune-Overlay (Show+Fokus-Ebene)
 *   FokusTemplate.systemPromptSkeleton     → Format-Regeln
 *   Actor.persona + ageStyles[band]         → Charakter-Profil
 *   Actor.voiceId + voiceSettings           → TTS-Voice (via setVoiceOverrides)
 *   ShowFokus.castRoles                     → lead/support/minimal Zuordnung pro Actor
 *   ShowFokus.userInputSchema               → erwartete userInputs (theme, lernziel, dauer, …)
 *
 * Das marker-Format ([ACTORID], [SFX:…], [AMBIENCE:…]) ist identisch zum
 * Kids-App-Format, damit wir `parseStorySegments` + `generateMultiVoiceAudio`
 * aus `lib/story-parser.ts` + `lib/elevenlabs.ts` 1:1 wiedernutzen können.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { createAnthropicClient } from "@/lib/ai-clients";
import {
  generateAudio,
  setVoiceOverrides,
  clearVoiceOverrides,
} from "@/lib/elevenlabs";
import { put } from "@vercel/blob";
import type { Prisma } from "@prisma/client";
import type { CharacterVoiceSettings } from "@/lib/types";
import { deliverWebhookSafe } from "@/lib/canzoia/webhooks";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;

// ── Types ──────────────────────────────────────────────────────

export type ShowEpisodeStatus =
  | "queued"
  | "scripting"
  | "synthesizing"
  | "uploading"
  | "completed"
  | "failed";

interface CastEntry {
  actorId: string;
  role: "lead" | "support" | "minimal";
}

interface ResolvedEpisodeInput {
  showId: string;
  showSlug: string;
  showTitle: string;
  brandVoice: string;
  fokusId: string;
  fokusTemplateId: string;
  fokusSystemSkeleton: string;
  fokusInteractionStyle: string | null;
  showOverlay: string;
  targetDurationMin: number;
  ageBand: string | null;
  cast: Array<{
    actor: {
      id: string;
      displayName: string;
      persona: string;
      ageStyles: Record<string, string>;
      voiceId: string;
      voiceSettings: Record<string, number>;
      personality: string | null;
      speechStyle: string | null;
      catchphrases: string[];
      backstory: string | null;
      relationships: Record<string, string>;
    };
    role: "lead" | "support" | "minimal";
    styleOverride: string | null;
  }>;
  userInputs: Record<string, unknown>;
  profileSnapshot: Record<string, unknown>;
}

// ── Load + resolve DB state for a generation request ──────────

export async function loadEpisodeInput(params: {
  showSlug: string;
  showFokusId: string;
  userInputs: Record<string, unknown>;
  profileSnapshot: Record<string, unknown>;
}): Promise<ResolvedEpisodeInput> {
  const show = await prisma.show.findUnique({
    where: { slug: params.showSlug },
    include: {
      cast: { include: { actor: true } },
      foki: {
        where: { id: params.showFokusId },
        include: { fokusTemplate: true },
      },
    },
  });
  if (!show) throw new Error(`Show '${params.showSlug}' nicht gefunden`);
  const fokus = show.foki[0];
  if (!fokus) throw new Error(`ShowFokus '${params.showFokusId}' gehört nicht zu dieser Show`);
  if (!fokus.enabled) throw new Error("Dieser Fokus ist deaktiviert");

  // castRoles JSON: could be { lead: "actorId", support: [ids…] }
  // or the richer seed-format { raw: { [actorId]: role }, lead: [], support: [], minimal: [] }
  // Normalise to a flat actorId → role map, then fill from show.cast.
  const castRolesJson = (fokus.castRoles ?? {}) as Record<string, unknown>;
  const roleByActor = new Map<string, "lead" | "support" | "minimal">();

  function markRole(actorId: string, role: "lead" | "support" | "minimal") {
    if (!roleByActor.has(actorId)) roleByActor.set(actorId, role);
  }

  // Flat raw map form
  if (castRolesJson.raw && typeof castRolesJson.raw === "object") {
    for (const [aid, r] of Object.entries(castRolesJson.raw as Record<string, string>)) {
      if (r === "lead" || r === "support" || r === "minimal") markRole(aid, r);
    }
  }
  // Grouped arrays form
  const lead = castRolesJson.lead;
  if (typeof lead === "string") markRole(lead, "lead");
  if (Array.isArray(lead)) lead.forEach((a) => typeof a === "string" && markRole(a, "lead"));
  if (Array.isArray(castRolesJson.support)) {
    (castRolesJson.support as unknown[]).forEach((a) => typeof a === "string" && markRole(a, "support"));
  }
  if (Array.isArray(castRolesJson.minimal)) {
    (castRolesJson.minimal as unknown[]).forEach((a) => typeof a === "string" && markRole(a, "minimal"));
  }

  // Anything in show.cast without an explicit role → treat as support.
  const resolvedCast = show.cast
    .map((row) => {
      const role = roleByActor.get(row.actorId) ?? "support";
      return {
        actor: {
          id: row.actor.id,
          displayName: row.actor.displayName,
          persona: row.actor.persona,
          ageStyles: (row.actor.ageStyles ?? {}) as Record<string, string>,
          voiceId: row.actor.voiceId,
          voiceSettings: (row.actor.voiceSettings ?? {}) as Record<string, number>,
          personality: row.actor.personality,
          speechStyle: row.actor.speechStyle,
          catchphrases: row.actor.catchphrases ?? [],
          backstory: row.actor.backstory,
          relationships: (row.actor.relationships ?? {}) as Record<string, string>,
        },
        role,
        styleOverride: row.styleOverride,
      };
    })
    // Sort: lead first, then support, then minimal (matches Kids-App conv.)
    .sort((a, b) => {
      const rank = { lead: 0, support: 1, minimal: 2 } as const;
      return rank[a.role] - rank[b.role];
    });

  if (resolvedCast.length === 0) {
    throw new Error("Show hat keinen Cast — Actors zuerst in /studio/shows/[slug] (Cast-Tab) anlegen");
  }

  return {
    showId: show.id,
    showSlug: show.slug,
    showTitle: show.title,
    brandVoice: show.brandVoice ?? "",
    fokusId: fokus.id,
    fokusTemplateId: fokus.fokusTemplateId,
    fokusSystemSkeleton: fokus.fokusTemplate.systemPromptSkeleton,
    fokusInteractionStyle: fokus.fokusTemplate.interactionStyle,
    showOverlay: fokus.showOverlay ?? "",
    targetDurationMin: fokus.targetDurationMin,
    ageBand: show.ageBand,
    cast: resolvedCast,
    userInputs: params.userInputs,
    profileSnapshot: params.profileSnapshot,
  };
}

// ── Prompt builder ─────────────────────────────────────────────

function ageBandForAge(age: number | undefined): string {
  if (!age || age < 6) return "3-5";
  if (age < 9) return "6-8";
  if (age < 13) return "9-12";
  return "13+";
}

function wordTargetForDuration(minutes: number): string {
  // Kids-App-Kalibrierung: 150 Wörter/Min. Rückrechnung:
  const lower = Math.round(minutes * 130);
  const upper = Math.round(minutes * 170);
  return `${lower}-${upper}`;
}

export function buildShowEpisodePrompt(input: ResolvedEpisodeInput): {
  system: string;
  user: string;
} {
  // Determine which age style each actor should use
  const profileAge = typeof input.profileSnapshot.ageYears === "number"
    ? (input.profileSnapshot.ageYears as number)
    : undefined;
  const ageBand = input.ageBand ?? ageBandForAge(profileAge);

  const activeMarkers = input.cast.map((c) => `[${c.actor.id.toUpperCase()}]`);
  const characterProfiles = input.cast
    .map((c) => {
      const ageStyle = c.actor.ageStyles[ageBand] ?? c.actor.ageStyles["6-8"] ?? "";
      const role = c.role.toUpperCase();
      const styleOverrideNote = c.styleOverride ? `\n   Show-Override: ${c.styleOverride}` : "";

      // Extra character dimensions — only injected when the admin actually
      // filled them, so legacy seed actors without these fields stay lean.
      const extras: string[] = [];
      if (c.actor.personality) extras.push(`   Wesen: ${c.actor.personality}`);
      if (c.actor.speechStyle) extras.push(`   Sprechweise: ${c.actor.speechStyle}`);
      if (c.actor.catchphrases.length > 0) {
        extras.push(`   Signature-Phrasen: ${c.actor.catchphrases.map((p) => `"${p}"`).join(", ")}`);
      }
      if (c.actor.backstory) extras.push(`   Hintergrund: ${c.actor.backstory}`);

      // Relationships only to other actors actually in this cast.
      const castIds = new Set(input.cast.map((x) => x.actor.id));
      const relEntries = Object.entries(c.actor.relationships).filter(([otherId]) =>
        castIds.has(otherId)
      );
      if (relEntries.length > 0) {
        const rels = relEntries
          .map(([otherId, rel]) => {
            const other = input.cast.find((x) => x.actor.id === otherId);
            return `${other?.actor.displayName ?? otherId}: ${rel}`;
          })
          .join("; ");
        extras.push(`   Beziehungen: ${rels}`);
      }
      const extrasBlock = extras.length > 0 ? `\n${extras.join("\n")}` : "";

      return `• ${c.actor.displayName} [${c.actor.id.toUpperCase()}] — Rolle in dieser Episode: ${role}
   Persona: ${c.actor.persona}
   Alters-Stil (${ageBand}): ${ageStyle}${extrasBlock}${styleOverrideNote}`;
    })
    .join("\n\n");

  const lead = input.cast.find((c) => c.role === "lead") ?? input.cast[0];
  const leadMarker = `[${lead.actor.id.toUpperCase()}]`;

  const wordTarget = wordTargetForDuration(input.targetDurationMin);
  const sfxCount =
    input.targetDurationMin <= 3 ? "3-5" :
    input.targetDurationMin <= 8 ? "5-8" : "8-14";

  const profileName = typeof input.profileSnapshot.displayName === "string"
    ? (input.profileSnapshot.displayName as string)
    : "der Hörer";
  const profileInterests = Array.isArray(input.profileSnapshot.interests)
    ? (input.profileSnapshot.interests as string[]).join(", ")
    : "";
  const favoriteAnimal = typeof input.profileSnapshot.favoriteAnimal === "string"
    ? (input.profileSnapshot.favoriteAnimal as string)
    : "";

  const theme = typeof input.userInputs.theme === "string" ? input.userInputs.theme : "";
  const lernziel = typeof input.userInputs.lernziel === "string" ? input.userInputs.lernziel : "";

  const system = `Du produzierst eine Audio-Episode für eine KoalaTree-Show. Das ist ein lebendiges Hörspiel mit mehreren Charakteren.

═══════════════════════════
SHOW: ${input.showTitle}
═══════════════════════════

${input.brandVoice || "(Keine Show-Brand-Voice definiert.)"}

═══════════════════════════
DIE CHARAKTERE
═══════════════════════════

${characterProfiles}

═══════════════════════════
HÖRSPIEL-DYNAMIK
═══════════════════════════

${input.fokusInteractionStyle ?? `
Mehrere Charaktere interagieren. ${lead.actor.displayName} ist LEAD und trägt die Erzählung.
Andere werfen ${input.cast.length > 1 ? "ergänzende Gedanken, Reaktionen, kurze Dialoge ein" : "nichts ein — Solo-Stück"}.
Wechsel sollen natürlich wirken — nicht jeder Satz pro Charakter, sondern kleine Absätze.
`}

═══════════════════════════
ATMOSPHÄRE / AMBIENCE
═══════════════════════════

Setze GENAU EINEN [AMBIENCE:...] Marker ganz am Anfang. Beschreibung auf ENGLISCH, 5-10 Wörter.
Beispiele: [AMBIENCE:Peaceful forest at night with soft crickets]  /  [AMBIENCE:Cozy fireplace crackling with wind outside]

═══════════════════════════
SOUNDEFFEKTE
═══════════════════════════

Baue ${sfxCount} [SFX:...] Marker ein. Auf ENGLISCH, 3-8 Wörter, auf eigener Zeile, VOR dem zugehörigen Text.
KEINE beängstigenden Sounds. Nach jedem [SFX:...] MUSS ein Charakter-Marker folgen — niemals zwei SFX hintereinander.

═══════════════════════════
NATÜRLICHE SPRACHE
═══════════════════════════

- Füllwörter einbauen (Hmm…, Also…, Weißt du…)
- Dreipunkte (…) für Pausen, Gedankenstriche (—) für Zögerung
- Tempo-Variation (spannend: kurze Sätze; ruhig: längere)
- KEINE *Sternchen-Aktionen* oder (Klammer-Aktionen) — werden vorgelesen!
- Audio-Tags sparsam (2-4): [whispers], [excited], [laughs], [curious]
- NIEMALS [sad], [angry], [scared]

═══════════════════════════
AUDIO-MARKIERUNGEN
═══════════════════════════

[AMBIENCE:english description] = Hintergrund-Atmosphäre (NUR EINMAL, ganz am Anfang)
${activeMarkers.map((m) => `${m} = ${m.slice(1, -1)} spricht`).join("\n")}
[SFX:english description] = Soundeffekt (eigene Zeile, VOR dem Text)
[PAUSE] = 2-3 Sekunden Stille
[ATEMPAUSE] = längere Atem-Pause

Verwende NUR diese Marker: ${activeMarkers.join(", ")}.

═══════════════════════════
FORMAT-REGELN (Fokus: ${input.fokusTemplateId})
═══════════════════════════

${input.fokusSystemSkeleton}

${input.showOverlay ? `═══════════════════════════\nSHOW-SPEZIFISCHER FEINSCHLIFF\n═══════════════════════════\n\n${input.showOverlay}\n` : ""}
═══════════════════════════
WICHTIGE REGELN
═══════════════════════════

- Deutsch, warmer Ton
- NIEMALS angstauslösend
- Ende positiv, sicher, ruhig
- Baue den Namen natürlich ein (regelmäßig, aber nicht in jedem Satz)
- LÄNGE: ~${wordTarget} Wörter (≈${input.targetDurationMin} Minuten).

Schreibe NUR die Episode — keine Titel, keine Meta-Kommentare. Beginne direkt mit [AMBIENCE:...] gefolgt von ${leadMarker} oder [SFX:...].`;

  const user = `Erstelle die Episode für:

Name: ${profileName}${profileAge ? `\nAlter: ${profileAge} Jahre` : ""}${profileInterests ? `\nInteressen: ${profileInterests}` : ""}${favoriteAnimal ? `\nLieblingstier: ${favoriteAnimal}` : ""}
${theme ? `\nThema: ${theme}` : ""}${lernziel ? `\nPädagogisches Ziel: ${lernziel}` : ""}

Beginne jetzt. Erster Marker: [AMBIENCE:...], dann [SFX:...] oder ${leadMarker}.`;

  return { system, user };
}

// ── Claude call ────────────────────────────────────────────────

async function generateEpisodeText(input: ResolvedEpisodeInput): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const { system, user } = buildShowEpisodePrompt(input);
  const client = createAnthropicClient();
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlocks = res.content.filter((b) => b.type === "text");
  const text = textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();

  if (!text) throw new Error("Claude hat keinen Text geliefert");

  return {
    text,
    inputTokens: res.usage.input_tokens ?? 0,
    outputTokens: res.usage.output_tokens ?? 0,
  };
}

// ── Title generation (separate short Claude call) ──────────────

async function generateEpisodeTitle(input: ResolvedEpisodeInput, episodeText: string): Promise<string> {
  try {
    const client = createAnthropicClient();
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 60,
      system: "Du erzeugst griffige, neugierig-machende Titel (max. 6 Wörter, Deutsch) für Audio-Episoden. Antworte NUR mit dem Titel, ohne Anführungszeichen.",
      messages: [
        {
          role: "user",
          content: `Show: ${input.showTitle}\nThema (falls gesetzt): ${input.userInputs.theme ?? "—"}\n\nEpisoden-Anfang:\n${episodeText.slice(0, 800)}\n\nTitel:`,
        },
      ],
    });
    const titleBlock = res.content.find((b) => b.type === "text");
    if (titleBlock && titleBlock.type === "text") {
      return titleBlock.text.trim().replace(/^[""'"]|[""'"]$/g, "").slice(0, 80);
    }
  } catch (e) {
    console.warn("[show-episode] Title-Gen fehlgeschlagen, fallback:", e);
  }
  return input.showTitle;
}

// ── Full pipeline: text → audio → blob → DB ────────────────────

export async function generateShowEpisode(params: {
  episodeId: string;
}): Promise<void> {
  const episode = await prisma.showEpisode.findUnique({
    where: { id: params.episodeId },
    include: { show: true, showFokus: true },
  });
  if (!episode) throw new Error(`Episode ${params.episodeId} nicht gefunden`);
  // Capture non-null primitives into locals so closures don't re-narrow.
  const episodeId = episode.id;
  const canzoiaJobId = episode.canzoiaJobId;

  async function setStatus(status: ShowEpisodeStatus, progressPct: number, stage?: string) {
    await prisma.showEpisode.update({
      where: { id: episodeId },
      data: { status, progressPct, progressStage: stage ?? null },
    });
    // Fire best-effort progress webhook (not retried if it fails — §5.3).
    // Only fire for non-terminal statuses; completed/failed get their own
    // richer payloads below.
    if (status !== "completed" && status !== "failed") {
      deliverWebhookSafe({
        event: "generation.progress",
        deliveryId: randomUUID(),
        timestamp: new Date().toISOString(),
        jobId: canzoiaJobId,
        stage: stage ?? null,
        progressPct,
      });
    }
  }

  try {
    // Phase 1: load + resolve
    await setStatus("scripting", 5, "Lade Show + Cast");
    const input = await loadEpisodeInput({
      showSlug: episode.show.slug,
      showFokusId: episode.showFokusId,
      userInputs: (episode.userInputs ?? {}) as Record<string, unknown>,
      profileSnapshot: (episode.profileSnapshot ?? {}) as Record<string, unknown>,
    });

    // Phase 2: Claude text generation
    await setStatus("scripting", 15, "Script wird geschrieben");
    const { text, inputTokens, outputTokens } = await generateEpisodeText(input);

    await prisma.showEpisode.update({
      where: { id: episode.id },
      data: { text, inputTokens, outputTokens },
    });

    // Phase 3: Title in parallel + audio synthesis
    await setStatus("synthesizing", 45, "Audio wird synthetisiert");

    // Register voice overrides so parseStorySegments(text) → generateMultiVoiceAudio
    // resolves [ACTORID] markers to the correct ElevenLabs voiceId.
    const overrides = new Map<string, { voiceId: string; settings: CharacterVoiceSettings }>();
    for (const c of input.cast) {
      overrides.set(c.actor.id, {
        voiceId: c.actor.voiceId,
        settings: c.actor.voiceSettings as unknown as CharacterVoiceSettings,
      });
    }
    setVoiceOverrides(overrides);

    let audioResult;
    try {
      const [titleResult, audio] = await Promise.all([
        generateEpisodeTitle(input, text),
        generateAudio(text),
      ]);
      audioResult = audio;
      await prisma.showEpisode.update({
        where: { id: episode.id },
        data: { title: titleResult },
      });
    } finally {
      clearVoiceOverrides();
    }

    // ttsChars approximation: we count the speech text length post-cleanup
    // after parseStorySegments — but for simplicity use raw text length.
    const ttsChars = text.length;
    const durationSec = audioResult.timeline.length
      ? Math.ceil(audioResult.timeline[audioResult.timeline.length - 1].endMs / 1000)
      : 0;

    // Phase 4: Upload to Blob
    await setStatus("uploading", 85, "Audio wird gespeichert");
    const blob = await put(
      `shows/${input.showSlug}/${episode.id}.mp3`,
      Buffer.from(audioResult.wav),
      {
        access: "public",
        contentType: "audio/mpeg",
        addRandomSuffix: true,
      }
    );

    // Phase 5: Finalize
    await prisma.showEpisode.update({
      where: { id: episodeId },
      data: {
        status: "completed",
        progressPct: 100,
        progressStage: null,
        audioUrl: blob.url,
        durationSec,
        ttsChars,
        totalMinutesBilled: durationSec / 60,
        // timeline is the raw TimelineEntry[] — Prisma casts via JSON column
        timeline: audioResult.timeline as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    console.log(`[show-episode] ✓ ${episodeId} completed — ${durationSec}s, ${audioResult.wav.byteLength} bytes`);

    // Reload for up-to-date fields (title, cost) + dispatch completed webhook.
    const final = await prisma.showEpisode.findUniqueOrThrow({
      where: { id: episodeId },
      include: { show: { select: { slug: true } } },
    });
    deliverWebhookSafe({
      event: "generation.completed",
      deliveryId: randomUUID(),
      timestamp: new Date().toISOString(),
      jobId: final.canzoiaJobId,
      idempotencyKey: final.idempotencyKey,
      showSlug: final.show.slug,
      showFokusId: final.showFokusId,
      canzoiaProfileId: final.canzoiaProfileId,
      result: {
        title: final.title,
        audioUrl: final.audioUrl ?? blob.url,
        durationSec: final.durationSec,
        timeline: final.timeline,
      },
      cost: {
        inputTokens: final.inputTokens,
        outputTokens: final.outputTokens,
        ttsChars: final.ttsChars,
        totalMinutesBilled: final.totalMinutesBilled,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err instanceof Error ? err.name : "Error";
    console.error(`[show-episode] ✗ ${episodeId} failed:`, msg);
    await prisma.showEpisode.update({
      where: { id: episodeId },
      data: {
        status: "failed",
        errorMessage: msg.slice(0, 2000),
        errorCode: code,
        completedAt: new Date(),
      },
    });
    deliverWebhookSafe({
      event: "generation.failed",
      deliveryId: randomUUID(),
      timestamp: new Date().toISOString(),
      jobId: episode.canzoiaJobId,
      idempotencyKey: episode.idempotencyKey,
      showSlug: episode.show.slug,
      showFokusId: episode.showFokusId,
      canzoiaProfileId: episode.canzoiaProfileId,
      error: {
        code,
        message: msg.slice(0, 500),
      },
    });
    throw err;
  }
}

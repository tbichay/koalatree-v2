import { CHARACTERS, CharacterVoiceSettings, StorySegment } from "./types";
import { parseStorySegments, cleanSegmentForTTS } from "./story-parser";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lamejs = require("lamejs");

// --- Volume Constants (easy to tune) ---
const SFX_MIX_VOLUME = 0.25;       // SFX under speech
const AMBIENCE_MIX_VOLUME = 0.07;  // Ambient atmosphere — barely noticeable
const AMBIENCE_DURATION = 10;       // Seconds of ambience to generate (will be looped)
const BATCH_SIZE = 3;               // Parallel API calls per batch (ElevenLabs limit: 3 concurrent — ambience finishes fast)

// --- Retry Configuration ---
const MAX_RETRIES = 4;              // Total attempts = 1 + MAX_RETRIES
const RETRY_BASE_DELAY = 2000;      // Base delay in ms (doubles each retry: 2s, 4s, 8s, 16s)
const RETRYABLE_CODES = [429, 500, 502, 503, 504]; // HTTP codes that trigger retry

// --- Audio Result with Timeline ---
export interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

export interface AudioResult {
  wav: ArrayBuffer;   // Actually MP3 now (name kept for API compat)
  mp3: true;          // Flag: content is MP3, not WAV
  timeline: TimelineEntry[];
}

// --- Audio Group: Speech + associated background SFX ---
interface AudioGroup {
  speech: StorySegment;
  backgroundSfx: StorySegment[];
}

// --- Retry Helper ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response;
      }

      // Check if this is a retryable error
      if (RETRYABLE_CODES.includes(response.status) && attempt < MAX_RETRIES) {
        const errorBody = await response.text();
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
        const jitter = Math.random() * 1000; // Add up to 1s jitter
        console.warn(
          `[Retry] ${label}: ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${Math.round(delay + jitter)}ms — ${errorBody.slice(0, 100)}`
        );
        await sleep(delay + jitter);
        continue;
      }

      // Non-retryable error or out of retries
      const errorBody = await response.text();
      throw new Error(`ElevenLabs API Fehler: ${response.status} — ${errorBody}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("ElevenLabs API")) {
        throw err; // Don't retry our own thrown errors
      }

      // Network errors are retryable
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `[Retry] ${label}: Network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms — ${lastError.message}`
        );
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError || new Error(`${label}: Alle Versuche fehlgeschlagen`);
}

// --- Single Voice TTS (Legacy-kompatibel) ---

export async function generateAudio(text: string): Promise<AudioResult> {
  // Prüfe ob der Text Multi-Charakter-Marker enthält
  if (/\[(KODA|KIKI|LUNA|MIKA|PIP|SAGE|NUKI)\]/.test(text)) {
    const segments = parseStorySegments(text);
    return generateMultiVoiceAudio(segments);
  }

  // Legacy: Single Voice
  const cleanedText = cleanSegmentForTTS(text);
  const voiceId = process.env.ELEVENLABS_VOICE_KODA || process.env.ELEVENLABS_VOICE_ID || "dFA3XRddYScy6ylAYTIO";
  const pcm = await generateTTS(cleanedText, voiceId, CHARACTERS.koda.voiceSettings);
  return { wav: pcmToMp3(pcm), mp3: true, timeline: [{ characterId: "koda", startMs: 0, endMs: (pcm.byteLength / 2 / 24000) * 1000 }] };
}

// --- Build Audio Groups from parsed segments ---

function buildAudioGroups(segments: StorySegment[]): {
  groups: AudioGroup[];
  ambience: StorySegment | null;
} {
  let ambience: StorySegment | null = null;
  const groups: AudioGroup[] = [];
  let pendingSfx: StorySegment[] = [];

  for (const segment of segments) {
    if (segment.type === "ambience") {
      ambience = segment;
      continue;
    }

    if (segment.type === "sfx") {
      pendingSfx.push(segment);
      continue;
    }

    // Speech segment — attach any pending SFX as background
    groups.push({
      speech: segment,
      backgroundSfx: [...pendingSfx],
    });
    pendingSfx = [];
  }

  // If there are trailing SFX without a following speech segment, attach to last group
  if (pendingSfx.length > 0 && groups.length > 0) {
    groups[groups.length - 1].backgroundSfx.push(...pendingSfx);
  }

  return { groups, ambience };
}

// --- Multi-Voice Audio Pipeline (with mixing) ---

export async function generateMultiVoiceAudio(segments: StorySegment[]): Promise<AudioResult> {
  const startTime = Date.now();
  console.log(`[MultiVoice] Starting: ${segments.length} segments`);

  // Phase 1: Build audio groups
  const { groups, ambience } = buildAudioGroups(segments);
  console.log(`[MultiVoice] ${groups.length} audio groups, ambience: ${ambience ? "yes" : "no"}`);

  // Phase 2: Start ambience generation immediately (parallel with everything else)
  const ambiencePromise = ambience
    ? generateSoundEffect(ambience.ambiencePrompt || ambience.text, AMBIENCE_DURATION)
    : Promise.resolve(null);

  // Phase 3: Collect all generation tasks with SFX deduplication
  const speechTasks: { groupIndex: number; segment: StorySegment; prevText?: string; nextText?: string }[] = [];
  const sfxTasks: Map<string, StorySegment> = new Map(); // deduplicate by prompt
  const sfxGroupMapping: { groupIndex: number; prompt: string }[] = [];

  for (let i = 0; i < groups.length; i++) {
    // Pre-compute previous/next text for cross-segment prosody
    const prevGroup = i > 0 ? groups[i - 1] : null;
    const nextGroup = i < groups.length - 1 ? groups[i + 1] : null;
    const prevText = prevGroup ? cleanSegmentForTTS(prevGroup.speech.text)?.slice(-200) : undefined;
    const nextText = nextGroup ? cleanSegmentForTTS(nextGroup.speech.text)?.slice(0, 200) : undefined;

    speechTasks.push({ groupIndex: i, segment: groups[i].speech, prevText: prevText || undefined, nextText: nextText || undefined });

    for (const sfx of groups[i].backgroundSfx) {
      const prompt = sfx.sfxPrompt || sfx.text;
      if (!sfxTasks.has(prompt)) {
        sfxTasks.set(prompt, sfx);
      }
      sfxGroupMapping.push({ groupIndex: i, prompt });
    }
  }

  // Phase 4: Generate all speech and SFX in batches
  const speechBuffers: Map<number, ArrayBuffer> = new Map();
  const sfxBuffers: Map<string, ArrayBuffer | null> = new Map();

  // Combine all tasks for batched execution
  interface Task {
    type: "speech" | "sfx";
    key: string | number;
    execute: () => Promise<ArrayBuffer | null>;
  }

  const allTasks: Task[] = [
    ...speechTasks.map((t) => ({
      type: "speech" as const,
      key: t.groupIndex,
      execute: () => generateSegmentAudio(t.segment, t.prevText, t.nextText),
    })),
    ...Array.from(sfxTasks.entries()).map(([prompt]) => ({
      type: "sfx" as const,
      key: prompt,
      execute: () => generateSoundEffect(prompt),
    })),
  ];

  // Process in batches with inter-batch delay to avoid rate limits
  for (let i = 0; i < allTasks.length; i += BATCH_SIZE) {
    const batch = allTasks.slice(i, i + BATCH_SIZE);
    const batchStart = Date.now();

    const results = await Promise.all(batch.map((task) => task.execute()));

    for (let j = 0; j < batch.length; j++) {
      const task = batch[j];
      const result = results[j];
      if (task.type === "speech" && result) {
        speechBuffers.set(task.key as number, result);
      } else if (task.type === "sfx") {
        sfxBuffers.set(task.key as string, result);
      }
    }

    const batchDuration = Date.now() - batchStart;
    console.log(`[MultiVoice] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allTasks.length / BATCH_SIZE)}: ${batchDuration}ms`);

    // Small delay between batches to be kind to ElevenLabs rate limits
    if (i + BATCH_SIZE < allTasks.length && batchDuration < 500) {
      await sleep(300);
    }
  }

  // Phase 5: Mix SFX into speech groups
  const mixedBuffers: ArrayBuffer[] = [];

  for (let i = 0; i < groups.length; i++) {
    let speechBuffer = speechBuffers.get(i);
    if (!speechBuffer) continue;

    // Normalize each speech segment to consistent loudness BEFORE SFX mixing
    // This prevents volume jumps when switching between characters (e.g. quiet Luna → loud Kiki)
    speechBuffer = normalizeRms(speechBuffer, -18);

    // Find all SFX buffers for this group
    const groupSfx = sfxGroupMapping
      .filter((m) => m.groupIndex === i)
      .map((m) => sfxBuffers.get(m.prompt))
      .filter((b): b is ArrayBuffer => b !== null && b !== undefined);

    // Mix each SFX into the speech buffer at reduced volume
    for (const sfxBuffer of groupSfx) {
      speechBuffer = mixPcmBuffers(speechBuffer, sfxBuffer, SFX_MIX_VOLUME);
    }

    mixedBuffers.push(speechBuffer);
  }

  if (mixedBuffers.length === 0) {
    throw new Error("No audio segments generated");
  }

  // Phase 6: Apply fades, insert silence gaps, build timeline, concatenate
  const SEGMENT_GAP_MS = 350; // 350ms pause between segments for natural pacing
  const silenceSamples = Math.floor((24000 * SEGMENT_GAP_MS) / 1000); // 24kHz PCM
  const silenceBuffer = new ArrayBuffer(silenceSamples * 2); // 16-bit = 2 bytes/sample, zeros = silence

  const withGaps: ArrayBuffer[] = [];
  const timeline: TimelineEntry[] = [];
  let offsetMs = 0;

  // Track which group index each mixedBuffer came from (groups with null speech were skipped)
  let mixedGroupIndices: number[] = [];
  {
    let mi = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      if (speechBuffers.has(gi)) {
        mixedGroupIndices.push(gi);
        mi++;
      }
    }
  }

  for (let i = 0; i < mixedBuffers.length; i++) {
    const fadedBuffer = applyFades(mixedBuffers[i], 8, 30);
    withGaps.push(fadedBuffer);

    // Calculate segment duration in ms
    const segmentMs = (fadedBuffer.byteLength / 2) / 24000 * 1000;
    const groupIndex = mixedGroupIndices[i];
    const characterId = groups[groupIndex]?.speech.characterId || "koda";

    timeline.push({ characterId, startMs: Math.round(offsetMs), endMs: Math.round(offsetMs + segmentMs) });
    offsetMs += segmentMs;

    if (i < mixedBuffers.length - 1) {
      withGaps.push(silenceBuffer);
      offsetMs += SEGMENT_GAP_MS;
    }
  }

  let finalPcm = concatAudioBuffers(withGaps);
  console.log(`[MultiVoice] Added ${mixedBuffers.length - 1} silence gaps (${SEGMENT_GAP_MS}ms each), timeline: ${timeline.length} entries`);

  // Phase 7: Mix ambience under everything
  const ambienceBuffer = await ambiencePromise;
  if (ambienceBuffer) {
    const loopedAmbience = loopPcmToLength(ambienceBuffer, finalPcm.byteLength);
    finalPcm = mixPcmBuffers(finalPcm, loopedAmbience, AMBIENCE_MIX_VOLUME);
    console.log(`[MultiVoice] Ambience mixed: ${ambienceBuffer.byteLength} bytes looped to ${loopedAmbience.byteLength}`);
  }

  // Phase 7.5: Master — normalize loudness + soft limit peaks
  finalPcm = masterPcm(finalPcm);

  // Phase 8: Convert to MP3 (much smaller than WAV, streams better)
  const mp3Data = pcmToMp3(finalPcm);
  console.log(`[MultiVoice] Done: ${mp3Data.byteLength} bytes (MP3), ${Date.now() - startTime}ms total`);

  return { wav: mp3Data, mp3: true, timeline };
}

// --- Segment Audio Generation ---

async function generateSegmentAudio(
  segment: StorySegment,
  previousText?: string,
  nextText?: string,
): Promise<ArrayBuffer | null> {
  // Speech segment only — SFX is handled separately
  const cleanedText = cleanSegmentForTTS(segment.text);
  if (!cleanedText || cleanedText.length < 2) return null;

  const characterId = segment.characterId || "koda";
  const character = CHARACTERS[characterId] || CHARACTERS.koda;

  // Voice ID: Nutze ENV-Variable wenn vorhanden, sonst Character-Default
  const envKey = `ELEVENLABS_VOICE_${characterId.toUpperCase()}`;
  const voiceId = process.env[envKey] || character.voiceId;

  if (!voiceId) {
    console.warn(`[TTS] Keine Voice-ID für ${characterId} — überspringe (setze ${envKey})`);
    return null;
  }

  console.log(`[TTS] ${character.name}: ${cleanedText.slice(0, 60)}... (voice: ${voiceId})`);

  return generateTTS(cleanedText, voiceId, character.voiceSettings, previousText, nextText);
}

// --- ElevenLabs TTS API (returns raw PCM, with retry) ---

async function generateTTS(
  text: string,
  voiceId: string,
  settings: CharacterVoiceSettings,
  previousText?: string,
  nextText?: string,
): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY nicht gesetzt");

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  const isV3 = modelId === "eleven_v3";

  // v3 only supports: stability, similarity_boost, speed
  // v2 supports: stability, similarity_boost, style, use_speaker_boost (speed at top level)
  const voiceSettings = isV3
    ? {
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        speed: settings.speed,
      }
    : {
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        style: settings.style,
        use_speaker_boost: settings.use_speaker_boost,
      };

  const response = await fetchWithRetry(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: voiceSettings,
        // Cross-segment prosody (not supported by eleven_v3)
        ...(!isV3 && previousText && { previous_text: previousText }),
        ...(!isV3 && nextText && { next_text: nextText }),
      }),
    },
    `TTS ${voiceId}`,
  );

  return response.arrayBuffer();
}

// --- ElevenLabs Sound Effects API (returns raw PCM, with retry) ---

async function generateSoundEffect(prompt: string, durationSeconds = 3): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("[SFX] ELEVENLABS_API_KEY nicht gesetzt, überspringe SFX");
    return null;
  }

  console.log(`[SFX] Generating: "${prompt}" (${durationSeconds}s)`);

  try {
    const response = await fetchWithRetry(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: durationSeconds,
        }),
      },
      `SFX "${prompt.slice(0, 30)}"`,
    );

    const buffer = await response.arrayBuffer();
    console.log(`[SFX] Generated: ${buffer.byteLength} bytes (PCM, ${durationSeconds}s)`);
    return buffer;
  } catch (err) {
    console.warn(`[SFX] Failed to generate "${prompt}" after retries:`, err);
    return null; // SFX failures are non-fatal — story continues without the effect
  }
}

// --- Audio Buffer Utilities ---

/**
 * Mix two PCM buffers together.
 * The overlay is mixed into the base at a given volume (0.0 - 1.0).
 * Output length equals the base length.
 * PCM format: 16-bit signed integers, little-endian.
 */
function mixPcmBuffers(base: ArrayBuffer, overlay: ArrayBuffer, volume: number): ArrayBuffer {
  const baseSamples = new Int16Array(base.slice(0)); // copy to avoid mutating
  const overlaySamples = new Int16Array(overlay);
  const mixLength = Math.min(baseSamples.length, overlaySamples.length);

  for (let i = 0; i < mixLength; i++) {
    const mixed = baseSamples[i] + Math.round(overlaySamples[i] * volume);
    // Soft clipping via tanh saturation instead of hard clamping
    // Smoothly compresses peaks instead of chopping them flat
    if (mixed > 32767 || mixed < -32768) {
      const normalized = mixed / 32768;
      baseSamples[i] = Math.round(Math.tanh(normalized) * 32767);
    } else {
      baseSamples[i] = mixed;
    }
  }

  return baseSamples.buffer;
}

/**
 * Loop a PCM buffer to fill a target byte length.
 * Applies a short crossfade at loop boundaries to avoid clicks.
 */
function loopPcmToLength(source: ArrayBuffer, targetByteLength: number): ArrayBuffer {
  if (source.byteLength >= targetByteLength) {
    return source.slice(0, targetByteLength);
  }

  const result = new Uint8Array(targetByteLength);
  const sourceBytes = new Uint8Array(source);
  let offset = 0;

  while (offset < targetByteLength) {
    const remaining = targetByteLength - offset;
    const copyLength = Math.min(sourceBytes.byteLength, remaining);
    result.set(sourceBytes.subarray(0, copyLength), offset);
    offset += copyLength;
  }

  // Apply crossfade at loop points to avoid clicks
  // Crossfade region: 500 samples = 1000 bytes (16-bit)
  const CROSSFADE_SAMPLES = 500;
  const sourceLen = source.byteLength;
  const resultView = new Int16Array(result.buffer);
  const sourceView = new Int16Array(source);

  // For each loop boundary, blend the end of one iteration with the start of the next
  const loopCount = Math.floor(targetByteLength / sourceLen);
  for (let loop = 1; loop < loopCount; loop++) {
    const boundaryByte = loop * sourceLen;
    const boundarySample = boundaryByte / 2;

    if (boundarySample + CROSSFADE_SAMPLES > resultView.length) break;
    if (boundarySample - CROSSFADE_SAMPLES < 0) break;

    for (let i = 0; i < CROSSFADE_SAMPLES; i++) {
      const fadeOut = 1 - i / CROSSFADE_SAMPLES; // from 1.0 to 0.0
      const fadeIn = i / CROSSFADE_SAMPLES;       // from 0.0 to 1.0

      const endIdx = boundarySample - CROSSFADE_SAMPLES + i;

      if (endIdx >= 0 && endIdx < resultView.length) {
        resultView[endIdx] = Math.round(resultView[endIdx] * fadeOut +
          sourceView[i] * fadeIn);
      }
    }
  }

  console.log(`[PCM] Looped ${sourceLen} bytes → ${targetByteLength} bytes (${loopCount} loops)`);
  return result.buffer;
}

/**
 * Apply fade-in and fade-out to a PCM buffer to eliminate boundary artifacts.
 * ElevenLabs sometimes generates tiny "phantom word" fragments at segment edges.
 * A short fade smoothly silences these artifacts.
 */
function applyFades(buffer: ArrayBuffer, fadeInMs = 8, fadeOutMs = 30): ArrayBuffer {
  const samples = buffer.byteLength / 2; // 16-bit = 2 bytes per sample
  const view = new Int16Array(buffer.slice(0)); // clone to avoid mutation

  const fadeInSamples = Math.min(Math.floor((24000 * fadeInMs) / 1000), samples);
  const fadeOutSamples = Math.min(Math.floor((24000 * fadeOutMs) / 1000), samples);

  // Fade in
  for (let i = 0; i < fadeInSamples; i++) {
    view[i] = Math.round(view[i] * (i / fadeInSamples));
  }

  // Fade out
  for (let i = 0; i < fadeOutSamples; i++) {
    const idx = samples - 1 - i;
    view[idx] = Math.round(view[idx] * (i / fadeOutSamples));
  }

  return view.buffer;
}

/**
 * RMS-based loudness normalization.
 * Measures the current RMS level, then applies gain to reach the target.
 * Safety: max +6dB boost to avoid amplifying silence/noise.
 */
function normalizeRms(buffer: ArrayBuffer, targetDbFs = -18): ArrayBuffer {
  const view = new Int16Array(buffer.slice(0));
  const len = view.length;
  if (len === 0) return view.buffer;

  // Pass 1: measure RMS
  let sumSquares = 0;
  for (let i = 0; i < len; i++) {
    const normalized = view[i] / 32768; // normalize to -1..1
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / len);
  if (rms < 0.0001) return view.buffer; // near-silence — don't amplify

  const currentDbFs = 20 * Math.log10(rms);
  const gainDb = Math.min(targetDbFs - currentDbFs, 6); // cap at +6dB
  const gain = Math.pow(10, gainDb / 20);

  // Pass 2: apply gain
  for (let i = 0; i < len; i++) {
    const amplified = Math.round(view[i] * gain);
    view[i] = Math.max(-32768, Math.min(32767, amplified)) as number;
  }

  console.log(`[Master] Normalize: ${currentDbFs.toFixed(1)}dB → ${targetDbFs}dB (gain: ${gainDb.toFixed(1)}dB)`);
  return view.buffer;
}

/**
 * Soft peak limiter with attack/release envelope.
 * Instead of hard-clipping peaks (which produces digital distortion),
 * this smoothly reduces gain when the signal approaches the ceiling.
 */
function softLimiter(buffer: ArrayBuffer, thresholdDb = -1): ArrayBuffer {
  const view = new Int16Array(buffer.slice(0));
  const len = view.length;
  if (len === 0) return view.buffer;

  const threshold = 32768 * Math.pow(10, thresholdDb / 20); // ~32124 for -1dB
  const ratio = 4; // 4:1 compression above threshold
  const attackSamples = 24;   // 1ms at 24kHz
  const releaseSamples = 1200; // 50ms at 24kHz
  const attackCoeff = 1 - Math.exp(-1 / attackSamples);
  const releaseCoeff = 1 - Math.exp(-1 / releaseSamples);

  let envelope = 0; // current gain reduction in linear scale (0 = no reduction)

  for (let i = 0; i < len; i++) {
    const abs = Math.abs(view[i]);

    if (abs > threshold) {
      // How much over threshold (in linear scale)
      const over = abs - threshold;
      const compressed = threshold + over / ratio;
      const targetReduction = 1 - compressed / abs;

      // Attack: fast ramp up to target reduction
      if (targetReduction > envelope) {
        envelope += (targetReduction - envelope) * attackCoeff;
      } else {
        envelope += (targetReduction - envelope) * releaseCoeff;
      }
    } else {
      // Release: slowly return to no reduction
      envelope *= (1 - releaseCoeff);
    }

    // Apply gain reduction
    const gain = 1 - envelope;
    view[i] = Math.round(view[i] * gain) as number;
  }

  console.log(`[Master] Soft limiter applied (threshold: ${thresholdDb}dB, ratio: ${ratio}:1)`);
  return view.buffer;
}

/**
 * Master the final PCM buffer: normalize loudness, then limit peaks.
 * This is the "mastering chain" — ensures consistent, clean output.
 */
function masterPcm(buffer: ArrayBuffer): ArrayBuffer {
  const startMs = Date.now();
  let result = normalizeRms(buffer, -18);
  result = softLimiter(result, -1);
  console.log(`[Master] Mastering done in ${Date.now() - startMs}ms`);
  return result;
}

/**
 * Concatenate PCM buffers — trivial byte join.
 * PCM is raw audio samples with no headers or framing,
 * so concatenation is just appending bytes.
 */
function concatAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) throw new Error("No audio buffers to concatenate");
  if (buffers.length === 1) return buffers[0];

  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  console.log(`[PCM] Concatenated ${buffers.length} segments → ${totalLength} bytes`);
  return result.buffer;
}

/**
 * Add WAV header to raw PCM data.
 * Creates a valid WAV file that any browser can play natively.
 */
function pcmToWav(
  pcmBuffer: ArrayBuffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
): ArrayBuffer {
  const dataLength = pcmBuffer.byteLength;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const wav = new Uint8Array(44 + dataLength);
  const view = new DataView(wav.buffer);

  // RIFF header
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  wav.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);            // chunk size
  view.setUint16(20, 1, true);             // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  wav.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataLength, true);

  // PCM data
  wav.set(new Uint8Array(pcmBuffer), 44);

  const durationSec = dataLength / byteRate;
  console.log(`[WAV] Created: ${wav.byteLength} bytes, ${durationSec.toFixed(1)}s duration`);

  return wav.buffer;
}

/**
 * Convert raw PCM (16-bit signed, mono, 24kHz) to MP3.
 * Uses lamejs for pure-JS encoding — no native dependencies.
 * 128kbps mono MP3 is ~6x smaller than WAV with negligible quality loss for speech.
 */
function pcmToMp3(
  pcmBuffer: ArrayBuffer,
  sampleRate = 24000,
  channels = 1,
  kbps = 128
): ArrayBuffer {
  const startTime = Date.now();
  const samples = new Int16Array(pcmBuffer);
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);

  // Encode in chunks of 1152 samples (MP3 frame size)
  const FRAME_SIZE = 1152;
  const mp3Chunks: Uint8Array[] = [];

  for (let i = 0; i < samples.length; i += FRAME_SIZE) {
    const chunk = samples.subarray(i, Math.min(i + FRAME_SIZE, samples.length));
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf));
    }
  }

  // Flush remaining
  const end = encoder.flush();
  if (end.length > 0) {
    mp3Chunks.push(new Uint8Array(end));
  }

  // Concat all chunks
  const totalLength = mp3Chunks.reduce((sum, c) => sum + c.length, 0);
  const mp3 = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    mp3.set(chunk, offset);
    offset += chunk.length;
  }

  const durationSec = samples.length / sampleRate;
  const ratio = pcmBuffer.byteLength / mp3.byteLength;
  console.log(`[MP3] Encoded: ${mp3.byteLength} bytes (${ratio.toFixed(1)}x smaller than PCM), ${durationSec.toFixed(1)}s, ${Date.now() - startTime}ms`);

  return mp3.buffer;
}

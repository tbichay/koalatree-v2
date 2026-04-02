import { CHARACTERS, StorySegment } from "./types";
import { parseStorySegments, cleanSegmentForTTS } from "./story-parser";

// --- Single Voice TTS (Legacy-kompatibel) ---

export async function generateAudio(text: string): Promise<ArrayBuffer> {
  // Prüfe ob der Text Multi-Charakter-Marker enthält
  if (/\[(KODA|KIKI)\]/.test(text)) {
    const segments = parseStorySegments(text);
    return generateMultiVoiceAudio(segments);
  }

  // Legacy: Single Voice
  const cleanedText = cleanSegmentForTTS(text);
  const voiceId = process.env.ELEVENLABS_VOICE_KODA || process.env.ELEVENLABS_VOICE_ID || "nZpMT2RjIpaat0IaA7Sd";
  const pcm = await generateTTS(cleanedText, voiceId, CHARACTERS.koda.voiceSettings);
  return pcmToWav(pcm);
}

// --- Multi-Voice Audio Pipeline ---

export async function generateMultiVoiceAudio(segments: StorySegment[]): Promise<ArrayBuffer> {
  const startTime = Date.now();
  console.log(`[MultiVoice] Starting: ${segments.length} segments`);

  const audioBuffers: ArrayBuffer[] = [];

  // Verarbeite in Batches von 3 für Parallelität
  const BATCH_SIZE = 3;
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchStart = Date.now();

    const results = await Promise.all(
      batch.map((segment) => generateSegmentAudio(segment))
    );

    // Füge Ergebnisse in Reihenfolge hinzu
    for (const result of results) {
      if (result) {
        audioBuffers.push(result);
      }
    }

    console.log(`[MultiVoice] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Date.now() - batchStart}ms`);
  }

  // PCM-Buffers zusammenfügen (trivial — rohe Bytes aneinanderhängen)
  const mergedPcm = concatAudioBuffers(audioBuffers);
  // WAV-Header hinzufügen für Browser-Wiedergabe
  const wav = pcmToWav(mergedPcm);
  console.log(`[MultiVoice] Done: ${wav.byteLength} bytes (WAV), ${Date.now() - startTime}ms total`);

  return wav;
}

// --- Segment Audio Generation ---

async function generateSegmentAudio(segment: StorySegment): Promise<ArrayBuffer | null> {
  if (segment.type === "sfx") {
    return generateSoundEffect(segment.sfxPrompt || segment.text);
  }

  // Speech segment
  const cleanedText = cleanSegmentForTTS(segment.text);
  if (!cleanedText || cleanedText.length < 2) return null;

  const characterId = segment.characterId || "koda";
  const character = CHARACTERS[characterId] || CHARACTERS.koda;

  // Voice ID: Nutze ENV-Variable wenn vorhanden, sonst Character-Default
  let voiceId = character.voiceId;
  if (characterId === "koda") {
    voiceId = process.env.ELEVENLABS_VOICE_KODA || process.env.ELEVENLABS_VOICE_ID || character.voiceId;
  } else if (characterId === "kiki") {
    voiceId = process.env.ELEVENLABS_VOICE_KIKI || character.voiceId;
  }

  console.log(`[TTS] ${character.name}: ${cleanedText.slice(0, 60)}... (voice: ${voiceId})`);

  return generateTTS(cleanedText, voiceId, character.voiceSettings);
}

// --- ElevenLabs TTS API (returns raw PCM) ---

async function generateTTS(
  text: string,
  voiceId: string,
  settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }
): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY nicht gesetzt");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity_boost,
          style: settings.style,
          use_speaker_boost: settings.use_speaker_boost,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[ElevenLabs] API Error ${response.status}:`, errorBody);
    throw new Error(`ElevenLabs API Fehler: ${response.status} — ${errorBody}`);
  }

  return response.arrayBuffer();
}

// --- ElevenLabs Sound Effects API (returns raw PCM) ---

async function generateSoundEffect(prompt: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("[SFX] ELEVENLABS_API_KEY nicht gesetzt, überspringe SFX");
    return null;
  }

  console.log(`[SFX] Generating: "${prompt}"`);

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: 3,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[SFX] API Error ${response.status}: ${errorBody} — skipping effect`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    console.log(`[SFX] Generated: ${buffer.byteLength} bytes (PCM)`);
    return buffer;
  } catch (err) {
    console.warn(`[SFX] Failed to generate "${prompt}":`, err);
    return null;
  }
}

// --- Audio Buffer Utilities ---

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

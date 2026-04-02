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
  return generateTTS(cleanedText, voiceId, CHARACTERS.koda.voiceSettings);
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

  // Konkatiniere alle MP3-Buffers
  const merged = concatAudioBuffers(audioBuffers);
  console.log(`[MultiVoice] Done: ${merged.byteLength} bytes, ${Date.now() - startTime}ms total`);

  return merged;
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

// --- ElevenLabs TTS API ---

async function generateTTS(
  text: string,
  voiceId: string,
  settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }
): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY nicht gesetzt");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
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

// --- ElevenLabs Sound Effects API ---

async function generateSoundEffect(prompt: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("[SFX] ELEVENLABS_API_KEY nicht gesetzt, überspringe SFX");
    return null;
  }

  console.log(`[SFX] Generating: "${prompt}"`);

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
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
    console.log(`[SFX] Generated: ${buffer.byteLength} bytes`);
    return buffer;
  } catch (err) {
    console.warn(`[SFX] Failed to generate "${prompt}":`, err);
    return null;
  }
}

// --- Audio Buffer Utilities ---

/**
 * Strip ID3v2 header (at start) and ID3v1 tag (at end) from MP3 buffer.
 * This ensures clean MP3 frame data for concatenation.
 */
function stripID3Tags(buffer: ArrayBuffer): Uint8Array {
  const data = new Uint8Array(buffer);
  let start = 0;
  let end = data.length;

  // Skip ID3v2 header if present (starts with "ID3")
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    // ID3v2 size is stored in bytes 6-9 as syncsafe integer
    const size =
      ((data[6] & 0x7f) << 21) |
      ((data[7] & 0x7f) << 14) |
      ((data[8] & 0x7f) << 7) |
      (data[9] & 0x7f);
    start = 10 + size;
    console.log(`[MP3] Stripped ID3v2 header: ${start} bytes`);
  }

  // Strip ID3v1 tag if present (last 128 bytes starting with "TAG")
  if (
    end >= 128 &&
    data[end - 128] === 0x54 &&
    data[end - 127] === 0x41 &&
    data[end - 126] === 0x47
  ) {
    end -= 128;
    console.log(`[MP3] Stripped ID3v1 footer`);
  }

  // Find first MP3 sync frame (0xFF 0xE0+ = frame sync bits)
  while (start < end - 1) {
    if (data[start] === 0xff && (data[start + 1] & 0xe0) === 0xe0) {
      break; // Found MP3 frame sync
    }
    start++;
  }

  return data.slice(start, end);
}

/**
 * Concatenate MP3 buffers by stripping ID3 tags and joining raw frames.
 * This prevents frame desynchronization that causes playback to break.
 */
function concatAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const stripped = buffers.map((buf) => stripID3Tags(buf));
  const totalLength = stripped.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of stripped) {
    result.set(buf, offset);
    offset += buf.byteLength;
  }

  console.log(`[MP3] Concatenated ${buffers.length} segments → ${totalLength} bytes`);
  return result.buffer;
}

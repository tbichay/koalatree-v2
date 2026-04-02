import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
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
 * Concatenate MP3 buffers using ffmpeg for reliable merging.
 * ffmpeg properly handles different MP3 encoding parameters
 * (mono/stereo, bitrate, MPEG version) by re-encoding to a
 * consistent output format.
 */
function concatAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) throw new Error("No audio buffers to concatenate");
  if (buffers.length === 1) return buffers[0];

  const tmpDir = mkdtempSync(join(tmpdir(), "koalatree-audio-"));

  try {
    // Write each buffer to a temp file
    const files = buffers.map((buf, i) => {
      const filePath = join(tmpDir, `seg-${String(i).padStart(3, "0")}.mp3`);
      writeFileSync(filePath, Buffer.from(buf));
      return filePath;
    });

    // Create ffmpeg concat list
    const listPath = join(tmpDir, "list.txt");
    writeFileSync(listPath, files.map((f) => `file '${f}'`).join("\n"));

    const outputPath = join(tmpDir, "output.mp3");

    // Get ffmpeg binary path
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath = require("ffmpeg-static") as string;

    // Re-encode all segments into one consistent MP3
    // This handles different mono/stereo, sample rates, bitrates
    execSync(
      `"${ffmpegPath}" -f concat -safe 0 -i "${listPath}" -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 "${outputPath}" -y -loglevel error`,
      { stdio: "pipe", timeout: 60000 }
    );

    const result = readFileSync(outputPath);
    console.log(`[ffmpeg] Merged ${buffers.length} segments → ${result.byteLength} bytes`);

    // Cleanup
    for (const f of [...files, listPath, outputPath]) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }

    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
  } catch (err) {
    console.error("[ffmpeg] Concat failed, falling back to raw concat:", err);
    // Fallback: raw concatenation (better than nothing)
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    return result.buffer;
  }
}

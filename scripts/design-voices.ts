/**
 * KoalaTree Voice Designer
 *
 * Generiert Custom Voices über die ElevenLabs Voice Design API
 * und speichert sie PERMANENT im Account.
 *
 * Usage:
 *   npx tsx scripts/design-voices.ts           # Alle Voices generieren
 *   npx tsx scripts/design-voices.ts luna mika  # Nur bestimmte Voices
 *
 * Das Script:
 * 1. Generiert Voice-Previews für jeden Charakter
 * 2. Speichert die besten Kandidaten PERMANENT im ElevenLabs Account
 * 3. Gibt die finalen Voice IDs aus
 * 4. Speichert Preview-Audio zum Anhören in voice-previews/
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY nicht gefunden in .env.local");
  process.exit(1);
}

const VOICES: Record<string, { name: string; envKey: string; description: string; previewText: string }> = {
  koda: {
    name: "KoalaTree Koda",
    envKey: "ELEVENLABS_VOICE_KODA",
    description: `A warm, deep German male voice, around 55-60 years old. Perfect audio quality. Speaks with a gentle smile in the voice, slightly slower than normal. Think of a wise grandfather telling bedtime stories by a warm fireplace. Rich baritone, naturally calming, with slight breathiness that conveys warmth. Not theatrical or dramatic — genuinely warm and trustworthy. Clear, soft German articulation. Nostalgic tone evoking classic German children's radio plays from the 90s.`,
    previewText: `Hmm... weißt du was, kleiner Schatz? Ich erinnere mich da an etwas Wunderbares... Es war einmal, an einem warmen Sommerabend, als der Wind ganz sanft durch die Blätter des großen Eukalyptusbaums wehte... Und dann... stell dir vor... begann etwas ganz Besonderes zu geschehen.`,
  },
  kiki: {
    name: "KoalaTree Kiki",
    envKey: "ELEVENLABS_VOICE_KIKI",
    description: `A bright, energetic young German female voice, around 25-30 years old. Perfect audio quality. Speaks with infectious enthusiasm and a playful lilt. Think of a fun, slightly mischievous friend who gets excited about everything. Higher pitch, expressive, with natural laughter in the voice. Quick, lively pacing with genuine warmth. Not childish or squeaky — authentically joyful and engaging. Natural German pronunciation with playful intonation.`,
    previewText: `Ha ha ha! Oh mann, das muss ich dir erzählen! Also echt jetzt... das war SO lustig! Weißt du was passiert ist? Also der kleine Frosch hat versucht, auf den Baum zu klettern, und dann... nein warte, ich fang nochmal von vorne an!`,
  },
  luna: {
    name: "KoalaTree Luna",
    envKey: "ELEVENLABS_VOICE_LUNA",
    description: `A soft, dreamy German female voice, around 30-35 years old. Perfect audio quality. Ethereal and soothing, like a gentle whisper that carries you into sleep. Think of a calm meditation guide or a soft-spoken fairy godmother. Slightly breathy, with a musical quality. Very slow, deliberate pacing with long pauses between phrases. Warm but mysterious. The kind of voice that makes your eyelids heavy. Clear German diction but with a floating, otherworldly quality.`,
    previewText: `Schließe sanft deine Augen... Stell dir vor... du schwebst ganz leicht... wie eine Feder... über einem stillen See aus Mondlicht... Die Luft ist warm und weich... und mit jedem Atemzug... wirst du ein kleines bisschen leichter...`,
  },
  mika: {
    name: "KoalaTree Mika",
    envKey: "ELEVENLABS_VOICE_MIKA",
    description: `A bold, adventurous German male voice, around 30-35 years old. Perfect audio quality. Energetic and courageous, like a young explorer who has just discovered something amazing. Think of a charismatic adventure guide. Dynamic pacing that speeds up during exciting moments. Confident but approachable. Not aggressive — adventurous and encouraging. Slightly raspy from outdoor life. Natural German with an energetic, forward-leaning delivery.`,
    previewText: `Kommt! Schnell, da vorne! Seht ihr das? Hinter dem Wasserfall... da schimmert etwas! Das könnte... nein, das MUSS der Eingang zur versteckten Höhle sein! Seid ihr bereit? Haltet euch gut fest... und... JETZT!`,
  },
  pip: {
    name: "KoalaTree Pip",
    envKey: "ELEVENLABS_VOICE_PIP",
    description: `A curious, bright German male voice, around 12-15 years old or young-sounding adult. Perfect audio quality. Full of wonder and questions, like a young scientist discovering the world. Slightly higher pitch, with upward inflections suggesting constant curiosity. Think of a child prodigy who is amazed by everything. Quick thinking, sometimes stumbling over words from excitement. Warm, earnest, never sarcastic. Natural German with an inquisitive, wide-eyed quality.`,
    previewText: `Wusstest du... wusstest du, dass Schnabeltiere leuchten? Unter UV-Licht! Echt jetzt! Und... und warum ist der Himmel eigentlich blau? Also, ich weiß es, aber... hast du schon mal darüber nachgedacht, warum er nicht grün ist? Wäre das nicht komisch?`,
  },
  sage: {
    name: "KoalaTree Sage",
    envKey: "ELEVENLABS_VOICE_SAGE",
    description: `A deep, calm German male voice, around 45-50 years old. Perfect audio quality. Measured and thoughtful, with significant pauses between sentences. Think of a zen master or a wise philosopher who chooses every word carefully. Low, resonant voice. Very slow delivery. Each word lands with weight. Not monotone — warmth underneath the stillness. Like listening to someone think out loud in the most gentle way possible. Clear German with gravitas and peace.`,
    previewText: `Manchmal... ist die Stille selbst... die Antwort. Setz dich einen Moment. Atme. Und dann frag dich... nicht was du tun sollst... sondern... was du wirklich fühlst. Da liegt oft... die Wahrheit.`,
  },
};

async function createPreview(
  description: string,
  text: string,
): Promise<{ generated_voice_id: string; audio_base_64: string }[]> {
  const response = await fetch("https://api.elevenlabs.io/v1/text-to-voice/create-previews", {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice_description: description,
      text: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Preview API Error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.previews || [];
}

async function saveVoicePermanently(
  generatedVoiceId: string,
  name: string,
  description: string,
): Promise<string> {
  const response = await fetch("https://api.elevenlabs.io/v1/text-to-voice/create-voice-from-preview", {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice_name: name,
      voice_description: description,
      generated_voice_id: generatedVoiceId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Save Voice Error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.voice_id;
}

async function main() {
  const outputDir = path.resolve(__dirname, "../voice-previews");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Parse command line args — which voices to generate
  const requestedVoices = process.argv.slice(2).map((s) => s.toLowerCase());
  const voiceEntries = Object.entries(VOICES).filter(
    ([id]) => requestedVoices.length === 0 || requestedVoices.includes(id),
  );

  console.log("\n🎤 KoalaTree Voice Designer\n");
  console.log("Generiert Voices und speichert sie PERMANENT im ElevenLabs Account.\n");
  console.log(`Voices: ${voiceEntries.map(([id]) => id).join(", ")}\n`);

  const results: Record<string, string> = {};

  for (const [charId, config] of voiceEntries) {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`🎭 ${config.name}`);
    console.log(`${"═".repeat(50)}\n`);

    try {
      // Step 1: Generate preview
      console.log("  1/3 Generiere Voice-Preview...");
      const previews = await createPreview(config.description, config.previewText);

      if (previews.length === 0) {
        console.error(`  ❌ Keine Previews erhalten für ${charId}`);
        continue;
      }

      // Save all preview audio files for listening
      for (let i = 0; i < previews.length; i++) {
        const preview = previews[i];
        const filename = `${charId}-preview-${i + 1}.mp3`;
        const filepath = path.join(outputDir, filename);
        const audioBuffer = Buffer.from(preview.audio_base_64, "base64");
        fs.writeFileSync(filepath, audioBuffer);
        console.log(`  ✅ Preview ${i + 1} gespeichert: ${filename} (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
      }

      // Step 2: Save the first preview permanently
      const bestPreview = previews[0];
      console.log(`\n  2/3 Speichere Voice PERMANENT im Account...`);

      const permanentVoiceId = await saveVoicePermanently(
        bestPreview.generated_voice_id,
        config.name,
        `KoalaTree character voice: ${config.name}. ${config.description.slice(0, 200)}`,
      );

      console.log(`  ✅ PERMANENT gespeichert!`);
      console.log(`     Voice ID: ${permanentVoiceId}`);
      results[charId] = permanentVoiceId;

      // Step 3: Verify the voice exists
      console.log(`\n  3/3 Verifiziere Voice...`);
      const verifyRes = await fetch(`https://api.elevenlabs.io/v1/voices/${permanentVoiceId}`, {
        headers: { "xi-api-key": API_KEY! },
      });
      if (verifyRes.ok) {
        const voiceData = await verifyRes.json();
        console.log(`  ✅ Voice "${voiceData.name}" existiert und ist permanent!`);
      } else {
        console.warn(`  ⚠️ Verifikation fehlgeschlagen (${verifyRes.status})`);
      }
    } catch (err) {
      console.error(`  ❌ Fehler bei ${charId}:`, err);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n\n${"═".repeat(50)}`);
  console.log(`✅ FERTIG — Permanente Voice IDs:`);
  console.log(`${"═".repeat(50)}\n`);

  for (const [charId, voiceId] of Object.entries(results)) {
    const config = VOICES[charId];
    console.log(`  ${config.envKey}=${voiceId}`);
  }

  console.log(`\nNächste Schritte:`);
  console.log(`1. Höre dir die Previews in voice-previews/ an`);
  console.log(`2. Setze die Voice IDs in .env.local`);
  console.log(`3. Setze die Voice IDs auf Vercel:`);
  for (const [charId, voiceId] of Object.entries(results)) {
    const config = VOICES[charId];
    console.log(`   printf "${voiceId}" | npx vercel env rm ${config.envKey} production -y; printf "${voiceId}" | npx vercel env add ${config.envKey} production`);
  }
  console.log(`4. Redeploy: npx vercel --prod`);
}

main().catch(console.error);

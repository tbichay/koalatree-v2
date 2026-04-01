export async function generateAudio(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY nicht gesetzt");

  // Audio-Marker aus dem Text entfernen und in SSML-ähnliche Pausen umwandeln
  const cleanedText = text
    .replace(/\[ATEMPAUSE\]/g, "... ... ...")
    .replace(/\[PAUSE\]/g, "... ...")
    .replace(/\[LANGSAM\]/g, "")
    .replace(/\[DANKBARKEIT\]/g, "");

  // ElevenLabs Voice ID — "Rachel" (sanfte weibliche Stimme, gut für Geschichten)
  // Kann später angepasst werden
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanedText,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API Fehler: ${response.status} — ${error}`);
  }

  return response.arrayBuffer();
}

/**
 * TTS Preview — Generate a short voice test sample via ElevenLabs.
 * Returns audio/mpeg directly (no blob storage).
 */

import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    voiceId: string;
    text: string;
    voiceSettings?: {
      stability?: number;
      similarity_boost?: number;
      style?: number;
      speed?: number;
    };
  };

  if (!body.voiceId || !body.text) {
    return Response.json({ error: "voiceId und text erforderlich" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "ElevenLabs API key nicht konfiguriert" }, { status: 500 });

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${body.voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: body.text.slice(0, 200), // Max 200 chars for preview
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: body.voiceSettings?.stability ?? 0.5,
          similarity_boost: body.voiceSettings?.similarity_boost ?? 0.7,
          style: body.voiceSettings?.style ?? 0.5,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[TTS Preview] ElevenLabs error:", err);
      return Response.json({ error: "TTS fehlgeschlagen" }, { status: 500 });
    }

    const audioBuffer = await res.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[TTS Preview] Error:", err);
    return Response.json({ error: "TTS Fehler" }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { generateAudio } from "@/lib/elevenlabs";

export const maxDuration = 300; // Allow up to 5 minutes — v3 model + many segments (podcast) can be slow

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { text, geschichteId } = (await request.json()) as {
      text: string;
      geschichteId?: string;
    };

    if (!text) {
      return Response.json({ error: "Text ist erforderlich" }, { status: 400 });
    }

    console.log(`[Audio] Generating for story ${geschichteId || "unknown"}, text length: ${text.length}`);
    const { wav: audioBuffer, mp3: isMp3, timeline } = await generateAudio(text);
    const ext = isMp3 ? "mp3" : "wav";
    const contentType = isMp3 ? "audio/mpeg" : "audio/wav";
    console.log(`[Audio] Generated ${audioBuffer.byteLength} bytes (${ext}), ${timeline.length} timeline entries`);

    // Upload to Vercel Blob
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("[Blob] BLOB_READ_WRITE_TOKEN not set — cannot store audio");
      return Response.json(
        { error: "Audio-Speicher nicht konfiguriert. Bitte BLOB_READ_WRITE_TOKEN setzen." },
        { status: 500 }
      );
    }

    const { put } = await import("@vercel/blob");
    const blob = await put(
      `audio/${geschichteId || Date.now()}.${ext}`,
      Buffer.from(audioBuffer),
      { access: "private", contentType, addRandomSuffix: true }
    );
    console.log(`[Blob] Uploaded successfully: ${blob.url}`);

    if (geschichteId) {
      // Calculate duration from timeline (last endMs) or fallback from buffer size
      const audioDauerSek = timeline.length > 0
        ? timeline[timeline.length - 1].endMs / 1000
        : isMp3
          ? undefined // Can't easily derive from MP3 buffer size
          : audioBuffer.byteLength / (24000 * 2); // PCM: 24kHz 16-bit mono

      // Store the blob URL + timeline + duration in DB
      await prisma.geschichte.update({
        where: { id: geschichteId },
        data: {
          audioUrl: blob.url,
          audioDauerSek,
          timeline: timeline.length > 0 ? JSON.parse(JSON.stringify(timeline)) : undefined,
        },
      });
      console.log(`[DB] Updated story ${geschichteId} with audioUrl + ${timeline.length} timeline entries, ${audioDauerSek?.toFixed(1)}s`);
      // Return the proxy URL so the frontend can play it without direct blob access
      return Response.json({ audioUrl: `/api/audio/${geschichteId}`, timeline, audioDauerSek });
    }

    // No story ID — return blob URL directly (won't work for private stores without proxy)
    return Response.json({ audioUrl: blob.url });
  } catch (error) {
    console.error("Audio generation error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json(
      { error: `Audio-Generierung fehlgeschlagen: ${message}` },
      { status: 500 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { generateAudio } from "@/lib/elevenlabs";

export const maxDuration = 120; // Allow up to 2 minutes for audio generation

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
    const audioBuffer = await generateAudio(text);
    console.log(`[Audio] Generated ${audioBuffer.byteLength} bytes`);

    // Upload to Vercel Blob — required for WAV files (too large for base64)
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("[Blob] BLOB_READ_WRITE_TOKEN not set — cannot store WAV audio");
      return Response.json(
        { error: "Audio-Speicher nicht konfiguriert. Bitte BLOB_READ_WRITE_TOKEN setzen." },
        { status: 500 }
      );
    }

    const { put } = await import("@vercel/blob");
    const blob = await put(
      `audio/${geschichteId || Date.now()}.wav`,
      Buffer.from(audioBuffer),
      { contentType: "audio/wav" }
    );
    console.log(`[Blob] Uploaded successfully: ${blob.url}`);

    if (geschichteId) {
      await prisma.geschichte.update({
        where: { id: geschichteId },
        data: { audioUrl: blob.url },
      });
      console.log(`[DB] Updated story ${geschichteId} with audioUrl`);
    }

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

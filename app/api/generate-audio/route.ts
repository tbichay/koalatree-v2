import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { generateAudio } from "@/lib/elevenlabs";

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

    const audioBuffer = await generateAudio(text);

    // Upload to Vercel Blob if available, otherwise return directly
    let audioUrl: string | undefined;
    try {
      const blob = await put(
        `audio/${geschichteId || Date.now()}.mp3`,
        Buffer.from(audioBuffer),
        { access: "public", contentType: "audio/mpeg" }
      );
      audioUrl = blob.url;

      // Update story record with audio URL
      if (geschichteId) {
        await prisma.geschichte.update({
          where: { id: geschichteId },
          data: { audioUrl: blob.url },
        });
      }
    } catch {
      // Vercel Blob not configured — return audio directly
    }

    if (audioUrl) {
      return Response.json({ audioUrl });
    }

    // Fallback: return raw audio
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Audio generation error:", error);
    return Response.json(
      { error: "Fehler bei der Audio-Generierung" },
      { status: 500 }
    );
  }
}

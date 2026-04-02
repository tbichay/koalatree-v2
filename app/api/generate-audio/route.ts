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

    // Upload to Vercel Blob (required for persistent storage)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(
          `audio/${geschichteId || Date.now()}.mp3`,
          Buffer.from(audioBuffer),
          { access: "public", contentType: "audio/mpeg" }
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
      } catch (blobError) {
        console.error("[Blob] Upload failed:", blobError);
        // Fall through to base64 fallback
      }
    } else {
      console.warn("[Blob] BLOB_READ_WRITE_TOKEN not set — using base64 fallback");
    }

    // Fallback: Return audio as base64 data URL (works without Blob storage)
    // This ensures audio plays even without Blob, and can be downloaded
    const base64 = Buffer.from(audioBuffer).toString("base64");
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    // Save data URL to DB so it persists in the library
    if (geschichteId) {
      await prisma.geschichte.update({
        where: { id: geschichteId },
        data: { audioUrl: dataUrl },
      });
      console.log(`[DB] Saved base64 audio for story ${geschichteId} (${base64.length} chars)`);
    }

    return Response.json({ audioUrl: dataUrl });
  } catch (error) {
    console.error("Audio generation error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json(
      { error: `Audio-Generierung fehlgeschlagen: ${message}` },
      { status: 500 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { generateAudio } from "@/lib/elevenlabs";
import { ONBOARDING_STORY_TEXT, ONBOARDING_STORY_TITLE } from "@/lib/onboarding-story";
import { put } from "@vercel/blob";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// GET: Return the current onboarding audio URL
export async function GET() {
  const blobUrl = process.env.ONBOARDING_AUDIO_URL;
  return Response.json({
    title: ONBOARDING_STORY_TITLE,
    audioUrl: blobUrl || null,
    hasAudio: !!blobUrl,
  });
}

// POST: Regenerate the onboarding audio (admin only)
export async function POST() {
  const { userId } = await auth();

  if (!ADMIN_USER_ID) {
    return Response.json(
      { error: "ADMIN_USER_ID nicht konfiguriert" },
      { status: 500 }
    );
  }

  if (userId !== ADMIN_USER_ID) {
    return Response.json(
      { error: "Nur der Admin kann die Vorstellungsgeschichte regenerieren" },
      { status: 403 }
    );
  }

  try {
    console.log("[Onboarding] Generating audio for onboarding story...");
    const audioBuffer = await generateAudio(ONBOARDING_STORY_TEXT);
    console.log(`[Onboarding] Generated ${audioBuffer.byteLength} bytes`);

    const blob = await put(
      "audio/onboarding-willkommen.wav",
      Buffer.from(audioBuffer),
      { access: "private", contentType: "audio/wav" }
    );

    console.log(`[Onboarding] Uploaded to: ${blob.url}`);

    return Response.json({
      success: true,
      blobUrl: blob.url,
      size: audioBuffer.byteLength,
      message: "Onboarding-Audio generiert. Setze ONBOARDING_AUDIO_URL in Vercel auf: " + blob.url,
    });
  } catch (error) {
    console.error("[Onboarding] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unbekannter Fehler" },
      { status: 500 }
    );
  }
}

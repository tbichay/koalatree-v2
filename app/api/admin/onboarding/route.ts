import { currentUser } from "@clerk/nextjs/server";
import { generateAudio } from "@/lib/elevenlabs";
import { ONBOARDING_STORY_TEXT, ONBOARDING_STORY_TITLE } from "@/lib/onboarding-story";
import { put } from "@vercel/blob";

export const maxDuration = 300; // 5 minutes — onboarding story is long

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  return user.emailAddresses.some(
    (e) => e.emailAddress.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

// GET: Return the current onboarding audio URL
export async function GET() {
  const blobUrl = process.env.ONBOARDING_AUDIO_URL;
  const admin = await isAdmin();
  return Response.json({
    title: ONBOARDING_STORY_TITLE,
    audioUrl: blobUrl || null,
    hasAudio: !!blobUrl,
    isAdmin: admin,
  });
}

// POST: Regenerate the onboarding audio (admin only)
export async function POST() {
  if (!(await isAdmin())) {
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
      { access: "private", contentType: "audio/wav", allowOverwrite: true }
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

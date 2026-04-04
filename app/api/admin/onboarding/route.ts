import { auth } from "@/lib/auth";
import { generateAudio } from "@/lib/elevenlabs";
import { ONBOARDING_STORY_TEXT, ONBOARDING_STORY_TITLE } from "@/lib/onboarding-story";
import { put, list } from "@vercel/blob";

export const maxDuration = 300; // 5 minutes — onboarding story is long

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.email) return false;
  return session.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Check if onboarding audio exists in blob store
async function hasOnboardingBlob(): Promise<boolean> {
  try {
    const { blobs } = await list({ prefix: "audio/onboarding-willkommen", limit: 1 });
    return blobs.length > 0;
  } catch {
    return false;
  }
}

// GET: Return onboarding status — checks blob store directly
export async function GET() {
  const hasAudio = await hasOnboardingBlob();
  const admin = await isAdmin();
  return Response.json({
    title: ONBOARDING_STORY_TITLE,
    audioUrl: hasAudio ? "/api/audio/onboarding" : null,
    hasAudio,
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
    const { wav: audioBuffer, mp3: isMp3, timeline } = await generateAudio(ONBOARDING_STORY_TEXT);
    const ext = isMp3 ? "mp3" : "wav";
    const audioContentType = isMp3 ? "audio/mpeg" : "audio/wav";
    console.log(`[Onboarding] Generated ${audioBuffer.byteLength} bytes (${ext}), ${timeline.length} timeline entries`);

    // Upload audio
    const blob = await put(
      `audio/onboarding-willkommen.${ext}`,
      Buffer.from(audioBuffer),
      { access: "private", contentType: audioContentType, allowOverwrite: true }
    );

    // Upload timeline JSON alongside audio
    const timelineJson = JSON.stringify(timeline);
    await put(
      "audio/onboarding-willkommen-timeline.json",
      Buffer.from(timelineJson),
      { access: "private", contentType: "application/json", allowOverwrite: true }
    );

    console.log(`[Onboarding] Uploaded to: ${blob.url} + timeline`);

    return Response.json({
      success: true,
      size: audioBuffer.byteLength,
      timelineEntries: timeline.length,
      message: "Onboarding-Audio erfolgreich generiert!",
    });
  } catch (error) {
    console.error("[Onboarding] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unbekannter Fehler" },
      { status: 500 }
    );
  }
}

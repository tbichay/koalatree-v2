import { auth } from "@/lib/auth";
import { generateAudio } from "@/lib/elevenlabs";
import { put, list } from "@vercel/blob";
import { HELP_CLIPS, HELP_CLIP_IDS } from "@/lib/help-clips";

export const maxDuration = 300; // 5 minutes for all clips

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.email) return false;
  return session.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// GET: Return status of all help clips
export async function GET() {
  const admin = await isAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

  const { blobs } = await list({ prefix: "help-clips/", limit: 50 });
  const existing = new Set(
    blobs
      .filter((b) => b.pathname.endsWith(".mp3"))
      .map((b) => b.pathname.replace("help-clips/", "").replace(".mp3", ""))
  );

  const clips = HELP_CLIP_IDS.map((id) => ({
    id,
    characterId: HELP_CLIPS[id].characterId,
    label: HELP_CLIPS[id].label,
    generated: existing.has(id),
  }));

  return Response.json({ clips, total: clips.length, generated: clips.filter((c) => c.generated).length });
}

// POST: Generate help clips (all or specific)
export async function POST(request: Request) {
  const admin = await isAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const clipIds: string[] = body.clipIds || HELP_CLIP_IDS; // default: all

  const results: { id: string; status: string; error?: string }[] = [];

  for (const clipId of clipIds) {
    const clip = HELP_CLIPS[clipId];
    if (!clip) {
      results.push({ id: clipId, status: "skipped", error: "Unknown clip" });
      continue;
    }

    try {
      console.log(`[Help Clips] Generating: ${clipId} (${clip.characterId})...`);

      const audioResult = await generateAudio(clip.text);

      await put(`help-clips/${clipId}.mp3`, Buffer.from(audioResult.wav), {
        contentType: "audio/mpeg",
        access: "private",
        allowOverwrite: true,
      });

      results.push({ id: clipId, status: "ok" });
      console.log(`[Help Clips] Done: ${clipId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Help Clips] Failed: ${clipId}:`, msg);
      results.push({ id: clipId, status: "error", error: msg });
    }
  }

  return Response.json({
    results,
    ok: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
  });
}

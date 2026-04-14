/**
 * Studio Sequence Clips API — Generate video clips for sequence scenes
 *
 * POST: Queue a clip generation task (returns immediately, processed by cron)
 * PUT: Set active version or delete a version
 */

// Auth handled by resolveUserId (supports both session + internal task worker)
import { prisma } from "@/lib/db";
import type { StudioScene } from "@/lib/studio/types";

export const maxDuration = 30; // POST is fast now — just creates a task

interface ClipRequest {
  sceneIndex: number;
  quality?: "standard" | "premium";
  stylePrompt?: string;
  mode?: "film" | "hoerspiel" | "audiobook";
  force?: boolean;
  provider?: "kling" | "runway";
  directorNote?: string;
  cameraOverride?: string;
  durationOverride?: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const { resolveUserId } = await import("@/lib/studio/task-auth");
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as ClipRequest;

  // Validate sequence exists and belongs to user
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId } },
    select: { scenes: true, audioUrl: true },
  });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  if (!scenes.some((s) => s.dialogAudioUrl) && !sequence.audioUrl) {
    return Response.json({ error: "Zuerst Audio generieren" }, { status: 400 });
  }

  const scene = scenes[body.sceneIndex];
  if (!scene) return Response.json({ error: `Szene ${body.sceneIndex} nicht gefunden` }, { status: 404 });

  // Skip if already done (unless forcing)
  if (!body.force && scene.videoUrl && scene.status === "done") {
    return Response.json({ videoUrl: scene.videoUrl, cached: true });
  }

  // Create a queued task for background processing
  const { createQueuedTask } = await import("@/lib/studio/task-tracker");
  const task = await createQueuedTask(userId, "clip", projectId, {
    sequenceId,
    sceneIndex: body.sceneIndex,
    quality: body.quality || "standard",
    stylePrompt: body.stylePrompt,
    mode: body.mode,
    provider: body.provider || "kling",
    directorNote: body.directorNote || undefined,
    cameraOverride: body.cameraOverride || undefined,
    durationOverride: body.durationOverride || undefined,
  }, body.quality === "premium" ? 150 : 30);

  return Response.json({ taskId: task.id, status: "queued" });
}

/** Set active version or delete a version */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const { resolveUserId: resolveUser } = await import("@/lib/studio/task-auth");
  const putUserId = await resolveUser(request);
  if (!putUserId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as {
    sceneIndex: number;
    action: "setActive" | "deleteVersion";
    versionIdx: number;
  };

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: putUserId } },
  });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const scenes = (sequence.scenes as unknown as StudioScene[]) || [];
  const scene = scenes[body.sceneIndex];
  if (!scene) return Response.json({ error: "Szene nicht gefunden" }, { status: 404 });

  const versions = scene.versions || [];

  if (body.action === "setActive") {
    if (body.versionIdx < 0 || body.versionIdx >= versions.length) {
      return Response.json({ error: "Version nicht gefunden" }, { status: 404 });
    }
    scene.activeVersionIdx = body.versionIdx;
    scene.videoUrl = versions[body.versionIdx].videoUrl;
  } else if (body.action === "deleteVersion") {
    if (versions.length <= 1) {
      // Delete last version = reset scene
      scene.versions = [];
      scene.activeVersionIdx = undefined;
      scene.videoUrl = undefined;
      scene.status = "pending";
    } else {
      versions.splice(body.versionIdx, 1);
      scene.versions = versions;
      // Adjust activeVersionIdx
      if (scene.activeVersionIdx !== undefined && scene.activeVersionIdx >= versions.length) {
        scene.activeVersionIdx = versions.length - 1;
      }
      scene.videoUrl = versions[scene.activeVersionIdx || 0]?.videoUrl;
    }
  }

  scenes[body.sceneIndex] = scene;
  const doneCount = scenes.filter((s) => s.status === "done").length;

  await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: {
      scenes: JSON.parse(JSON.stringify(scenes)),
      clipCount: doneCount,
    },
  });

  return Response.json({ scene, doneCount });
}
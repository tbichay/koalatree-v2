/**
 * Studio Task Queue Processor — Cron job that runs every minute
 *
 * Picks the next pending task and executes it.
 * Handles: clip, audio, story, screenplay, portrait, landscape, character-sheet, assemble
 */

import { prisma } from "@/lib/db";

export const maxDuration = 800;

// Verify cron secret or allow direct invocation in dev
function verifyCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  // Allow in development
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export async function POST(request: Request) {
  if (!verifyCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reset stale tasks (stuck in "running" for >10 minutes)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.studioTask.updateMany({
    where: {
      status: "running",
      startedAt: { lt: staleThreshold },
    },
    data: {
      status: "pending",
      error: "Task war zu lange blockiert und wurde zurueckgesetzt",
    },
  });

  // Pick next task (highest priority first, then oldest)
  const task = await prisma.studioTask.findFirst({
    where: { status: "pending" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  if (!task) {
    return Response.json({ message: "Keine wartenden Tasks", processed: false });
  }

  // Mark as running
  await prisma.studioTask.update({
    where: { id: task.id },
    data: { status: "running", startedAt: new Date(), error: null },
  });

  const updateProgress = async (progress: string, pct?: number) => {
    await prisma.studioTask.update({
      where: { id: task.id },
      data: { progress, ...(pct !== undefined ? { progressPct: pct } : {}) },
    });
  };

  try {
    let output: Record<string, unknown> = {};
    let actualCostCents = 0;

    const input = task.input as Record<string, unknown>;

    switch (task.type) {
      case "clip": {
        await updateProgress("Generiere Clip...", 10);
        output = await processClipTask(input, task.userId, updateProgress);
        actualCostCents = (output.costCents as number) || 0;
        break;
      }
      case "audio": {
        await updateProgress("Generiere Audio...", 10);
        output = await processAudioTask(input, task.userId, updateProgress);
        break;
      }
      case "portrait": {
        await updateProgress("Generiere Portrait...", 10);
        output = await processPortraitTask(input, task.userId, updateProgress);
        actualCostCents = 4; // ~$0.04
        break;
      }
      case "landscape": {
        await updateProgress("Generiere Landscape...", 10);
        output = await processLandscapeTask(input, task.userId, updateProgress);
        actualCostCents = 4;
        break;
      }
      case "character-sheet": {
        await updateProgress("Generiere Character Sheet...", 10);
        output = await processCharacterSheetTask(input, task.userId, updateProgress);
        actualCostCents = 4;
        break;
      }
      case "story": {
        await updateProgress("Generiere Geschichte...", 10);
        output = await processStoryTask(input, task.userId, updateProgress);
        actualCostCents = 2; // ~$0.02
        break;
      }
      case "screenplay": {
        await updateProgress("Generiere Drehbuch...", 10);
        output = await processScreenplayTask(input, task.userId, updateProgress);
        actualCostCents = 5; // ~$0.05
        break;
      }
      default:
        throw new Error(`Unbekannter Task-Typ: ${task.type}`);
    }

    // Quality check (if applicable)
    let qualityScore: number | undefined;
    let qualityNotes: string | undefined;

    if (task.type === "clip" || task.type === "portrait" || task.type === "character-sheet") {
      try {
        const { checkVisualQuality } = await import("@/lib/studio/quality-check");
        const check = await checkVisualQuality(
          output.url as string || output.portraitUrl as string || output.videoUrl as string,
          output.prompt as string || "",
          task.type,
        );
        qualityScore = check.score;
        qualityNotes = check.notes;

        // Auto-retry if quality is too low
        if (check.score < 40 && task.retryCount < task.maxRetries) {
          await prisma.studioTask.update({
            where: { id: task.id },
            data: {
              status: "pending",
              retryCount: task.retryCount + 1,
              error: `Quality Score zu niedrig (${check.score}/100): ${check.notes}`,
              qualityScore: check.score,
              qualityNotes: check.notes,
              qualityChecked: true,
              actualCostCents,
            },
          });
          return Response.json({ processed: true, taskId: task.id, status: "retry", qualityScore: check.score });
        }
      } catch (err) {
        console.error("[QualityCheck] Error:", err);
        // Quality check failure is non-fatal
      }
    }

    // Mark as completed
    await prisma.studioTask.update({
      where: { id: task.id },
      data: {
        status: "completed",
        output: output as object,
        progress: "Fertig",
        progressPct: 100,
        completedAt: new Date(),
        actualCostCents,
        ...(qualityScore !== undefined ? { qualityScore, qualityNotes, qualityChecked: true } : {}),
      },
    });

    return Response.json({ processed: true, taskId: task.id, status: "completed", qualityScore });
  } catch (err) {
    console.error(`[StudioTask] ${task.type} failed:`, err);

    const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
    const shouldRetry = task.retryCount < task.maxRetries;

    await prisma.studioTask.update({
      where: { id: task.id },
      data: {
        status: shouldRetry ? "pending" : "failed",
        error: errorMsg,
        retryCount: task.retryCount + 1,
        ...(shouldRetry ? {} : { completedAt: new Date() }),
      },
    });

    return Response.json({ processed: true, taskId: task.id, status: shouldRetry ? "retry" : "failed", error: errorMsg });
  }
}

// ── Task Processors ──────────────────────────────────────────────

async function processClipTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, sequenceId, sceneIndex, quality, stylePrompt } = input as {
    projectId: string;
    sequenceId: string;
    sceneIndex: number;
    quality?: string;
    stylePrompt?: string;
  };

  await updateProgress(`Clip fuer Szene ${sceneIndex + 1}...`, 20);

  // Call the existing clip generation logic via internal fetch
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/sequences/${sequenceId}/clips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Pass auth via internal header
      "x-studio-task-user": userId,
    },
    body: JSON.stringify({
      sceneIndex,
      quality: quality || "standard",
      stylePrompt,
      force: true,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Clip-Generierung fehlgeschlagen (${res.status})`);

  await updateProgress("Clip fertig", 100);
  return data;
}

async function processAudioTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, sequenceId } = input as { projectId: string; sequenceId: string };

  await updateProgress("Generiere Audio...", 20);

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/sequences/${sequenceId}/audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-studio-task-user": userId,
    },
    body: JSON.stringify({ force: true }),
  });

  // Audio uses SSE — read the stream to completion
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Kein Stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.progress) await updateProgress(data.progress, undefined);
          if (data.done) {
            if (data.error) throw new Error(data.error);
            result = data;
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
    }

    return result;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Audio-Generierung fehlgeschlagen");
  return data;
}

async function processPortraitTask(
  input: Record<string, unknown>,
  _userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { actorId, description, style } = input as { actorId: string; description: string; style?: string };

  await updateProgress("Generiere Portrait...", 30);

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/actors/portrait`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": _userId },
    body: JSON.stringify({ actorId, description, style }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Portrait-Generierung fehlgeschlagen");

  await updateProgress("Portrait fertig", 100);
  return data;
}

async function processLandscapeTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, sequenceId, description, style } = input as {
    projectId: string;
    sequenceId: string;
    description: string;
    style?: string;
  };

  await updateProgress("Generiere Landscape...", 30);

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/sequences/${sequenceId}/landscape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ description, style }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Landscape-Generierung fehlgeschlagen");

  await updateProgress("Landscape fertig", 100);
  return data;
}

async function processCharacterSheetTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { actorId, angle, description, style } = input as {
    actorId: string;
    angle: string;
    description: string;
    style?: string;
  };

  await updateProgress(`Character Sheet (${angle})...`, 30);

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/actors/character-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ actorId, angle, description, style }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Character Sheet fehlgeschlagen");

  await updateProgress("Character Sheet fertig", 100);
  return data;
}

async function processStoryTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, brief } = input as { projectId?: string; brief: Record<string, unknown> };

  await updateProgress("Generiere Geschichte...", 20);

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/generate-story`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ brief, projectId }),
  });

  // SSE stream
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Kein Stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.progress) await updateProgress(data.progress);
          if (data.done) {
            if (data.error) throw new Error(data.error);
            result = data;
          }
        } catch { /* */ }
      }
    }
    return result;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Story-Generierung fehlgeschlagen");
  return data;
}

async function processScreenplayTask(
  input: Record<string, unknown>,
  userId: string,
  updateProgress: (p: string, pct?: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const { projectId, directingStyle, atmosphere, atmospherePreset, mode, force } = input as {
    projectId: string;
    directingStyle?: string;
    atmosphere?: string;
    atmospherePreset?: string;
    mode?: string;
    force?: boolean;
  };

  await updateProgress("Generiere Drehbuch...", 20);

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/studio/projects/${projectId}/screenplay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-task-user": userId },
    body: JSON.stringify({ directingStyle, atmosphere, atmospherePreset, mode, force: force ?? true }),
  });

  // SSE stream
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Kein Stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.progress) await updateProgress(data.progress);
          if (data.done) {
            if (data.error) throw new Error(data.error);
            result = data;
          }
        } catch { /* */ }
      }
    }
    return result;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Drehbuch-Generierung fehlgeschlagen");
  return data;
}

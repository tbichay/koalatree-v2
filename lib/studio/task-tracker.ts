/**
 * Server-Side Task Tracker
 *
 * Used by ALL generation routes to automatically create + track StudioTasks.
 * Tasks are stored in DB → visible cross-device via polling.
 *
 * Usage in a route:
 *   const task = await createTask(userId, "clip", projectId, { sceneIndex: 0 });
 *   await task.progress("Generating...", 20);
 *   await task.complete({ videoUrl: "..." });
 *   // or: await task.fail("Error message");
 */

import { prisma } from "@/lib/db";

export type TaskType = "story" | "screenplay" | "audio" | "clip" | "portrait" | "landscape" | "character-sheet" | "assemble" | "voice-design" | "voice-test";

interface TaskHandle {
  id: string;
  /** Update progress text + optional percentage */
  progress: (text: string, pct?: number) => Promise<void>;
  /** Mark task as completed with optional output data */
  complete: (output?: Record<string, unknown>) => Promise<void>;
  /** Mark task as failed */
  fail: (error: string) => Promise<void>;
  /** Check if task was cancelled (poll before expensive operations) */
  isCancelled: () => Promise<boolean>;
}

/**
 * Create a tracked task. Call this at the start of any generation route.
 */
export async function createTask(
  userId: string,
  type: TaskType,
  projectId?: string | null,
  input?: Record<string, unknown>,
  estimatedCostCents?: number,
): Promise<TaskHandle> {
  const task = await prisma.studioTask.create({
    data: {
      userId,
      type,
      projectId: projectId || undefined,
      input: input ? JSON.parse(JSON.stringify(input)) : {},
      status: "running",
      startedAt: new Date(),
      estimatedCostCents,
    },
  });

  return {
    id: task.id,

    async progress(text: string, pct?: number) {
      try {
        await prisma.studioTask.update({
          where: { id: task.id },
          data: { progress: text, ...(pct !== undefined ? { progressPct: pct } : {}) },
        });
      } catch { /* task might have been cancelled/deleted */ }
    },

    async complete(output?: Record<string, unknown>) {
      try {
        await prisma.studioTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            progress: "Fertig",
            progressPct: 100,
            output: output ? JSON.parse(JSON.stringify(output)) : undefined,
            completedAt: new Date(),
          },
        });
      } catch { /* */ }
    },

    async fail(error: string) {
      try {
        await prisma.studioTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            error,
            completedAt: new Date(),
          },
        });
      } catch { /* */ }
    },

    async isCancelled(): Promise<boolean> {
      try {
        const current = await prisma.studioTask.findUnique({
          where: { id: task.id },
          select: { status: true },
        });
        return current?.status === "cancelled";
      } catch { return false; }
    },
  };
}

/**
 * Create a queued task (status: "pending") for background processing by the cron job.
 * Unlike createTask(), this does NOT start the task immediately.
 */
export async function createQueuedTask(
  userId: string,
  type: TaskType,
  projectId: string,
  input: Record<string, unknown>,
  estimatedCostCents?: number,
): Promise<{ id: string }> {
  const task = await prisma.studioTask.create({
    data: {
      userId,
      type,
      projectId,
      input: JSON.parse(JSON.stringify(input)),
      status: "pending",
      estimatedCostCents,
    },
  });
  return { id: task.id };
}

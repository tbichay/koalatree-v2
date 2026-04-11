/**
 * Task Auth Helper — Resolves user ID from session or internal task header.
 *
 * Used by generation routes to support both:
 * 1. Normal user requests (via NextAuth session)
 * 2. Internal cron task requests (via x-studio-task-user header + CRON_SECRET)
 */

import { auth } from "@/lib/auth";

export async function resolveUserId(request: Request): Promise<string | null> {
  // First try normal auth
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  // Then try internal task auth (cron worker)
  const taskUser = request.headers.get("x-studio-task-user");
  const cronSecret = request.headers.get("x-cron-secret");

  if (taskUser && cronSecret && cronSecret === process.env.CRON_SECRET) {
    return taskUser;
  }

  return null;
}

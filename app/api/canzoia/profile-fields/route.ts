/**
 * Canzoia API — GET /api/canzoia/profile-fields
 *
 * Returns the active, system-scoped ProfileFieldDef catalog so Canzoia's
 * onboarding chatbot knows which fields to ask about and in what order.
 *
 * Auth: HMAC via CANZOIA_TO_KOALATREE_SECRET (see lib/canzoia/signing.ts).
 *
 * Response: { fields: ProfileFieldDef[] }
 *
 * Only system-scoped defs (ownerUserId=null) are exposed — admin-private
 * fields stay inside Koalatree. Inactive defs (isActive=false) are filtered
 * here so Canzoia never sees the equivalent of a soft-deleted field.
 */

import { prisma } from "@/lib/db";
import { verifyCanzoiaRequest } from "@/lib/canzoia/signing";
import { canzoiaError } from "@/lib/canzoia/errors";

export async function GET(request: Request) {
  const auth = verifyCanzoiaRequest(request, "");
  if (!auth.ok) return canzoiaError("UNAUTHORIZED", auth.message);

  const fields = await prisma.profileFieldDef.findMany({
    where: { ownerUserId: null, isActive: true },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      kind: true,
      description: true,
      placeholder: true,
      options: true,
      required: true,
      order: true,
      category: true,
      minAlter: true,
      maxAlter: true,
      aiPrompt: true,
    },
  });

  return Response.json({ fields });
}

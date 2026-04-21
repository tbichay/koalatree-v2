/**
 * One-off cleanup: remove deprecated ProfileFieldDef entries.
 *
 * Reason: During the Canzoia onboarding redesign (PROFILE_GROWTH_CONCEPT)
 * we replaced the narrow "Lieblingstier"/"Lieblingsfarbe" prompts with a
 * broader age-aware "lieblings-welten" multi_select and added a
 * "pronomen" field. The new fields are added via seed-profile-fields.ts;
 * this script hard-deletes the old ones so they stop appearing in the
 * onboarding chat.
 *
 * Orphan field_values on existing Canzoia profiles (e.g. a row with
 * field_values.favorite-animal = "Koala") stay untouched — the JSON blob
 * just becomes dead weight. No Canzoia code reads unknown keys.
 *
 * Idempotent: safe to re-run; deleteMany on a non-existent id is a no-op.
 *
 * Run:
 *   npx tsx scripts/cleanup-profile-fields-2026.ts
 * Then:
 *   npx tsx prisma/seed-profile-fields.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEPRECATED_IDS = [
  "favorite-animal",
  "favorite-color",
  // age-years superseded by birthday-iso (2026-04-20 Canzoia onboarding v2).
  // Legacy profiles with field_values["age-years"] = 7 keep working because
  // buildProfileSnapshot passes the raw JSON through; the story generator
  // falls back to that key when birthday-iso is absent.
  "age-years",
];

async function main() {
  const before = await prisma.profileFieldDef.findMany({
    where: { id: { in: DEPRECATED_IDS } },
    select: { id: true, label: true },
  });

  if (before.length === 0) {
    // eslint-disable-next-line no-console
    console.log("Nothing to delete — already clean.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log("Deleting deprecated ProfileFieldDefs:");
  for (const f of before) {
    // eslint-disable-next-line no-console
    console.log(`  - ${f.id}  (${f.label})`);
  }

  const res = await prisma.profileFieldDef.deleteMany({
    where: { id: { in: DEPRECATED_IDS } },
  });

  // eslint-disable-next-line no-console
  console.log(`Deleted ${res.count} row(s). Now run the seed to add the new fields.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

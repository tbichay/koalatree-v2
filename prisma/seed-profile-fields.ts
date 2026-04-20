/**
 * ProfileFieldDef Seed — baseline field catalog fuer Canzoia-Onboarding.
 *
 * Idempotent upsert. Felder mit ownerUserId=null sind system-scoped und
 * werden via /api/canzoia/profile-fields an Canzoia exposed. Admins koennen
 * via /studio/profile-fields weitere Felder anlegen oder hier definierte
 * Felder deaktivieren (nicht loeschen).
 *
 * Run: npx tsx prisma/seed-profile-fields.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface Seed {
  id: string;
  label: string;
  kind: "text" | "number" | "select" | "multi_select" | "boolean" | "tags";
  description?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  order: number;
  category?: string;
  minAlter?: number;
  maxAlter?: number;
  aiPrompt?: string;
}

const SEEDS: Seed[] = [
  // ── Basis ─────────────────────────────────────────────────────
  {
    id: "display-name",
    label: "Name",
    kind: "text",
    description: "Wie das Kind in Geschichten angesprochen wird.",
    placeholder: "z.B. Mia",
    required: true,
    order: 10,
    category: "basic",
    aiPrompt:
      "Frage freundlich nach dem Namen des Kindes. Kurz, einladend, keine Erklaerung noetig.",
  },
  {
    id: "age-years",
    label: "Alter (Jahre)",
    kind: "number",
    description: "Bestimmt den Alters-Stil in Geschichten.",
    required: true,
    order: 20,
    category: "basic",
    aiPrompt: "Frage nach dem Alter des Kindes in Jahren — in ganzzahligen Werten.",
  },

  // ── Vorlieben ────────────────────────────────────────────────
  {
    id: "favorite-animal",
    label: "Lieblingstier",
    kind: "text",
    description: "Taucht bei passenden Geschichten als Nebenfigur auf.",
    placeholder: "Koala, Delfin, Fuchs…",
    order: 30,
    category: "favorites",
    aiPrompt:
      "Frage nach dem Lieblingstier des Kindes. Eine warme Formulierung, keine Liste vorgeben.",
  },
  {
    id: "favorite-color",
    label: "Lieblingsfarbe",
    kind: "text",
    placeholder: "Blau, Lila…",
    order: 35,
    category: "favorites",
    aiPrompt: "Frage nach der Lieblingsfarbe. Kurz und frisch.",
  },

  // ── Interessen ───────────────────────────────────────────────
  {
    id: "interests",
    label: "Interessen",
    kind: "tags",
    description: "Themen, die das Kind mag — mehrere moeglich.",
    placeholder: "Dinosaurier, Sterne, Ballet…",
    order: 40,
    category: "interests",
    aiPrompt:
      "Frage nach Interessen oder Themen, die das Kind gerade spannend findet. Mehrere moeglich, gib Beispiele aus dem Gespraech zurueck statt aus einer Liste.",
  },

  // ── Familie (optional) ───────────────────────────────────────
  {
    id: "siblings",
    label: "Geschwister",
    kind: "tags",
    description: "Namen von Geschwistern, die in Geschichten vorkommen koennen.",
    placeholder: "Leo, Mia…",
    order: 50,
    category: "family",
    aiPrompt:
      "Frage locker, ob es Geschwister gibt, die in Geschichten vorkommen sollen — optional.",
  },
];

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const s of SEEDS) {
    const res = await prisma.profileFieldDef.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        label: s.label,
        kind: s.kind,
        description: s.description ?? null,
        placeholder: s.placeholder ?? null,
        options: s.options ? (s.options as unknown as object) : undefined,
        required: s.required ?? false,
        isActive: true,
        order: s.order,
        category: s.category ?? null,
        minAlter: s.minAlter ?? null,
        maxAlter: s.maxAlter ?? null,
        aiPrompt: s.aiPrompt ?? null,
        ownerUserId: null,
      },
      update: {
        label: s.label,
        kind: s.kind,
        description: s.description ?? null,
        placeholder: s.placeholder ?? null,
        options: s.options ? (s.options as unknown as object) : Prisma.JsonNull,
        required: s.required ?? false,
        // isActive absichtlich NICHT ueberschreiben — Admin-Deaktivierung bleibt erhalten
        order: s.order,
        category: s.category ?? null,
        minAlter: s.minAlter ?? null,
        maxAlter: s.maxAlter ?? null,
        aiPrompt: s.aiPrompt ?? null,
      },
    });
    if (res.createdAt.getTime() === res.updatedAt.getTime()) inserted++;
    else updated++;
  }
  // eslint-disable-next-line no-console
  console.log(`ProfileFieldDef seed: +${inserted} neu, ~${updated} aktualisiert (${SEEDS.length} total)`);
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

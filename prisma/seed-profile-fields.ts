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
  // Options can carry optional meta for age-aware / segment-aware filtering
  // in the onboarding UI (click-chips) without needing schema changes.
  options?: Array<{
    value: string;
    label: string;
    ageMin?: number;
    ageMax?: number;
    forSegment?: "child" | "self" | "adult";
  }>;
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
    description: "Wie die Person in Geschichten angesprochen wird.",
    placeholder: "z.B. Mia",
    required: true,
    order: 10,
    category: "basic",
    aiPrompt:
      "Frage freundlich nach dem Namen — angepasst ans Segment (Kind-Profil: wie heißt das Kind? Selbst-Profil: wie heißt du? Erwachsenen-Profil: wie heißt die Person?). Kurz, einladend, keine Erklärung nötig.",
  },
  // Birthday replaces the old `age-years` number field. Stored as ISO-8601
  // `YYYY-MM-DD`. Day/month may be "15"/"06" placeholders for self/adult
  // profiles where only the year was given — the generator just derives
  // years-since from the stored date. Canzoia collects this via a
  // dedicated pre-chat BirthdayForm (not the chat itself), so no aiPrompt.
  {
    id: "birthday-iso",
    label: "Geburtstag",
    kind: "text",
    description: "ISO-Format YYYY-MM-DD. Für Kinder exakt, bei Erwachsenen reicht das Jahr.",
    required: false,
    order: 20,
    category: "basic",
    aiPrompt:
      'NICHT im Chat fragen — der Geburtstag wird vor dem Chat über ein eigenes Formular erfasst. Wenn bereits im Profil, nutze das Alter als Kontext (z.B. "Bei einem 7-jährigen Kind würde ich eher Dinosaurier vorschlagen") ohne es zu erwähnen.',
  },

  // ── Pronomen ────────────────────────────────────────────────
  // Replaces gendered "m/w/d" question. Default = "name-only" so the
  // generator just uses the name — that's already inclusive and avoids
  // any sexist name-to-pronoun guessing.
  {
    id: "pronomen",
    label: "Pronomen",
    kind: "select",
    description:
      "Wie sollen wir die Person in Geschichten ansprechen? Nur der Name ist oft am schönsten.",
    options: [
      { value: "name-only", label: "Nur Name" },
      { value: "er-ihm", label: "er / ihm" },
      { value: "sie-ihr", label: "sie / ihr" },
      { value: "they-them", label: "they / them" },
    ],
    order: 30,
    category: "basic",
    aiPrompt:
      'Frage nach Pronomen NUR wenn es sich natürlich ergibt — kein Pflicht-Thema. Stelle klar, dass "Nur Name" völlig ok ist (Default). Formuliere neutral und respektvoll, passend zum Segment. Bei Kindern: die Frage geht an die Erwachsenen, die das Profil anlegen.',
  },

  // ── Lieblings-Welten (age-staggered) ─────────────────────────
  // One multi_select with combined options carrying ageMin/ageMax/forSegment
  // meta. The onboarding chat (and future click-chip UI) filter by the
  // profile's segment + birthday to show only appropriate options.
  {
    id: "lieblings-welten",
    label: "Lieblings-Welten",
    kind: "multi_select",
    description:
      "Welche Themen oder Welten sollen häufiger vorkommen? Mehrere sind ok.",
    order: 40,
    category: "interests",
    options: [
      // 0–3 (Baby/Kleinkind)
      { value: "tiere-sanft", label: "Tiere (sanft)", forSegment: "child", ageMin: 0, ageMax: 3 },
      { value: "familie", label: "Familie", forSegment: "child", ageMin: 0, ageMax: 3 },
      { value: "alltag-baby", label: "Alltag", forSegment: "child", ageMin: 0, ageMax: 3 },
      { value: "musik-bewegung", label: "Musik & Bewegung", forSegment: "child", ageMin: 0, ageMax: 3 },
      { value: "gutenacht", label: "Gutenacht", forSegment: "child", ageMin: 0, ageMax: 6 },

      // 3–6 (Kindergarten)
      { value: "tiere", label: "Tiere", forSegment: "child", ageMin: 3, ageMax: 14 },
      { value: "feen-prinz", label: "Feen & Prinz:essinnen", forSegment: "child", ageMin: 3, ageMax: 8 },
      { value: "ritter-drachen", label: "Ritter & Drachen", forSegment: "child", ageMin: 3, ageMax: 10 },
      { value: "fahrzeuge", label: "Fahrzeuge", forSegment: "child", ageMin: 3, ageMax: 8 },
      { value: "freunde", label: "Freunde", forSegment: "child", ageMin: 3, ageMax: 14 },

      // 6–10 (Grundschule)
      { value: "weltall", label: "Weltall", forSegment: "child", ageMin: 6, ageMax: 14 },
      { value: "abenteuer", label: "Abenteuer", forSegment: "child", ageMin: 6, ageMax: 14 },
      { value: "mystery", label: "Mystery & Rätsel", forSegment: "child", ageMin: 6, ageMax: 14 },
      { value: "sport-kids", label: "Sport", forSegment: "child", ageMin: 6, ageMax: 14 },
      { value: "freundschaft", label: "Freundschaft", forSegment: "child", ageMin: 6, ageMax: 14 },
      { value: "fantasy", label: "Fantasy", forSegment: "child", ageMin: 6, ageMax: 14 },

      // 10–14 (Tweens)
      { value: "humor", label: "Humor", forSegment: "child", ageMin: 8, ageMax: 14 },
      { value: "gaming-kids", label: "Gaming", forSegment: "child", ageMin: 8, ageMax: 14 },
      { value: "science-kids", label: "Science", forSegment: "child", ageMin: 8, ageMax: 14 },
      { value: "liebe", label: "Erste Liebe", forSegment: "child", ageMin: 10, ageMax: 14 },

      // Erwachsene (self / adult)
      { value: "wellness", label: "Wellness", forSegment: "self" },
      { value: "wissen", label: "Wissen", forSegment: "self" },
      { value: "geschichte", label: "Geschichte", forSegment: "self" },
      { value: "reisen", label: "Reisen", forSegment: "self" },
      { value: "philosophie", label: "Philosophie", forSegment: "self" },
      { value: "natur", label: "Natur", forSegment: "self" },
      { value: "gesundheit", label: "Gesundheit", forSegment: "self" },
      { value: "kunst", label: "Kunst", forSegment: "self" },
      { value: "sport", label: "Sport", forSegment: "self" },
      { value: "gaming", label: "Gaming", forSegment: "self" },
      { value: "musik", label: "Musik", forSegment: "self" },
      { value: "karriere", label: "Karriere" , forSegment: "self" },
    ],
    aiPrompt:
      "Frage nach Lieblings-Welten — Themen, die häufiger vorkommen sollen. Passe deine Vorschläge ans Alter und Segment an, wenn bekannt:\n- Kind 0-3: Tiere (sanft), Familie, Alltag, Musik & Bewegung, Gutenacht\n- Kind 3-6: Tiere, Feen/Prinz:essinnen, Ritter/Drachen, Fahrzeuge, Freunde\n- Kind 6-10: Weltall, Abenteuer, Mystery, Sport, Freundschaft, Fantasy, Tiere\n- Kind 10-14: Fantasy, Mystery, Humor, Sport, Gaming, Science, Erste Liebe\n- Erwachsen: Wellness, Wissen, Reisen, Natur, Philosophie, Kunst, Sport, Gaming, Musik, Karriere\nGib 3-5 Vorschläge aus dem passenden Band, locker formuliert — keine starre Liste. Mehrere Auswahlen sind ok.",
  },

  // ── Freie Interessen (offen, Text-Tags) ──────────────────────
  // Stays alongside lieblings-welten — the select is for the broad
  // show-category, tags is for specific nerd-topics ("Dinosaurier",
  // "Pferde-Dressur", "Prompt Engineering"). Both can coexist.
  {
    id: "interests",
    label: "Spezielle Interessen",
    kind: "tags",
    description: "Konkrete Themen oder Nerd-Topics — mehrere möglich.",
    placeholder: "Dinosaurier, Pferde, Sterne…",
    order: 50,
    category: "interests",
    aiPrompt:
      "Frage nach konkreten Interessen oder Themen, die die Person gerade spannend findet. Mehrere möglich, kein Vorgeben einer Liste — greife Dinge aus dem Gespräch auf.",
  },

  // ── Familie (optional, primär für Kind-Profile) ──────────────
  {
    id: "siblings",
    label: "Wichtige Menschen",
    kind: "tags",
    description:
      "Namen von Menschen, die in Geschichten vorkommen dürfen — Geschwister, Freunde, Oma…",
    placeholder: "Leo, Mia, Oma Hanni…",
    order: 60,
    category: "family",
    aiPrompt:
      "Frage locker, ob es wichtige Menschen gibt, die in Geschichten vorkommen sollen — Geschwister, beste Freund:innen, Oma/Opa. Optional, mehrere möglich. Bei Selbst-Profilen eher zurückhaltend fragen.",
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

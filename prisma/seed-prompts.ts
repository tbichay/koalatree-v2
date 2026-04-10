/**
 * KoalaTree Prompt Library Seed Script
 *
 * Seeds the database with:
 * - ~40 PromptBlocks (character, style, atmosphere, visual, format, rules)
 * - ~10 AIModels (video, image, text, audio providers)
 *
 * Run: npx tsx prisma/seed-prompts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SYSTEM_USER = "system";

// ── Prompt Blocks ────────────────────────────────────────────────

const PROMPT_BLOCKS = [
  // ── Characters ──
  {
    slug: "character:koda",
    type: "character",
    name: "Koda - Der Weise",
    description: "Weiser alter Koala, Grossvater-Figur, philosophisch",
    content: `Koda ist ein alter, weiser Koala mit einer runden Brille auf der Nase. Er sitzt meistens auf seinem dicken Ast im KoalaTree.

Sprechstil: Langsam und bedaechtig. Macht Pausen zum Nachdenken. Nutzt Metaphern aus der Natur. Stellt Fragen statt Antworten zu geben.
{{#if alter <= 5}}Spricht in kurzen, einfachen Saetzen. Wiederholt wichtige Worte. Sehr warm und geduldig.{{/if}}
{{#if alter >= 6 and alter <= 8}}Erklaert mit Geschichten und Beispielen. Nutzt einfache Vergleiche.{{/if}}
{{#if alter >= 9}}Kann philosophischer werden. Stellt tiefere Fragen. Laedt zum Mitdenken ein.{{/if}}`,
    variables: { alter: "number", role: "string" },
    modelHint: "claude",
    tags: ["koalatree", "character", "narrator"],
  },
  {
    slug: "character:kiki",
    type: "character",
    name: "Kiki - Die Freche",
    description: "Frecher Kookaburra, vorlaut, keck, immer einen Spruch parat",
    content: `Kiki ist ein kleiner, frecher Kookaburra mit buntem Gefieder und einem schelmischen Grinsen.

Sprechstil: Schnell und aufgeregt. Unterbricht manchmal andere. Macht Witze und Wortspiele. Lacht gerne (Hahaha!).
{{#if alter <= 5}}Sehr albern. Macht Tiergeraeusche. Kichert viel. Einfache Witze.{{/if}}
{{#if alter >= 6 and alter <= 8}}Wortwitze und Reime. Freche Kommentare. Aber wird ernst bei wichtigen Momenten.{{/if}}
{{#if alter >= 9}}Sarkastischer Humor. Pop-Kultur Anspielungen. Aber immer herzlich.{{/if}}`,
    variables: { alter: "number", role: "string" },
    modelHint: "claude",
    tags: ["koalatree", "character", "comic-relief"],
  },
  {
    slug: "character:luna",
    type: "character",
    name: "Luna - Die Traeumerin",
    description: "Sanfte Eule, traumreisende Fuehrerin, mysterioes und poetisch",
    content: `Luna ist eine sanfte Eule mit schimmerndem Gefieder und grossen, wissenden Augen. Sie erscheint meistens bei Nacht oder in Traeumen.

Sprechstil: Leise und poetisch. Spricht in Bildern. Laesst Pausen fuer die Vorstellung. Fuehrt durch Traumwelten.
{{#if alter <= 5}}Sehr beruhigend. Beschreibt was man sieht und fuehlt. Atme-mit-mir Momente.{{/if}}
{{#if alter >= 6 and alter <= 8}}Magische Beschreibungen. Sinneseindruecke. Gefuehle benennen.{{/if}}
{{#if alter >= 9}}Philosophische Traumbilder. Metaphern. Tiefere Bedeutungen.{{/if}}`,
    variables: { alter: "number", role: "string" },
    modelHint: "claude",
    tags: ["koalatree", "character", "meditation"],
  },
  {
    slug: "character:mika",
    type: "character",
    name: "Mika - Der Mutige",
    description: "Abenteuerlustige Dingo, mutig, wild, Action-Held",
    content: `Mika ist ein junger, energischer Dingo mit einem bunten Bandana um den Hals. Er ist immer bereit fuer Abenteuer.

Sprechstil: Energisch und begeistert. Kurze, actionreiche Saetze. Ruft "Los gehts!" und "Keine Angst!". Ermutigt andere.
{{#if alter <= 5}}Einfache Abenteuer. "Komm mit!" Sprache. Viel Bewegung und Action.{{/if}}
{{#if alter >= 6 and alter <= 8}}Helden-Sprache. Plaene schmieden. Team-Motivator.{{/if}}
{{#if alter >= 9}}Strategisches Denken. Mutige Entscheidungen. Vorbildfunktion.{{/if}}`,
    variables: { alter: "number", role: "string" },
    modelHint: "claude",
    tags: ["koalatree", "character", "adventure"],
  },
  {
    slug: "character:pip",
    type: "character",
    name: "Pip - Der Entdecker",
    description: "Neugieriges Schnabeltier, forscht und fragt, Wissenschaftler",
    content: `Pip ist ein neugieriges Schnabeltier mit einer kleinen Lupe. Er taucht ueberall auf wo es etwas zu entdecken gibt.

Sprechstil: Fragend und staunend. "Wusstest du...?" und "Was passiert wenn...?" Erklaert mit Begeisterung.`,
    variables: { alter: "number" },
    modelHint: "claude",
    tags: ["koalatree", "character", "educational"],
  },
  {
    slug: "character:sage",
    type: "character",
    name: "Sage - Der Denker",
    description: "Stiller Wombat, meditiert zwischen Wurzeln, philosophisch",
    content: `Sage ist ein ruhiger Wombat der zwischen den Wurzeln des KoalaTree meditiert. Er oeffnet ein Auge wenn jemand vorbeikommt.

Sprechstil: Bedaechtig und ruhig. Wenige Worte, aber jedes zaehlt. Stellt tiefe Fragen. Antwortet mit Gegenfragen.`,
    variables: { alter: "number" },
    modelHint: "claude",
    tags: ["koalatree", "character", "reflection"],
  },
  {
    slug: "character:nuki",
    type: "character",
    name: "Nuki - Der Froeliche",
    description: "Glueckliches Quokka, huepft tollpatschig, strahlt Freude aus",
    content: `Nuki ist ein kleines Quokka mit dem breitesten Grinsen der Welt. Er huepft ueberall hin und faellt manchmal vom Ast.

Sprechstil: Freudig und ueberschwenglich. "Yayyy!" und "Das ist SO toll!" Steckt alle mit guter Laune an. Etwas tollpatschig.`,
    variables: { alter: "number" },
    modelHint: "claude",
    tags: ["koalatree", "character", "joy"],
  },

  // ── Directing Styles ──
  {
    slug: "style:pixar-classic",
    type: "style",
    name: "Pixar Classic",
    description: "Warme Farben, weiches Abendlicht, sanfte Kamerabewegungen",
    content: `REGIE-STIL: Pixar Classic

Licht & Farbe: DURCHGEHEND warmes goldenes Abendlicht (Golden Hour). KEIN Lichtwechsel. Wiederhole "warm golden sunset light" in JEDER sceneDescription. Weiche Schatten, warme Farben.

Kamerafuehrung: Close-Up bei emotionalen Momenten. Medium Shot bei Koerpersprache. Wide Shot nur bei Staunen. Kamerabewegungen IMMER sanft und langsam. Depth-of-Field bei Close-Ups.

Charakter-Bewegung: Bei Bewegung → TRACKING SHOT (Kamera FOLGT dem Charakter). Bei Stillstand → Statische Kamera mit leichtem Drift.

Uebergaenge: "flow" fuer die meisten. "zoom-to-character" bei neuem Sprecher. "cut" NUR bei grossem Ortswechsel.`,
    variables: {},
    modelHint: "any",
    tags: ["directing", "default", "warm"],
  },
  {
    slug: "style:long-take",
    type: "style",
    name: "One Take",
    description: "Minimale Schnitte, kontinuierliche Kamera, immersiv",
    content: `REGIE-STIL: Long Take / One-Shot

Kernprinzip: Die Kamera schneidet SO WENIG WIE MOEGLICH. Sie FLIESST durch die Szene wie ein Vogel.

Kamerafuehrung: JEDE Szene beginnt mit "Die Kamera gleitet weiter..." KEINE "cut" Uebergaenge. Clips LAENGER (10-15s). Die Kamera "entdeckt" Charaktere.

Uebergaenge: ALLE "flow" oder "zoom-to-character". KEIN "cut". Szenen-Dauer: 10-15s pro Szene. Max 15-20 Szenen total.`,
    variables: {},
    modelHint: "any",
    tags: ["directing", "immersive"],
  },
  {
    slug: "style:dramatic",
    type: "style",
    name: "Dramatisch",
    description: "Starke Kontraste, viele Perspektivwechsel, spannend",
    content: `REGIE-STIL: Dramatisch / Spielberg

Kernprinzip: Jede Szene baut SPANNUNG auf. Zeige BEVOR etwas passiert WO es passieren wird.

Kamerafuehrung: VIELE Perspektivwechsel. Schnelle Schnitte bei Action. Langsame Zooms bei Emotion. Low-Angle fuer Eindruck, High-Angle fuer Verletzlichkeit.

Anticipation: VOR jedem wichtigen Moment zeige WO die Aktion stattfindet. Reaction-Shots NACH wichtigem Dialog.`,
    variables: {},
    modelHint: "any",
    tags: ["directing", "dramatic"],
  },
  {
    slug: "style:minimal",
    type: "style",
    name: "Zen",
    description: "Ruhige statische Einstellungen, viel Luft, meditativ",
    content: `REGIE-STIL: Minimal / Zen

Kernprinzip: Weniger ist mehr. Die Stille spricht.

Kamerafuehrung: Meist STATISCHE Einstellungen. Wenn Bewegung: EXTREM langsam (10+ Sekunden). Viel "Luft" im Bild. Wide Shots dominieren.

Pacing: LANGSAM. Doppelt so viel Stille. Landscape-Szenen 5-8s. NUR "flow" Uebergaenge.`,
    variables: {},
    modelHint: "any",
    tags: ["directing", "meditation", "calm"],
  },

  // ── Atmospheres ──
  {
    slug: "atmosphere:golden-hour",
    type: "atmosphere",
    name: "Goldene Stunde",
    description: "Warmes goldenes Abendlicht",
    content: "Warm golden sunset light filtering through eucalyptus leaves. Long soft shadows. Everything bathed in amber-orange warmth. Sky gradient from deep orange at horizon to soft gold above. Magical golden glow on all surfaces and characters.",
    variables: {},
    modelHint: "any",
    tags: ["atmosphere", "warm", "default"],
  },
  {
    slug: "atmosphere:blue-hour",
    type: "atmosphere",
    name: "Blaue Stunde",
    description: "Blau-violette Daemmerung",
    content: "Soft blue-purple twilight. Deep blue sky fading to warm pink at the horizon. First stars appearing. Cool blue ambient light with warm golden accents from within the tree. Magical, dreamy atmosphere.",
    variables: {},
    modelHint: "any",
    tags: ["atmosphere", "dreamy"],
  },
  {
    slug: "atmosphere:bright-day",
    type: "atmosphere",
    name: "Sonniger Tag",
    description: "Helles froeliches Tageslicht",
    content: "Bright cheerful daylight. Clear blue sky with soft white clouds. Warm sunbeams filtering through green canopy creating dappled light patterns. Fresh, vibrant, alive atmosphere.",
    variables: {},
    modelHint: "any",
    tags: ["atmosphere", "bright"],
  },
  {
    slug: "atmosphere:moonlight",
    type: "atmosphere",
    name: "Mondnacht",
    description: "Silbernes Mondlicht, Sterne, Gluehwuermchen",
    content: "Silver moonlight illuminating the scene. Deep blue-purple night sky with glowing full moon and scattered stars. Soft silver-white light on characters. Gentle shadows. Magical fireflies. Peaceful, intimate night atmosphere.",
    variables: {},
    modelHint: "any",
    tags: ["atmosphere", "night", "calm"],
  },
  {
    slug: "atmosphere:misty",
    type: "atmosphere",
    name: "Morgennebel",
    description: "Nebel, gedaempftes Licht, mysterioes",
    content: "Soft morning mist swirling between branches. Diffused warm light breaking through fog. Pastel colors — soft pink, lavender, pale gold. Dewdrops glistening on leaves. Mysterious, gentle, awakening atmosphere.",
    variables: {},
    modelHint: "any",
    tags: ["atmosphere", "misty", "mysterious"],
  },

  // ── Visual Styles ──
  {
    slug: "visual:disney-2d",
    type: "visual",
    name: "2D Disney",
    description: "2D Disney Animation, handgezeichnet, warm",
    content: "2D Disney animation style, hand-drawn feel, vibrant watercolor backgrounds, expressive characters, warm soft lighting, classic fairy tale aesthetic.",
    variables: {},
    modelHint: "kling",
    tags: ["visual", "2d", "disney", "default"],
  },
  {
    slug: "visual:pixar-3d",
    type: "visual",
    name: "3D Pixar",
    description: "3D CGI Rendering, Subsurface Scattering, cinematisch",
    content: "Pixar 3D animation style, smooth CGI rendering, subsurface scattering on skin, volumetric lighting, detailed textures, cinematic depth of field.",
    variables: {},
    modelHint: "kling",
    tags: ["visual", "3d", "pixar"],
  },
  {
    slug: "visual:ghibli",
    type: "visual",
    name: "Studio Ghibli",
    description: "Anime, gemalte Hintergruende, Pastell, traeumerisch",
    content: "Studio Ghibli anime style, lush painted backgrounds, soft pastel colors, dreamy atmosphere, detailed nature, gentle watercolor textures.",
    variables: {},
    modelHint: "kling",
    tags: ["visual", "anime", "ghibli"],
  },
  {
    slug: "visual:storybook",
    type: "visual",
    name: "Bilderbuch",
    description: "Buntstift und Wasserfarbe, warm, gemuetlich",
    content: "Children's storybook illustration style, soft colored pencil and watercolor, warm muted palette, cozy and inviting, textured paper feel.",
    variables: {},
    modelHint: "kling",
    tags: ["visual", "illustration", "cozy"],
  },
  {
    slug: "visual:realistic",
    type: "visual",
    name: "Realistisch",
    description: "Fotorealistisch, natuerliches Licht, cinematisch",
    content: "Photorealistic CGI, lifelike textures and materials, natural lighting, cinematic color grading, shallow depth of field.",
    variables: {},
    modelHint: "kling",
    tags: ["visual", "realistic"],
  },
  {
    slug: "visual:claymation",
    type: "visual",
    name: "Claymation",
    description: "Stop-Motion Knetfiguren, handgemacht",
    content: "Stop-motion claymation style, soft clay textures, slightly imperfect surfaces, warm directional lighting, miniature set design feel.",
    variables: {},
    modelHint: "kling",
    tags: ["visual", "claymation", "stopmotion"],
  },
];

// ── AI Models ────────────────────────────────────────────────────

const AI_MODELS = [
  // Video — Dialog / Lip-Sync
  {
    id: "kling-avatar-v2-standard",
    provider: "fal.ai",
    category: "video-lipsync",
    name: "Kling Avatar v2 Standard",
    costUnit: "per-second",
    costAmount: 0.056,
    capabilities: { maxDuration: 15, lipsync: true, aspectRatios: ["9:16", "16:9", "1:1"] },
    isDefault: true,
  },
  {
    id: "kling-avatar-v2-pro",
    provider: "fal.ai",
    category: "video-lipsync",
    name: "Kling Avatar v2 Pro",
    costUnit: "per-second",
    costAmount: 0.115,
    capabilities: { maxDuration: 15, lipsync: true, aspectRatios: ["9:16", "16:9", "1:1"] },
  },
  // Video — Image-to-Video (Landscape)
  {
    id: "seedance-1.5",
    provider: "fal.ai",
    category: "video-i2v",
    name: "Seedance 1.5",
    costUnit: "per-second",
    costAmount: 0.005,
    capabilities: { maxDuration: 10, lipsync: false },
    isDefault: true,
  },
  {
    id: "kling-3.0-standard",
    provider: "fal.ai",
    category: "video-i2v",
    name: "Kling 3.0 Standard",
    costUnit: "per-second",
    costAmount: 0.017,
    capabilities: { maxDuration: 10, elementBinding: true },
  },
  {
    id: "kling-3.0-pro",
    provider: "fal.ai",
    category: "video-i2v",
    name: "Kling 3.0 Pro",
    costUnit: "per-second",
    costAmount: 0.034,
    capabilities: { maxDuration: 10, elementBinding: true },
  },
  {
    id: "veo-3.1-lite",
    provider: "google",
    category: "video-i2v",
    name: "Veo 3.1 Lite",
    costUnit: "per-second",
    costAmount: 0.05,
    capabilities: { maxDuration: 8, generateAudio: true, resolution: "720p" },
    isDefault: false,
  },
  {
    id: "veo-3.1-fast",
    provider: "google",
    category: "video-i2v",
    name: "Veo 3.1 Fast",
    costUnit: "per-second",
    costAmount: 0.15,
    capabilities: { maxDuration: 8, generateAudio: true, resolution: "1080p" },
  },
  // Seedance 2.0 — Native lip-sync
  {
    id: "seedance-2.0",
    provider: "fal.ai",
    category: "video-lipsync",
    name: "Seedance 2.0",
    costUnit: "per-second",
    costAmount: 0.30,
    capabilities: { maxDuration: 15, lipsync: true, nativeLipsync: true, languages: "8+", endImage: true },
  },
  {
    id: "seedance-2.0-i2v",
    provider: "fal.ai",
    category: "video-i2v",
    name: "Seedance 2.0 I2V",
    costUnit: "per-second",
    costAmount: 0.30,
    capabilities: { maxDuration: 15, endImage: true, referenceVideo: true },
  },
  // Image Generation
  {
    id: "gpt-image-1",
    provider: "openai",
    category: "image-gen",
    name: "GPT Image 1",
    costUnit: "per-image",
    costAmount: 0.04,
    capabilities: { maxSize: "1536x1024", editing: true },
    isDefault: true,
  },
  // Text Generation
  {
    id: "claude-sonnet-4",
    provider: "anthropic",
    category: "text-gen",
    name: "Claude Sonnet 4",
    costUnit: "per-1k-tokens",
    costAmount: 0.003,
    capabilities: { maxTokens: 64000, streaming: true },
    isDefault: true,
  },
  // Audio — TTS
  {
    id: "elevenlabs-v3",
    provider: "elevenlabs",
    category: "audio-tts",
    name: "ElevenLabs v3",
    costUnit: "per-character",
    costAmount: 0.00003,
    capabilities: { languages: ["de", "en"], multiVoice: true, streaming: true },
    isDefault: true,
  },
  // Audio — SFX
  {
    id: "elevenlabs-sfx",
    provider: "elevenlabs",
    category: "audio-sfx",
    name: "ElevenLabs Sound Effects",
    costUnit: "per-second",
    costAmount: 0.001,
    capabilities: { maxDuration: 22 },
    isDefault: true,
  },
];

// ── Seed Runner ──────────────────────────────────────────────────

async function seed() {
  console.log("Seeding Prompt Blocks...");

  for (const block of PROMPT_BLOCKS) {
    await prisma.promptBlock.upsert({
      where: {
        slug_version_scope: { slug: block.slug, version: 1, scope: "system" },
      },
      create: {
        slug: block.slug,
        type: block.type,
        name: block.name,
        description: block.description || null,
        content: block.content,
        variables: block.variables || {},
        version: 1,
        isProduction: true,
        scope: "system",
        createdBy: SYSTEM_USER,
        modelHint: block.modelHint || null,
        tags: block.tags || [],
      },
      update: {
        name: block.name,
        content: block.content,
        description: block.description || null,
        variables: block.variables || {},
        tags: block.tags || [],
      },
    });
    console.log(`  ✓ ${block.slug}`);
  }

  console.log(`\nSeeding AI Models...`);

  for (const model of AI_MODELS) {
    await prisma.aIModel.upsert({
      where: { id: model.id },
      create: {
        id: model.id,
        provider: model.provider,
        category: model.category,
        name: model.name,
        costUnit: model.costUnit,
        costAmount: model.costAmount,
        capabilities: model.capabilities || {},
        isActive: true,
        isDefault: model.isDefault || false,
      },
      update: {
        name: model.name,
        costUnit: model.costUnit,
        costAmount: model.costAmount,
        capabilities: model.capabilities || {},
        isDefault: model.isDefault || false,
      },
    });
    console.log(`  ✓ ${model.id}`);
  }

  console.log(`\nDone! Seeded ${PROMPT_BLOCKS.length} blocks + ${AI_MODELS.length} models.`);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

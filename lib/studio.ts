/**
 * KoalaTree Studio — Prompt Builder & Character Config
 *
 * Builds image-generation prompts from BRAND.md definitions.
 * Used by /api/admin/studio/generate to create consistent portraits.
 */

// ── Style prefix (from BRAND.md Section 1) ──────────────────────────
export const STYLE_PREFIX = `Traditional hand-drawn cel animation style from the 1994 Disney era. Flat 2D artwork with clean ink outlines and smooth hand-painted colors. NOT 3D, NOT CGI, NOT Pixar style. Think "The Lion King 1994", "The Jungle Book 1967". CLEAN smooth background with bold flat color gradients and soft-edged clouds. NO noise, NO grain, NO texture artifacts, NO speckles. Sky must be perfectly smooth with clean color transitions. Crisp character outlines against a clean painted backdrop.`;

// ── Background suffix (appended to every prompt) ────────────────────
const BG_SUFFIX = `NO noise, NO grain, NO speckles. Bold saturated colors. Square composition.`;
const BG_SUFFIX_WIDE = `NO noise, NO grain, NO speckles. Bold saturated colors. Wide 16:9 landscape composition.`;

// ── Characters ──────────────────────────────────────────────────────
export type CharacterKey = "koda" | "kiki" | "luna" | "mika" | "pip" | "sage" | "nuki";

export interface CharacterDef {
  name: string;
  tier: string;
  emoji: string;
  color: string;
  description: string;        // visual description for prompts
  accessories: string;        // key visual markers
  defaultBackground: string;  // default time-of-day
}

export const CHARACTERS: Record<CharacterKey, CharacterDef> = {
  koda: {
    name: "Koda",
    tier: "Koala",
    emoji: "\u{1F428}",
    color: "#a8d5b8",
    description:
      "An OLD wise koala bear sitting on a thick eucalyptus branch. Grey-brown soft fur with silver-grey streaks around his muzzle and ears showing age. Warm knowing half-smile, kind deep brown eyes with gentle crow's feet. He looks like a loving grandfather.",
    accessories: "small round gold-rimmed reading glasses perched on his big black nose",
    defaultBackground: "golden",
  },
  kiki: {
    name: "Kiki",
    tier: "Kookaburra",
    emoji: "\u{1F426}",
    color: "#e8c547",
    description:
      "A young cheerful kookaburra bird perched on a eucalyptus branch. Beak wide open in a joyful hearty laugh. Brown and cream plumage with vivid blue-turquoise wing feathers. Bright mischievous green eyes sparkling with humor.",
    accessories: "A small green eucalyptus leaf stuck playfully on top of her head like a little hat",
    defaultBackground: "golden",
  },
  luna: {
    name: "Luna",
    tier: "Eule",
    emoji: "\u{1F989}",
    color: "#b8a0d5",
    description:
      "A beautiful barn owl sitting serenely on a eucalyptus branch at night. Soft cream and white feathers with a subtle lavender-purple iridescent shimmer. Large round dark eyes half-closed in a peaceful dreamy expression. She gently holds a small softly glowing firefly between her wing tips.",
    accessories: "A tiny glowing crescent moon marking on her forehead",
    defaultBackground: "night",
  },
  mika: {
    name: "Mika",
    tier: "Dingo",
    emoji: "\u{1F415}",
    color: "#d4884a",
    description:
      "A young energetic Australian dingo standing on a eucalyptus branch. Sandy-golden fur with a lighter cream chest. One front paw raised in a confident fist pump. Expression: determined brave grin, bright excited brown eyes full of courage.",
    accessories: "an olive-green adventure bandana around his neck",
    defaultBackground: "golden",
  },
  pip: {
    name: "Pip",
    tier: "Schnabeltier",
    emoji: "\u{1F9AB}",
    color: "#6bb5c9",
    description:
      "A small adorable platypus sitting curiously on a eucalyptus branch. Sleek dark brown velvety fur with a distinctive duck-like bill. Oversized round curious brown eyes looking at a glowing golden butterfly with pure wonder and amazement. His flat beaver-like tail hangs over the branch.",
    accessories: "He holds a tiny brass magnifying glass in one small paw",
    defaultBackground: "golden",
  },
  sage: {
    name: "Sage",
    tier: "Wombat",
    emoji: "\u{1F43B}",
    color: "#8a9e7a",
    description:
      "A calm sturdy wombat sitting in a peaceful zen meditation pose on a eucalyptus branch. Dark brown-grey coarse dense fur. Eyes peacefully closed with a serene gentle smile. A single pink lotus flower resting on the branch beside him.",
    accessories: "A subtle silver-white streak across his broad forehead suggesting deep wisdom",
    defaultBackground: "dawn",
  },
  nuki: {
    name: "Nuki",
    tier: "Quokka",
    emoji: "\u2600\uFE0F",
    color: "#f0b85a",
    description:
      "A small round adorable quokka (Australian marsupial) sitting slightly crooked on a eucalyptus branch as if he just almost fell off. Warm golden-brown soft fur. His signature feature: a permanent wide happy grin showing that quokkas always look like they're smiling. Large round joyful brown eyes full of warmth and mischief. He holds a half-nibbled eucalyptus leaf in one tiny paw. Slightly chubby and clumsy-looking.",
    accessories: "permanent wide happy grin",
    defaultBackground: "golden",
  },
};

// ── Poses ───────────────────────────────────────────────────────────
export type PoseKey = "portrait" | "waving" | "thinking" | "surprised" | "excited" | "sleepy";

export const POSES: Record<PoseKey, string> = {
  portrait: "", // default — just the character description
  waving: "gently waving one paw in greeting with a warm welcoming smile",
  thinking:
    "one paw thoughtfully resting under chin, looking slightly upward with a contemplative expression, as if remembering a beautiful old story",
  surprised:
    "eyes wide open with a delighted surprised expression, both paws raised in amazement",
  excited:
    "bouncing with excitement, eyes sparkling, one paw raised in a celebratory cheer",
  sleepy:
    "eyes half-closed with a peaceful drowsy smile, yawning softly, looking cozy and warm",
};

export const POSE_LABELS: Record<PoseKey, string> = {
  portrait: "Standard (Portrait)",
  waving: "Winkend",
  thinking: "Nachdenklich",
  surprised: "\u00DCberrascht",
  excited: "Aufgeregt",
  sleepy: "Schl\u00E4frig",
};

// ── Scenes (backgrounds) ────────────────────────────────────────────
export type SceneKey = "golden" | "blue" | "night" | "dawn" | "sunny";

export const SCENES: Record<SceneKey, string> = {
  golden:
    "clean smooth golden-orange sunset sky with bold flat color gradients and soft-edged clouds. Eucalyptus leaves framing the scene.",
  blue: "clean smooth deep blue twilight sky with perfectly smooth gradient from deep navy to warm purple-pink at the horizon. Soft-edged clouds with clean shapes.",
  night:
    "clean smooth deep blue-purple night sky with perfectly smooth color gradients, a glowing full moon, scattered stars. Soft silver moonlight glow.",
  dawn: "clean smooth dawn sky with perfectly smooth pastel gradients of pink, lavender and pale gold. Soft-edged clouds below suggesting height.",
  sunny:
    "clean smooth bright blue sky with bold flat color gradients and warm sunbeams filtering through eucalyptus leaves. Cheerful bright atmosphere.",
};

export const SCENE_LABELS: Record<SceneKey, string> = {
  golden: "Goldene Stunde",
  blue: "Blaue Stunde",
  night: "Nacht",
  dawn: "Morgen",
  sunny: "Sonnig",
};

// ── Prompt Builder ──────────────────────────────────────────────────

export function buildPrompt(
  character: CharacterKey,
  pose: PoseKey = "portrait",
  scene?: SceneKey,
  wide = false,
): string {
  const c = CHARACTERS[character];
  const bg = scene ?? (c.defaultBackground as SceneKey);
  const poseText = POSES[pose];
  const sceneText = SCENES[bg];

  const parts: string[] = [
    STYLE_PREFIX,
    `Portrait of ${c.description}`,
  ];

  // Accessories
  if (c.accessories && character !== "nuki") {
    // Nuki's "accessory" is his grin, already in description
    parts.push(`He wears ${c.accessories}.`);
  }

  // Pose
  if (poseText) {
    parts.push(poseText + ".");
  }

  // Background
  parts.push(`Background: ${sceneText}`);
  parts.push(wide ? BG_SUFFIX_WIDE : BG_SUFFIX);

  return parts.join("\n");
}

// ── Hero Background (no characters) ─────────────────────────────────

export const HERO_BG_PROMPT = `${STYLE_PREFIX}
Wide cinematic landscape scene of a magnificent giant magical eucalyptus tree at blue hour twilight. CLEAN smooth deep blue sky with perfectly smooth gradient from deep navy to warm purple-pink at the horizon, first stars appearing. NO noise, NO grain, NO speckles — sky must be perfectly clean with bold flat color transitions. Soft-edged clouds with clean shapes. The tree is enormous and ancient with thick sprawling branches, glowing softly with warm golden light from within its canopy, tiny golden fireflies floating around it. Soft grass with wildflowers below the tree. Warm magical inviting atmosphere. NO characters — empty branches where characters will be composited later. Bold saturated colors. Clean clear sky without any artifacts or noise. Wide 16:9 landscape composition.`;

// ── Filename helper ─────────────────────────────────────────────────

export function buildFilename(
  character: CharacterKey,
  pose: PoseKey,
): string {
  if (pose === "portrait") return `${character}-portrait.png`;
  return `${character}-${pose}.png`;
}

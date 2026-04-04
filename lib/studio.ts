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

// ── Hero Character Prompt (transparent background) ──────────────────

const HERO_CHAR_STYLE = `Traditional hand-drawn cel animation style from the 1994 Disney era. Flat 2D artwork with clean ink outlines and smooth hand-painted colors. NOT 3D, NOT CGI, NOT Pixar style. Think "The Lion King 1994".`;

export function buildHeroCharPrompt(character: CharacterKey): string {
  const c = CHARACTERS[character];

  const parts: string[] = [
    HERO_CHAR_STYLE,
    `Full body illustration of ${c.description}`,
  ];

  // Accessories
  if (c.accessories && character !== "nuki") {
    parts.push(`He wears ${c.accessories}.`);
  }

  parts.push(`The character is sitting naturally on a thick eucalyptus branch.`);
  parts.push(`Blue hour twilight lighting — the character is illuminated with soft deep blue-purple ambient light mixed with warm golden light from below, as if sitting in a magical glowing tree at dusk.`);
  parts.push(`Show the FULL character body and the branch they sit on. Clean crisp outlines. Bold saturated colors.`);
  parts.push(`TRANSPARENT BACKGROUND — only the character and the branch, nothing else. No sky, no additional scenery.`);

  return parts.join("\n");
}

// ── Hero Full Scene (single image with all characters) ─────────────

export function buildHeroFullPrompt(): string {
  return `${STYLE_PREFIX}

Wide cinematic 16:9 landscape painting of an enormous ancient magical eucalyptus tree at blue hour twilight. The tree stands on a gentle grassy hill dotted with small wildflowers. CLEAN smooth deep blue sky with a perfectly smooth gradient from deep navy above to warm purple-pink at the horizon, first stars appearing. Soft-edged clouds with clean shapes. The tree has thick, sprawling branches at many different heights, glowing softly from within with warm golden light. Tiny golden fireflies float around the canopy and branches.

SEVEN animal characters are placed naturally throughout the tree and at its base. Each character physically interacts with the tree — sitting on branches, gripping bark, leaning against the trunk. They cast soft shadows on the branches and ground beneath them. All characters share consistent blue-hour lighting: cool deep blue-purple ambient light from the sky mixed with warm golden glow from the tree's canopy.

TOP CENTER of the tree, on the thickest main branch — KODA: ${CHARACTERS.koda.description} He wears ${CHARACTERS.koda.accessories}. He is the LARGEST character, sitting comfortably and looking down warmly at the others like a grandfather watching over his family. His paws grip the wide branch naturally.

UPPER RIGHT, perched on a thinner branch — KIKI: ${CHARACTERS.kiki.description} ${CHARACTERS.kiki.accessories}. She sits slightly tilted on the branch as if about to jump, talons gripping the bark.

UPPER LEFT, sitting serenely on a sturdy branch — LUNA: ${CHARACTERS.luna.description} She has ${CHARACTERS.luna.accessories}. She sits peacefully with wings slightly folded, the firefly she holds casting a small warm glow on her feathers.

STANDING ON THE GRASS to the right of the tree trunk at ground level — MIKA: ${CHARACTERS.mika.description} He wears ${CHARACTERS.mika.accessories}. He stands confidently on the ground, looking upward toward Koda with his paw raised, as if ready for an adventure. His paws rest on the soft grass.

MIDDLE LEFT, on a medium branch — NUKI: ${CHARACTERS.nuki.description} He sits slightly crooked on the branch as if he almost fell off but is still grinning happily, one tiny paw gripping the branch for balance.

LOWER RIGHT, on a low branch — PIP: ${CHARACTERS.pip.description} ${CHARACTERS.pip.accessories}. He peers curiously at a glowing butterfly, his flat tail hanging naturally over the edge of the branch.

LOWER LEFT, sitting on a wide exposed tree root at the base of the tree — SAGE: ${CHARACTERS.sage.description} He has ${CHARACTERS.sage.accessories}. He sits in a calm zen meditation pose on the root, a pink lotus flower resting beside him on the moss-covered wood.

The overall composition is warm, magical, and inviting — a family of friends gathered in their beloved tree at the most beautiful time of day. Bold saturated colors throughout. Each character is clearly distinct and recognizable. The tree is enormous enough that all seven characters have ample space.

${BG_SUFFIX_WIDE}`;
}

// ── Hero character positions on the 1536×1024 canvas ────────────────

export interface HeroCharPos {
  key: CharacterKey;
  x: number;      // center X on 1536px canvas
  y: number;      // center Y on 1024px canvas
  size: number;    // target height in px
  glowColor: string;
}

export const HERO_POSITIONS: HeroCharPos[] = [
  { key: "koda",  x: 768,  y: 250,  size: 300, glowColor: "#a8d5b8" }, // top center — largest, main character
  { key: "kiki",  x: 1080, y: 320,  size: 240, glowColor: "#e8c547" }, // upper right
  { key: "luna",  x: 460,  y: 300,  size: 240, glowColor: "#b8a0d5" }, // upper left
  { key: "mika",  x: 1120, y: 540,  size: 230, glowColor: "#d4884a" }, // middle right
  { key: "nuki",  x: 400,  y: 560,  size: 220, glowColor: "#f0b85a" }, // middle left
  { key: "pip",   x: 1020, y: 730,  size: 210, glowColor: "#6bb5c9" }, // lower right
  { key: "sage",  x: 520,  y: 720,  size: 220, glowColor: "#8a9e7a" }, // lower left
];

// ── Filename helper ─────────────────────────────────────────────────

export function buildFilename(
  character: CharacterKey,
  pose: PoseKey,
): string {
  if (pose === "portrait") return `${character}-portrait.png`;
  return `${character}-${pose}.png`;
}

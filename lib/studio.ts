/**
 * KoalaTree Studio — Prompt Builder & Character Config
 *
 * Builds image-generation prompts from BRAND.md definitions.
 * Used by /api/admin/studio/generate to create consistent portraits.
 */

// ── Style prefix (from BRAND.md Section 1) ──────────────────────────
export const STYLE_PREFIX = `Traditional hand-drawn cel animation style from the 1994 Disney era. Flat 2D artwork with clean ink outlines and smooth hand-painted colors. NOT 3D, NOT CGI, NOT Pixar style. Think "The Lion King 1994", "The Jungle Book 1967". CLEAN smooth background with bold flat color gradients and soft-edged clouds. NO noise, NO grain, NO texture artifacts, NO speckles, NO floating particles, NO dots in the sky. Sky must be perfectly smooth with clean color transitions. Crisp character outlines against a clean painted backdrop.`;

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

Wide cinematic 16:9 landscape painting dominated by a MASSIVE, truly ENORMOUS ancient magical eucalyptus tree — the KoalaTree. This is no ordinary tree: it is GIGANTIC, ancient beyond measure, its mighty trunk wider than a house, its sprawling crown filling most of the image from edge to edge. The tree towers into the sky, its canopy reaching toward the stars. Thick, gnarled branches spread out in every direction at many different heights. The tree glows softly from deep within its bark and canopy with warm golden-amber magical light, as if a gentle fire burns at its heart. Hundreds of tiny golden fireflies drift lazily through the branches and around the crown like living stars.

The scene is set at blue hour twilight. CLEAN smooth deep blue sky with a perfectly smooth gradient from deep navy above to warm purple-pink at the horizon. First stars appear in the darkening sky. Soft-edged clouds. The tree stands on a gentle grassy hill with small wildflowers. The magical glow of the tree illuminates the grass and characters below in warm golden tones.

EXACTLY SEVEN small animal characters are scattered across the massive tree — they are SMALL compared to the enormous tree, like tiny inhabitants of a great ancient world. All characters are roughly the same small size relative to the tree (the tree should be at least 10 times taller than any character). Each character physically sits on or stands near the tree. All share consistent blue-hour lighting mixed with the tree's warm golden glow.

CHARACTER 1 — KODA (koala): Sitting on the thick main branch near the top center of the tree. Old wise koala with grey-brown fur, silver-grey streaks around muzzle, small round gold-rimmed reading glasses on his nose. Warm grandfatherly smile, looking down at the others. He is the centerpiece but still small compared to the mighty tree.

CHARACTER 2 — KIKI (kookaburra): Perched on a branch to the upper right. Brown-cream plumage with vivid blue-turquoise wing feathers. Beak wide open laughing. Small green eucalyptus leaf on her head. Sitting tilted as if about to jump.

CHARACTER 3 — LUNA (barn owl): Sitting serenely on a branch to the upper left. Soft cream and lavender-toned feathers. Large dreamy half-closed eyes. Tiny glowing crescent moon on her forehead. Holds a softly glowing firefly between her wing tips.

CHARACTER 4 — MIKA (dingo): Standing on the grass at the RIGHT side of the tree trunk, at ground level. Sandy-golden fur with lighter cream chest. Olive-green adventure bandana around his neck. One paw raised in a confident fist pump, looking up toward Koda.

CHARACTER 5 — NUKI (quokka): Sitting on a medium branch on the LEFT side of the tree. Small round quokka with warm golden-brown fur. Permanent wide happy grin (quokkas always smile). Sitting slightly crooked on the branch as if he almost fell off but is still grinning. Holds a half-nibbled eucalyptus leaf. IMPORTANT: Nuki MUST be clearly visible and distinct from the other characters.

CHARACTER 6 — PIP (platypus): On a low branch to the lower right. Small dark brown platypus with a duck-like bill. Oversized curious round eyes. Holds a tiny brass magnifying glass. His flat beaver tail hangs over the branch. A glowing golden butterfly floats before him.

CHARACTER 7 — SAGE (wombat): Sitting on a wide exposed tree root at the base of the tree, lower left. Sturdy dark brown-grey wombat. Eyes peacefully closed, serene gentle smile. Silver-white streak across his broad forehead. Sitting in calm zen meditation pose. Pink lotus flower beside him.

CRITICAL: There must be EXACTLY 7 characters — count them. The tree must be MASSIVE and DOMINANT in the composition — it is the star of the image, a magical ancient wonder. The characters are its small beloved inhabitants. Bold saturated colors. Warm magical inviting atmosphere.

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

// ── Branding Prompts ───────────────────────────────────────────────

export const BRANDING_FAVICON_PROMPT = `${STYLE_PREFIX}
A simple iconic app icon of a single magical eucalyptus tree. The tree has a thick sturdy trunk and a lush, rounded canopy glowing with warm golden-amber light from within. Tiny golden fireflies float around the canopy. Deep forest green canopy with warm golden highlights. Set against a deep dark forest green background (#1a2e1a). Clean bold silhouette style — must be instantly recognizable at very small sizes (16x16 pixels). Minimal detail, strong clear shapes, high contrast between the glowing golden tree and the dark background. NO characters, NO text, NO animals, NO letters. Just the magical glowing tree icon. Centered square composition with generous padding around the tree. ${BG_SUFFIX}`;

export function buildBrandingLogoPrompt(): string {
  const koda = CHARACTERS.koda;
  return `${STYLE_PREFIX}
A brand logo illustration featuring a magical glowing eucalyptus tree with a small wise koala sitting on its main branch. The koala: ${koda.description} ${koda.accessories}. The tree is large and majestic with a thick trunk and lush rounded canopy, glowing with warm golden-amber magical light from within. Tiny golden fireflies float gently around the canopy. The koala (Koda) sits peacefully on the thickest branch, looking wise and welcoming with his gold-rimmed glasses. Deep dark forest green background (#1a2e1a). Clean iconic style suitable for a brand logo — strong shapes, clear outlines, high contrast. The tree is the dominant element, Koda is a charming small detail on the branch. NO text, NO letters, NO words. Centered square composition. ${BG_SUFFIX}`;
}

// ── Branding icon sizes ────────────────────────────────────────────

export interface BrandingIconSize {
  filename: string;
  width: number;
  height: number;
  maskable?: boolean;
}

export const FAVICON_ICON_SIZES: BrandingIconSize[] = [
  { filename: "favicon-16.png", width: 16, height: 16 },
  { filename: "favicon-32.png", width: 32, height: 32 },
  { filename: "apple-touch-icon.png", width: 180, height: 180 },
  { filename: "icon-192.png", width: 192, height: 192 },
  { filename: "icon-512.png", width: 512, height: 512 },
  { filename: "icon-maskable-512.png", width: 512, height: 512, maskable: true },
  { filename: "app-icon.png", width: 512, height: 512 },
];

// ── Filename helper ─────────────────────────────────────────────────

export function buildFilename(
  character: CharacterKey,
  pose: PoseKey,
): string {
  if (pose === "portrait") return `${character}-portrait.png`;
  return `${character}-${pose}.png`;
}

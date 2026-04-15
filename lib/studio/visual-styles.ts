/**
 * Central visual style definitions — ONE place to add/edit styles.
 * Used by: engine/page.tsx, library/page.tsx, portrait/route.ts,
 *          character-sheet/route.ts, library/generate/route.ts
 */

export interface VisualStyle {
  id: string;
  label: string;
  prompt: string;       // Full prompt for video/film generation (engine)
  styleHint: string;    // Shorter hint for image generation (portraits, props, locations)
}

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: "disney-2d",
    label: "2D Disney",
    prompt: "2D Disney animation style, hand-drawn feel, vibrant watercolor backgrounds, expressive characters, warm soft lighting, classic fairy tale aesthetic.",
    styleHint: "2D Disney animation style, vibrant colors, hand-drawn feel",
  },
  {
    id: "pixar-3d",
    label: "3D Pixar",
    prompt: "Pixar 3D animation style, smooth CGI rendering, subsurface scattering on skin, volumetric lighting, detailed textures, cinematic depth of field.",
    styleHint: "Pixar 3D animation style, smooth CGI rendering",
  },
  {
    id: "ghibli",
    label: "Studio Ghibli",
    prompt: "Studio Ghibli anime style, lush painted backgrounds, soft pastel colors, dreamy atmosphere, detailed nature, gentle watercolor textures.",
    styleHint: "Studio Ghibli anime style, soft pastel colors",
  },
  {
    id: "storybook",
    label: "Bilderbuch",
    prompt: "Children's storybook illustration style, soft colored pencil and watercolor, warm muted palette, cozy and inviting, textured paper feel.",
    styleHint: "Children's storybook illustration, soft colored pencil and watercolor",
  },
  {
    id: "realistic",
    label: "Realistisch",
    prompt: "Photorealistic CGI, lifelike textures and materials, natural lighting, cinematic color grading, shallow depth of field.",
    styleHint: "Photorealistic, cinematic lighting, shallow depth of field",
  },
  {
    id: "claymation",
    label: "Claymation",
    prompt: "Stop-motion claymation style, soft clay textures, slightly imperfect surfaces, warm directional lighting, miniature set design feel.",
    styleHint: "Stop-motion claymation style, soft clay textures, warm lighting",
  },
  {
    id: "koalatree",
    label: "KoalaTree Magic",
    prompt: "Warm animated cinematic style, rich digital painting aesthetic, lush detailed eucalyptus forest backgrounds, golden hour warm lighting with soft volumetric light rays, expressive anthropomorphic animal characters with big emotive eyes and detailed fur textures, magical atmosphere with gentle floating particles and fireflies, painterly brushstroke textures visible in backgrounds, Puss in Boots The Last Wish inspired rendering quality.",
    styleHint: "Warm animated cinematic style, rich digital painting, golden hour lighting, expressive detail, magical atmosphere with gentle particles, Puss in Boots The Last Wish inspired",
  },
  {
    id: "custom",
    label: "Eigener Style",
    prompt: "",
    styleHint: "High quality",
  },
];

/** Get style hint for image generation by style ID */
export function getStyleHint(styleId: string): string {
  return VISUAL_STYLES.find((s) => s.id === styleId)?.styleHint || "High quality";
}

/** Get full prompt for video/film generation by style ID */
export function getStylePrompt(styleId: string): string {
  return VISUAL_STYLES.find((s) => s.id === styleId)?.prompt || "";
}

/** Style options for <select> dropdowns (excludes 'custom') */
export const STYLE_OPTIONS = VISUAL_STYLES.filter((s) => s.id !== "custom");

/**
 * Kling O3 (Omni) Prompting Guide — Optimized for Cinematic Film Production
 *
 * Based on: https://blog.fal.ai/kling-3-0-prompting-guide/
 *
 * KEY PRINCIPLES:
 * 1. Think in SHOTS, not clips — use cinematic language (tracking, POV, dolly)
 * 2. Anchor subjects EARLY — define characters at the beginning
 * 3. Describe motion EXPLICITLY — both subject AND camera movement
 * 4. Use native audio intentionally — [Character, tone]: "dialogue"
 * 5. Leverage longer durations — describe HOW the scene PROGRESSES
 *
 * STYLE: Write like a film director, not a list of attributes.
 * BAD: "A man, beach, sunset, surfboard, walking"
 * GOOD: "Tracking shot follows a muscular surfer as he walks confidently toward
 *        the water, surfboard tucked under his right arm, golden sunrise casting
 *        long shadows on the pristine sand"
 */

// ── Camera Movement Keywords (Kling understands these) ──

export const CAMERA_KEYWORDS: Record<string, string> = {
  "static": "Locked-off static shot",
  "pan-left": "Slow pan left across the scene",
  "pan-right": "Slow pan right across the scene",
  "tilt-up": "Camera tilts upward revealing the sky",
  "tilt-down": "Camera tilts downward toward the ground",
  "zoom-in": "Dolly zoom-in effect, camera moves closer",
  "zoom-out": "Camera slowly pulls back revealing the wider scene",
  "dolly-forward": "Dolly forward, camera glides toward the subject",
  "dolly-back": "Dolly backward, camera retreats from the subject",
  "tracking": "Tracking shot follows the subject in motion",
  "rotation": "Camera slowly orbits around the subject",
};

// ── Emotion to Acting Direction ──

export const EMOTION_ACTING: Record<string, string> = {
  "neutral": "natural, relaxed expression",
  "excited": "eyes wide with excitement, animated gestures, leaning forward",
  "happy": "warm genuine smile, eyes crinkling, relaxed shoulders",
  "sad": "downcast eyes, slight frown, shoulders slumped",
  "angry": "jaw clenched, intense stare, fists tightened",
  "scared": "wide eyes darting around, tense posture, shallow breathing",
  "dramatic": "intense gaze, deliberate movements, heightened presence",
  "tense": "rigid posture, controlled breathing, scanning the environment",
  "calm": "serene expression, slow deliberate movements, peaceful demeanor",
  "joyful": "full laughter, head tilted back, whole body shaking with joy",
};

// ── Build an O3-optimized prompt ──

export function buildO3Prompt(options: {
  sceneDescription: string;
  camera?: string;
  cameraMotion?: string;
  emotion?: string;
  characterName?: string;
  characterDescription?: string;
  outfit?: string;
  traits?: string;
  location?: string;
  mood?: string;
  prevSceneHint?: string;
  clipTransition?: string;
}): string {
  const parts: string[] = [];

  // 1. TRANSITION CONTEXT (if seamless continuation)
  if (options.clipTransition === "seamless" && options.prevSceneHint) {
    parts.push(`Continuing seamlessly from previous shot: ${options.prevSceneHint.slice(0, 100)}.`);
  }

  // 2. CAMERA (cinematic language, not just a label)
  const cameraDesc = options.cameraMotion
    ? CAMERA_KEYWORDS[options.cameraMotion] || options.cameraMotion
    : options.camera
      ? CAMERA_KEYWORDS[options.camera] || options.camera
      : "";
  if (cameraDesc) parts.push(cameraDesc + ".");

  // 3. CHARACTER (anchor early — define who we see)
  if (options.characterName) {
    let charLine = options.characterName;
    if (options.characterDescription) charLine += `, ${options.characterDescription}`;
    if (options.outfit) charLine += `, wearing ${options.outfit}`;
    if (options.traits) charLine += `, ${options.traits}`;
    parts.push(charLine + ".");
  }

  // 4. ACTION + SCENE (the core — what happens, how it progresses)
  // Strip quoted dialog from scene description (audio comes from ElevenLabs)
  const cleanDesc = options.sceneDescription
    .replace(/"[^"]*"/g, "")
    .replace(/koalatree/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanDesc) parts.push(cleanDesc);

  // 5. EMOTION as acting direction
  if (options.emotion && options.emotion !== "neutral") {
    const acting = EMOTION_ACTING[options.emotion];
    if (acting) parts.push(`Expression: ${acting}.`);
  }

  // 6. ENVIRONMENT
  if (options.location) parts.push(`Setting: ${options.location}.`);
  if (options.mood) parts.push(`Mood: ${options.mood}.`);

  // 7. QUALITY ANCHORS (always)
  parts.push("Cinematic quality, natural lighting, no text overlays, no watermarks.");

  return parts.join(" ");
}

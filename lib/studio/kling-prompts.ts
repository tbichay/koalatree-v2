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
  "neutral": "natural relaxed expression, soft gaze, hands at rest",
  "excited": "eyes wide with excitement, animated gestures, leaning forward eagerly, hands gesturing expressively",
  "happy": "warm genuine smile, eyes crinkling at corners, relaxed shoulders, gentle head tilt",
  "sad": "downcast eyes glistening, slight frown, shoulders slumped inward, hands limp at sides",
  "angry": "jaw clenched tight, intense piercing stare, fists tightened, nostrils flared, body rigid",
  "scared": "wide eyes darting around, tense hunched posture, shallow rapid breathing, hands trembling",
  "dramatic": "intense focused gaze, deliberate slow movements, chin raised, heightened commanding presence",
  "tense": "rigid upright posture, controlled measured breathing, eyes scanning environment, muscles visible in jaw",
  "calm": "serene peaceful expression, slow deliberate movements, deep even breathing, hands resting openly",
  "joyful": "full uninhibited laughter, head tilted back, whole body shaking with joy, eyes squeezed shut from laughing",
  "whisper": "leaning in close, hand cupped near mouth, eyes darting sideways conspiratorially, hunched posture",
  "laughing": "mouth wide open laughing, eyes crinkled shut, shoulders bouncing, one hand on chest or stomach",
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
  directorNote?: string;
  isDialog?: boolean;
}): string {
  const parts: string[] = [];

  // 1. TRANSITION CONTEXT
  if (options.clipTransition === "seamless" && options.prevSceneHint) {
    parts.push(`Continuing seamlessly from previous shot: ${options.prevSceneHint.slice(0, 300)}.`);
  } else if (options.clipTransition === "match-cut" && options.prevSceneHint) {
    parts.push(`MATCH CUT — dramatic camera angle change from previous shot. Same scene, same lighting, same environment. New perspective:`);
  }

  // 2. CAMERA (cinematic language, not just a label)
  const cameraDesc = options.cameraMotion
    ? CAMERA_KEYWORDS[options.cameraMotion] || options.cameraMotion
    : options.camera
      ? CAMERA_KEYWORDS[options.camera] || options.camera
      : "";
  if (options.clipTransition === "match-cut" && cameraDesc) {
    // Make camera description more prominent for match-cuts
    parts.push(`Camera: ${cameraDesc}.`);
  } else if (cameraDesc) {
    parts.push(cameraDesc + ".");
  }

  // 3. CHARACTER (anchor early — define who we see)
  if (options.characterName) {
    let charLine = options.characterName;
    if (options.characterDescription) charLine += `, ${options.characterDescription}`;
    if (options.outfit) charLine += `, wearing ${options.outfit}`;
    if (options.traits) charLine += `, ${options.traits}`;
    // Dialog scenes: character speaks TO THE CAMERA (viewer = audience)
    if (options.isDialog) charLine += ", looking directly at the camera, speaking to the viewer";
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

  // 7. MOTION ANCHORS (prevent AI from animating static objects)
  if (!options.characterName) {
    // Landscape scene — NO characters, NO faces on objects
    parts.push("Pure landscape scene — NO characters, NO faces, NO anthropomorphic features on trees or objects. Gentle motion in leaves, water, light rays, and wind only. Trees, roots, rocks, and ground are INANIMATE objects — they do NOT have eyes, mouths, hands, or faces.");
  }

  // 8. QUALITY ANCHORS (always)
  parts.push("Cinematic quality, natural lighting, no text overlays, no watermarks.");

  return parts.join(" ");
}

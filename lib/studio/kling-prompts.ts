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
  /** Cinema-Mode: wenn true, wird ein harter "only this character visible" Guard
   *  an den Prompt angehaengt. Verhindert Halluzination anderer Charaktere wenn
   *  der Dialog sie erwaehnt aber die Szene sie nicht zeigen soll.
   *  Setze auf true wenn presentCharacterIds.length === 1 und shotType ∈
   *  {"single","reaction","reveal","insert"}. */
  soloSubject?: boolean;
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

  // 7b. SOLO SUBJECT GUARD (Cinema Mode) — harter Anker damit die AI keine
  // zusaetzlichen Figuren halluziniert, auch wenn der Dialog andere erwaehnt.
  if (options.soloSubject && options.characterName) {
    parts.push(
      `CRITICAL: Only ${options.characterName} is visible in frame. ` +
      `No other characters, creatures, humans, or animals appear anywhere in the shot — ` +
      `not in the background, not at the edges, not as silhouettes. ` +
      `Single-subject composition, fully anchored on ${options.characterName}.`,
    );
  }

  // 8. QUALITY ANCHORS (always)
  parts.push("Cinematic quality, natural lighting, no text overlays, no watermarks.");

  return parts.join(" ");
}

// ── Wan 2.7 Prompt Builder ─────────────────────────────────────────
//
// Unterschied zu Kling O3:
// - Kling verlangt Ref-Syntax (@Image1, @Image2 "for consistency") damit
//   Multi-Ref-Character-Sheets als SAME character interpretiert werden.
// - Wan 2.7 I2V kennt Multi-Ref NICHT. Es bekommt EIN Start-Image (+optional
//   end_image_url) und versteht direkten natuersprachlichen Prompt.
// - Dialog-Pfad: Wan bekommt zusaetzlich `audio_url` und macht nativ
//   Lip-Sync — also keine explizite "@Audio1"-Referenz im Prompt noetig.
//
// Patterns uebernommen aus erfolgreichen Spike-Varianten:
//   A (Dialog + Prop + Audio) — "looking directly at camera, speaking..."
//   G (Landscape from image)  — "preserve composition, lighting... no characters"
//   F (Location-Orbit)        — camera motion language

/** Negativ-Prompts pro Scene-Type — blockt die haeufigsten Wan-Regressions. */
export const WAN_NEGATIVE_PROMPTS: Record<string, string> = {
  // Dialog: aggressiv gegen schlechten Lip-Sync. Nach Prod-Test 2026-04-18
  // um "closed mouth", "lips not moving", "out-of-sync lips", "frozen face"
  // erweitert — die haeufigsten Regressions bei Koala-/Cartoon-Dialogen.
  dialog:
    "text, subtitles, captions, watermark, extra fingers, deformed hands, " +
    "static frozen pose, speech bubble, mumbling, closed mouth, lips not moving, " +
    "frozen face, stiff expression, out-of-sync lips, mouth asymmetry, " +
    "blurry mouth, deformed mouth, missing teeth",
  landscape: "text, subtitles, captions, watermark, characters, people, humans, animals, birds, creatures, static frozen frame, unnatural motion, camera shake",
  transition: "text, subtitles, captions, watermark, hard cut, scene change, new location, character swap, jump cut, teleport",
  intro: "text, subtitles, captions, watermark, extra limbs, deformed hands, static frozen pose",
  outro: "text, subtitles, captions, watermark, extra limbs, deformed hands, static frozen pose",
};

/** Pick the right negative prompt for a scene type; falls back to generic. */
export function wanNegativePromptFor(sceneType?: string): string {
  if (!sceneType) return WAN_NEGATIVE_PROMPTS.dialog;
  return WAN_NEGATIVE_PROMPTS[sceneType] || WAN_NEGATIVE_PROMPTS.dialog;
}

/**
 * Build a Wan-2.7-optimized prompt.
 *
 * Calling convention mirrors buildO3Prompt so the cron doesn't have to branch
 * on which prompt-builder to pick — but the OUTPUT is Wan-tailored:
 * - no @Image/@Audio refs (Wan ignores them)
 * - no "looking at camera" injection duplicated when isDialog (Wan sees the
 *   audio directly, so prompt just needs "speaking warmly" as acting cue)
 * - landscape scenes get explicit "no characters, pure environment" anchor
 *   because Wan I2V tends to hallucinate a figure if any face-like pixel is
 *   in the reference image
 */
export function buildWanPrompt(options: {
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
  isDialog?: boolean;
  /** Set true for landscape scenes where image_url = location photo (Variant G pattern). */
  isLandscapeFromImage?: boolean;
  /** Cinema-Mode: siehe buildO3Prompt — haengt "only this character in frame" Guard an. */
  soloSubject?: boolean;
}): string {
  const parts: string[] = [];

  // 1. TRANSITION CONTEXT — Wan understands "continuing from" semantically
  //    even without the image-anchor, but if prevFrame is passed as image_url
  //    the anchor is pixel-level anyway.
  if (options.clipTransition === "seamless" && options.prevSceneHint) {
    parts.push(`Continuing seamlessly from the previous shot: ${options.prevSceneHint.slice(0, 300)}.`);
  } else if (options.clipTransition === "match-cut" && options.prevSceneHint) {
    parts.push(`MATCH CUT from the previous shot — same scene, same lighting, new camera angle.`);
  }

  // 2. LANDSCAPE-FROM-IMAGE (Variant G pattern) — strong "preserve reference"
  //    anchor UP FRONT to stop Wan from re-imagining the location.
  if (options.isLandscapeFromImage) {
    parts.push(
      `A cinematic nature scene based on this exact location photograph — ` +
      `preserve the composition, lighting, color palette, and every element of the reference image. ` +
      `No characters, no people, no animals — pure environmental cinematography.`,
    );
  }

  // 3. CAMERA
  const cameraDesc = options.cameraMotion
    ? CAMERA_KEYWORDS[options.cameraMotion] || options.cameraMotion
    : options.camera
      ? CAMERA_KEYWORDS[options.camera] || options.camera
      : "";
  if (cameraDesc) parts.push(cameraDesc + ".");

  // 4. CHARACTER (only if present — landscape scenes skip)
  if (options.characterName && !options.isLandscapeFromImage) {
    let charLine = options.characterName;
    if (options.characterDescription) charLine += ` (${options.characterDescription})`;
    if (options.outfit) charLine += `, wearing ${options.outfit}`;
    if (options.traits) charLine += `, ${options.traits}`;
    // Dialog scenes: kurzer "speaking"-Cue auf der Character-Zeile. Der
    // detaillierte Mouth-Sync-Block kommt als Dialog-Tail ganz ans Ende
    // (siehe Schritt 9b) — so ueberlebt er Wan's Prompt-Expansion.
    if (options.isDialog) {
      charLine += ", looking directly at the camera, speaking warmly and naturally to the viewer";
    }
    parts.push(charLine + ".");
  }

  // 5. ACTION + SCENE (core narrative)
  const cleanDesc = options.sceneDescription
    .replace(/"[^"]*"/g, "")       // strip quoted dialog (audio carries it)
    .replace(/koalatree/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanDesc) parts.push(cleanDesc);

  // 6. EMOTION
  if (options.emotion && options.emotion !== "neutral") {
    const acting = EMOTION_ACTING[options.emotion];
    if (acting) parts.push(`Expression: ${acting}.`);
  }

  // 7. ENVIRONMENT (only for non-landscape-from-image scenes; G already anchored)
  if (!options.isLandscapeFromImage) {
    if (options.location) parts.push(`Setting: ${options.location}.`);
    if (options.mood) parts.push(`Mood: ${options.mood}.`);
  }

  // 8. MOTION ANCHORS for landscape (without image) — faces-on-trees guard
  if (!options.characterName && !options.isLandscapeFromImage) {
    parts.push(
      "Pure landscape scene — NO characters, NO faces on objects. " +
      "Gentle natural motion: leaves in wind, light rays, drifting particles. " +
      "Trees, rocks, and ground are inanimate.",
    );
  }

  // 9. LANDSCAPE-FROM-IMAGE motion anchor (Variant G tail)
  if (options.isLandscapeFromImage) {
    parts.push(
      "Subtle natural ambient motion: leaves gently swaying in a soft breeze, " +
      "dappled sunlight flickering through branches, tiny drifting particles " +
      "catching the light, distant foliage moving softly, atmospheric haze shifting.",
    );
  }

  // 9a. SOLO SUBJECT GUARD (Cinema Mode) — analog zu buildO3Prompt. Bei Wan
  // besonders wichtig weil I2V sonst gern Nebencharaktere aus dem Prompt-Text
  // aushalluziniert, auch wenn das Start-Bild nur einen Charakter zeigt.
  if (options.soloSubject && options.characterName && !options.isLandscapeFromImage) {
    parts.push(
      `CRITICAL: Only ${options.characterName} is visible in frame. ` +
      `No other characters, creatures, humans, or animals appear anywhere in the shot — ` +
      `not in the background, not at the edges, not as silhouettes. ` +
      `Single-subject composition, fully anchored on ${options.characterName}.`,
    );
  }

  // 9b. DIALOG-FOCUS TAIL — muss so nah wie moeglich ans Prompt-Ende, damit
  // Wan's Prompt-Expansion die Mouth-Sync-Cues nicht wegformuliert. Dieser
  // Block replicirt das erfolgreiche Spike-Variant-A-Pattern (siehe
  // app/api/studio/test-wan-spike/route.ts), wo der Mouth-Cue am Ende stand.
  if (options.isDialog && options.characterName && !options.isLandscapeFromImage) {
    parts.push(
      "Expressive face with natural lip movement, " +
      "clear articulate mouth shapes synced frame-by-frame to every syllable of the audio, " +
      "distinct vowel and consonant shapes, mouth fully visible and front-facing.",
    );
  }

  // 10. QUALITY ANCHORS (always)
  parts.push("Cinematic quality, natural lighting. Single continuous shot. No text, no subtitles, no watermark.");

  return parts.join(" ");
}

/**
 * KoalaTree Studio — Core Types
 *
 * Shared types for the V2 film pipeline.
 * Used by: screenplay generator, character extractor,
 * sequence renderer, film assembler, and all APIs.
 */

// ── Story Beats (Basis-Storyboard) ────────────────────────────────

/** A single story beat — the atomic unit of narrative */
export interface StoryBeat {
  id: string;
  index: number;

  /** Who is speaking/acting */
  characterId: string | null; // null = narrator or SFX-only
  /** What is said */
  text: string;
  /** Emotional tone */
  emotion: "neutral" | "happy" | "sad" | "excited" | "angry" | "scared" | "whisper" | "dramatic" | "calm";
  /** Sound effects for this beat */
  sfx?: string; // e.g., "leaves rustling", "water splashing"
  /** Ambient sound */
  ambience?: string; // e.g., "forest", "ocean", "night"
  /** Pause after this beat (ms) */
  pauseAfterMs?: number;
  /** Estimated duration (ms) based on word count */
  estimatedDurationMs: number;
}

/** The basis storyboard — shared foundation for audio and film rendering */
export interface BasisStoryboard {
  title: string;
  language: string;
  beats: StoryBeat[];
  totalEstimatedDurationMs: number;
  characters: string[]; // Character IDs found in the story
}

// ── Screenplay (Film-Storyboard) ──────────────────────────────────

/** A film scene within a sequence */
export interface StudioScene {
  id: string;
  index: number;

  // From basis beat
  beatIds: string[]; // Which story beats this scene covers
  characterId?: string;
  spokenText?: string;

  // Film-specific
  type: "dialog" | "landscape" | "transition" | "intro" | "outro";
  sceneDescription: string;
  location: string;
  mood: string;
  camera: string;
  cameraMotion?: "static" | "pan-left" | "pan-right" | "tilt-up" | "tilt-down" | "zoom-in" | "zoom-out" | "dolly-forward" | "dolly-back" | "tracking" | "rotation";
  transitionTo?: "cut" | "flow" | "zoom-to-character";

  // Clip transition: how THIS clip connects to the NEXT
  clipTransition?: "seamless" | "hard-cut" | "fade-to-black" | "match-cut";

  // Context from screenplay
  emotion?: "neutral" | "tense" | "dramatic" | "calm" | "excited" | "sad" | "angry" | "joyful";
  sfx?: string;      // e.g. "Motor heult auf, Reifen quietschen"
  ambience?: string;  // e.g. "Rennstrecke mit Zuschauer-Jubel"

  // Timing
  audioStartMs: number;
  audioEndMs: number;
  durationHint: number;
  actualDurationMs?: number;

  // Per-scene audio (NEW: replaces single storyAudioUrl)
  dialogAudioUrl?: string;     // TTS audio for this scene
  sfxAudioUrl?: string;        // SFX audio for this scene
  dialogDurationMs?: number;   // Actual dialog duration in ms

  // Visual Storyboard (pre-production)
  storyboardImageUrl?: string;   // Generated storyboard frame
  storyboardApproved?: boolean;  // User approved this frame
  storyboardPrompt?: string;     // Custom prompt override for regeneration

  // Scene Anchor Image (pre-production, character-in-location)
  // Ein vom User approbiertes Setup-Bild: Charakter (aus Portrait) im
  // Location-Kontext (aus Sequence.landscapeRefUrl). Wird im Clip-Cron als
  // imageSource verwendet — statt raw Portrait oder Flux-Pre-Step. Bildet
  // die Pre-Production vs Production-Split-Architektur: Setup-Time approval,
  // Generation-Time determinism.
  sceneAnchorImageUrl?: string;      // Finaler Pick (vom User ausgewaehlt)
  sceneAnchorCandidates?: string[];  // History aller generierten Kandidaten
  sceneAnchorRefinement?: string;    // Letzte User-Anmerkung fuer Korrekturen

  // Production state
  videoUrl?: string;
  clipName?: string;
  status: "pending" | "generating" | "done" | "error";
  quality?: "standard" | "premium";

  // Start image override (for hard-cut / fade-to-black)
  startImageOverride?: {
    type: "location" | "portrait" | "custom";
    url?: string;
  };

  // Clip versions
  versions?: ClipVersion[];
  activeVersionIdx?: number;
}

/** A single clip version with metadata */
export interface ClipVersion {
  videoUrl: string;
  provider: string;       // "kling-avatar", "seedance", "veo", etc.
  quality: "standard" | "premium";
  cost: number;           // Estimated cost in USD
  durationSec: number;
  createdAt: string;       // ISO timestamp
  thumbnailUrl?: string;
  directorNote?: string;   // User's fine-tuning note for this specific clip
  cameraOverride?: string; // Camera override used for this clip
}

/** A sequence — one continuous location/atmosphere */
export interface ScreenplaySequence {
  id: string;
  orderIndex: number;
  name: string;

  // Setting
  location: string;
  locationId?: string;           // Reference to Location asset in Library
  atmosphere: string;
  directingStyle?: string;
  landscapeRefUrl?: string;

  // Content
  storySegment: string; // Portion of story text
  characterIds: string[];
  scenes: StudioScene[];

  // Costumes — per-actor outfit overrides for this sequence
  costumes?: Record<string, { description: string; imageUrl?: string }>;

  // Transition to next sequence
  transitionType?: "fade-to-black" | "visual-transition" | "text-overlay" | "hard-cut";
  transitionText?: string; // e.g., "Drei Tage spaeter..."
}

/** A full screenplay with acts and sequences */
export interface Screenplay {
  title: string;
  acts: {
    name: string;
    sequences: ScreenplaySequence[];
  }[];
  totalScenes: number;
  totalEstimatedDurationSec: number;
}

// ── Character ─────────────────────────────────────────────────────

export interface StudioCharacterDef {
  id: string;
  name: string;
  markerId: string; // "[KODA]"
  description: string;
  personality?: string;
  species?: string;
  role: "lead" | "supporting" | "narrator" | "minor";
  portraitUrl?: string;
  voiceId?: string;
  voiceSettings?: {
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
    use_speaker_boost?: boolean;
  };
  color?: string;
  emoji?: string;
}

// ── Project Status ────────────────────────────────────────────────

export type ProjectStatus =
  | "draft"        // Story eingegeben, nichts generiert
  | "screenplay"   // Drehbuch generiert
  | "characters"   // Charaktere zugewiesen
  | "production"   // Clips werden generiert
  | "completed";   // Film fertig

export type SequenceStatus =
  | "draft"        // Noch nicht angefangen
  | "storyboard"   // Szenen geplant
  | "audio"        // Audio generiert
  | "clips"        // Video-Clips werden generiert
  | "mastered";    // Sequenz gerendert

// ── Rendering Options ─────────────────────────────────────────────

export interface AudioRenderOptions {
  language: string;
  characters: StudioCharacterDef[];
  sfxEnabled: boolean;
  ambienceEnabled: boolean;
}

export interface FilmRenderOptions extends AudioRenderOptions {
  directingStyle: string;
  atmosphere: string;
  quality: "standard" | "premium";
  format: "portrait" | "wide";
}

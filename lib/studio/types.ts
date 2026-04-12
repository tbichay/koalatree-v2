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
  transitionTo?: "cut" | "flow" | "zoom-to-character";

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

  // Production state
  videoUrl?: string;
  clipName?: string;
  status: "pending" | "generating" | "done" | "error";
  quality?: "standard" | "premium";

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

/**
 * Shared UI type definitions for Studio components.
 * ONE place for types used across engine/page.tsx, library/page.tsx, etc.
 */

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost?: boolean;
}

export interface CharacterSheet {
  front?: string;
  profile?: string;
  fullBody?: string;
}

export interface DigitalActor {
  id: string;
  name: string;
  description?: string;
  voiceDescription?: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings | null;
  voicePreviewUrl?: string;
  portraitAssetId?: string;
  style?: string;
  outfit?: string;
  traits?: string;
  characterSheet?: CharacterSheet | null;
  tags: string[];
  createdAt?: string;
  libraryVoiceId?: string;
  libraryVoice?: { name: string };
  _count?: { characters: number };
}

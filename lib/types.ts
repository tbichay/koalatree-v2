// --- Character System ---

export interface CharacterVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number; // 0.7 – 1.2, default 1.0
}

export interface Character {
  id: string;
  name: string;
  species: string;
  role: string;
  description: string;
  color: string;
  emoji: string;
  portrait: string;
  voiceId: string;
  voiceSettings: CharacterVoiceSettings;
}

export const CHARACTERS: Record<string, Character> = {
  koda: {
    id: "koda",
    name: "Koda",
    species: "Koala",
    role: "Der Weise",
    description: "Der weise Erzähler vom KoalaTree — warm, geduldig und voller Liebe",
    color: "#a8d5b8",
    emoji: "🐨",
    portrait: "/koda-portrait.png",
    // Helmut — "Warm, Gentle and Soothing" German voice
    // Fallback: ayE8dwR5j1tan8dAMst0 (alte Koda-Stimme)
    voiceId: process.env.ELEVENLABS_VOICE_KODA || process.env.ELEVENLABS_VOICE_ID || "dFA3XRddYScy6ylAYTIO",
    voiceSettings: {
      stability: 0.50,          // Stable and warm, like a wise grandfather
      similarity_boost: 0.65,   // Some freedom for natural expression
      style: 0.45,              // Moderate style — warm but not theatrical
      use_speaker_boost: true,
      speed: 0.85,              // Slow, deliberate — old and wise, never rushed
    },
  },
  kiki: {
    id: "kiki",
    name: "Kiki",
    species: "Kookaburra",
    role: "Die Lustige",
    description: "Der freche Kookaburra bringt Humor und gute Laune in jede Geschichte",
    color: "#e8c547",
    emoji: "🐦",
    portrait: "/kiki-portrait.png",
    // Lumi — "Playful Cartoon Character Voice" — bright, curious, mischievous
    voiceId: process.env.ELEVENLABS_VOICE_KIKI || "zndmYEEoWWxRYyEL2ZZY",
    voiceSettings: {
      stability: 0.35,            // Low stability = more expressive, playful
      similarity_boost: 0.80,     // Keep the cartoon character consistent
      style: 0.75,                // High style for maximum personality
      use_speaker_boost: true,
      speed: 1.08,                // Fast and excited like a kookaburra
    },
  },
  luna: {
    id: "luna",
    name: "Luna",
    species: "Eule",
    role: "Die Träumerin",
    description: "Die sanfte Traumreisende — führt durch magische Welten zum Einschlafen",
    color: "#b8a9d4",
    emoji: "🦉",
    portrait: "/luna-portrait.png",
    // KoalaTree Luna (Custom) — dreamy, soft, soothing
    voiceId: process.env.ELEVENLABS_VOICE_LUNA || "HVqeRiiDmMNf0O9hGdSN",
    voiceSettings: {
      stability: 0.70,       // Very stable, dreamy, soothing
      similarity_boost: 0.75,
      style: 0.25,           // Subtle, calm style
      use_speaker_boost: true,
      speed: 0.85,           // Dreamlike, slow, soothing
    },
  },
  mika: {
    id: "mika",
    name: "Mika",
    species: "Dingo",
    role: "Der Mutige",
    description: "Der abenteuerlustige Dingo — mutig, wild und immer bereit für Action",
    color: "#d4884a",
    emoji: "🐕",
    portrait: "/mika-portrait.png",
    // Markus — "20 years old, direct, vibrant" — young hero energy
    voiceId: process.env.ELEVENLABS_VOICE_MIKA || "IeQubAjK1ujbppIdhJw4",
    voiceSettings: {
      stability: 0.35,       // Dynamic, energetic delivery
      similarity_boost: 0.75,
      style: 0.60,           // High style for adventure narration
      use_speaker_boost: true,
      speed: 1.10,           // Adventure energy, fast-paced
    },
  },
  pip: {
    id: "pip",
    name: "Pip",
    species: "Schnabeltier",
    role: "Der Entdecker",
    description: "Das neugierige Schnabeltier — fragt, forscht, entdeckt",
    color: "#6bb5c9",
    emoji: "🦫",
    portrait: "/pip-portrait.png",
    // Robert Rabbit — "Bright, lively, curious, upbeat" — curious explorer
    voiceId: process.env.ELEVENLABS_VOICE_PIP || "njAr83fGD1mgwXYCZL48",
    voiceSettings: {
      stability: 0.40,       // Curious, varied intonation — cartoon character
      similarity_boost: 0.80, // Keep the character consistent
      style: 0.65,           // Expressive, wondering, character-like
      use_speaker_boost: true,
      speed: 1.05,           // Curious and bouncy
    },
  },
  sage: {
    id: "sage",
    name: "Sage",
    species: "Wombat",
    role: "Der Stille",
    description: "Der weise Wombat — wenige Worte, tiefe Gedanken",
    color: "#8a9e7a",
    emoji: "🐻",
    portrait: "/sage-portrait.png",
    // Emanuel — "Deep, comforting, relaxing" — young philosopher
    voiceId: process.env.ELEVENLABS_VOICE_SAGE || "umDfZDi2AcMmDUsDsBfA",
    voiceSettings: {
      stability: 0.75,       // Very stable, measured, deliberate
      similarity_boost: 0.80,
      style: 0.20,           // Minimal style, gravitas through simplicity
      use_speaker_boost: true,
      speed: 0.90,           // Deliberate, philosophical
    },
  },
  nuki: {
    id: "nuki",
    name: "Nuki",
    species: "Quokka",
    role: "Der Sonnenschein",
    description: "Das fröhlichste Quokka der Welt — tollpatschig, liebevoll, feiert das Leben",
    color: "#f0b85a",
    emoji: "☀️",
    portrait: "/nuki-portrait.png",
    // Hopsi — "Crazy & Funny Bunny" — playful, cheerful character voice
    voiceId: process.env.ELEVENLABS_VOICE_NUKI || "ygoBNrnmTEdu5NtDTmAY",
    voiceSettings: {
      stability: 0.35,       // Expressive, playful, unpredictable
      similarity_boost: 0.75,
      style: 0.70,           // Lots of character and personality
      use_speaker_boost: true,
      speed: 0.95,           // Slightly leisurely, hakuna matata vibes
    },
  },
};

export interface StorySegment {
  type: "speech" | "sfx" | "ambience";
  characterId?: string;
  sfxPrompt?: string;
  ambiencePrompt?: string;
  text: string;
}

// --- Listener Profile ---

export interface HoererProfil {
  id: string;
  name: string;
  geburtsdatum?: string; // ISO date string
  alter?: number;        // deprecated, berechnet aus geburtsdatum
  geschlecht?: "m" | "w" | "d";
  interessen: string[];
  lieblingsfarbe?: string;
  lieblingstier?: string;
  charaktereigenschaften: string[];
  herausforderungen?: string[];
  tags?: string[];       // Freie Tags
}

// Backwards compatibility
export type KindProfil = HoererProfil;

export type StoryFormat =
  | "traumreise"
  | "fabel"
  | "held"
  | "dankbarkeit"
  | "abenteuer"
  | "meditation"
  | "affirmation"
  | "reflexion"
  | "gutenacht"
  | "podcast"
  | "quatsch"
  | "raetsel"
  | "wissen"
  | "brief"
  | "lebensfreude";

export type PaedagogischesZiel =
  | "selbstbewusstsein"
  | "dankbarkeit"
  | "mut"
  | "empathie"
  | "achtsamkeit"
  | "aengste"
  | "kreativitaet";

export type StoryDauer = "kurz" | "mittel" | "lang";

export interface StoryConfig {
  kindProfilId: string; // bleibt für API-Kompatibilität
  format: StoryFormat;
  ziel: PaedagogischesZiel;
  dauer: StoryDauer;
  besonderesThema?: string;
}

export interface Geschichte {
  id: string;
  config: StoryConfig;
  kindName: string;
  text: string;
  audioUrl?: string;
  erstelltAm: string;
}

export interface StoryFormatInfo {
  label: string;
  beschreibung: string;
  emoji: string;
  minAlter: number;
  maxAlter: number;
  koala?: string; // welcher Koala erzählt
}

export const STORY_FORMATE: Record<StoryFormat, StoryFormatInfo> = {
  traumreise: {
    label: "Traumreise",
    beschreibung: "Eine sanfte Reise durch magische Welten zum Einschlafen",
    emoji: "🌿",
    minAlter: 2,
    maxAlter: 99,
    koala: "Luna",
  },
  fabel: {
    label: "Weisheitsgeschichte",
    beschreibung: "Koda erzählt eine Geschichte, die er selbst erlebt hat",
    emoji: "🦉",
    minAlter: 3,
    maxAlter: 99,
    koala: "Koda",
  },
  held: {
    label: "Dein Abenteuer",
    beschreibung: "Du bist der Held — Koda erzählt deine Geschichte",
    emoji: "🌟",
    minAlter: 4,
    maxAlter: 99,
    koala: "Koda",
  },
  dankbarkeit: {
    label: "Dankbarkeits-Moment",
    beschreibung: "Gemeinsam auf den Tag zurückblicken und dankbar sein",
    emoji: "🍃",
    minAlter: 3,
    maxAlter: 99,
    koala: "Koda",
  },
  abenteuer: {
    label: "Mutiges Abenteuer",
    beschreibung: "Eine spannende Geschichte voller Herausforderungen mit Mika",
    emoji: "⚔️",
    minAlter: 4,
    maxAlter: 99,
    koala: "Mika",
  },
  meditation: {
    label: "Geführte Meditation",
    beschreibung: "Luna führt dich durch eine tiefe, beruhigende Meditation",
    emoji: "🧘",
    minAlter: 8,
    maxAlter: 99,
    koala: "Luna",
  },
  affirmation: {
    label: "Positive Affirmationen",
    beschreibung: "Stärkende Botschaften, verpackt in eine kurze Geschichte",
    emoji: "✨",
    minAlter: 5,
    maxAlter: 99,
    koala: "Koda",
  },
  reflexion: {
    label: "Stille Reflexion",
    beschreibung: "Sage lädt ein zum Nachdenken über die wichtigen Dinge im Leben",
    emoji: "🪷",
    minAlter: 13,
    maxAlter: 99,
    koala: "Sage",
  },
  gutenacht: {
    label: "Gute-Nacht-Geschichte",
    beschreibung: "Eine klassische Geschichte zum Einschlafen — einfach schön und geborgen",
    emoji: "📖",
    minAlter: 2,
    maxAlter: 99,
    koala: "Koda",
  },
  podcast: {
    label: "Perspektiven-Podcast",
    beschreibung: "Koda moderiert eine Diskussion — verschiedene Charaktere, verschiedene Sichtweisen",
    emoji: "🎙️",
    minAlter: 3,
    maxAlter: 99,
    koala: "Koda",
  },
  quatsch: {
    label: "Quatschgeschichte",
    beschreibung: "Kiki übernimmt — absurder Humor, alles geht wunderbar schief!",
    emoji: "😂",
    minAlter: 3,
    maxAlter: 99,
    koala: "Kiki",
  },
  raetsel: {
    label: "Rätsel-Abenteuer",
    beschreibung: "Pip entdeckt ein Geheimnis — kannst du es lösen?",
    emoji: "🔍",
    minAlter: 4,
    maxAlter: 99,
    koala: "Pip",
  },
  wissen: {
    label: "Wissensreise",
    beschreibung: "Echtes Wissen verpackt in ein Abenteuer — Pip erklärt die Welt",
    emoji: "🌍",
    minAlter: 4,
    maxAlter: 99,
    koala: "Pip",
  },
  brief: {
    label: "Brief von Koda",
    beschreibung: "Ein persönlicher, warmherziger Brief nur für dich",
    emoji: "💌",
    minAlter: 3,
    maxAlter: 99,
    koala: "Koda",
  },
  lebensfreude: {
    label: "Lebensfreude-Moment",
    beschreibung: "Nuki zeigt dir, wie schön das Leben ist — mit Humor und Herz",
    emoji: "☀️",
    minAlter: 3,
    maxAlter: 99,
    koala: "Nuki",
  },
};

/**
 * Gibt Story-Formate zurück, die für ein bestimmtes Alter passend sind.
 */
export function getFormateForAlter(alter: number): Partial<Record<StoryFormat, StoryFormatInfo>> {
  const result: Partial<Record<StoryFormat, StoryFormatInfo>> = {};
  for (const [key, value] of Object.entries(STORY_FORMATE)) {
    if (alter >= value.minAlter && alter <= value.maxAlter) {
      result[key as StoryFormat] = value;
    }
  }
  return result;
}

export const PAEDAGOGISCHE_ZIELE: Record<PaedagogischesZiel, { label: string; beschreibung: string; emoji: string }> = {
  selbstbewusstsein: {
    label: "Selbstbewusstsein",
    beschreibung: "Stärkt den Glauben an die eigenen Fähigkeiten",
    emoji: "💪",
  },
  dankbarkeit: {
    label: "Dankbarkeit",
    beschreibung: "Fördert Zufriedenheit und Wertschätzung",
    emoji: "🌻",
  },
  mut: {
    label: "Mut & Resilienz",
    beschreibung: "Hilft, Herausforderungen mit Zuversicht zu begegnen",
    emoji: "🦁",
  },
  empathie: {
    label: "Empathie",
    beschreibung: "Fördert Mitgefühl und Freundlichkeit",
    emoji: "💕",
  },
  achtsamkeit: {
    label: "Achtsamkeit",
    beschreibung: "Bringt innere Ruhe und Gelassenheit",
    emoji: "🧘",
  },
  aengste: {
    label: "Umgang mit Ängsten",
    beschreibung: "Hilft, Ängste sanft zu überwinden",
    emoji: "🌈",
  },
  kreativitaet: {
    label: "Kreativität",
    beschreibung: "Weckt Vorstellungskraft und Fantasie",
    emoji: "🎨",
  },
};

export const DAUER_OPTIONEN: Record<StoryDauer, { label: string; minuten: number }> = {
  kurz: { label: "Kurz (~5 Min)", minuten: 5 },
  mittel: { label: "Mittel (~10 Min)", minuten: 10 },
  lang: { label: "Lang (~15 Min)", minuten: 15 },
};

// DEPRECATED — Use getInteressenFuerAlter() from lib/utils.ts instead
export const INTERESSEN_VORSCHLAEGE = [
  "Dinosaurier", "Weltraum", "Tiere", "Prinzessinnen", "Ritter",
  "Meerjungfrauen", "Superhelden", "Natur & Wald", "Ozean & Meer",
  "Magie & Zauberei", "Musik", "Sport", "Fahrzeuge",
  "Kochen & Backen", "Bauen & Konstruieren",
];

// DEPRECATED — Use getCharakterFuerAlter() from lib/utils.ts instead
export const CHARAKTER_VORSCHLAEGE = [
  "neugierig", "schüchtern", "mutig", "kreativ", "energisch",
  "sensibel", "lustig", "nachdenklich", "hilfsbereit", "abenteuerlustig",
];

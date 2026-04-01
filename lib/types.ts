export interface KindProfil {
  id: string;
  name: string;
  alter: number;
  geschlecht?: "m" | "w" | "d";
  interessen: string[];
  lieblingsfarbe?: string;
  lieblingstier?: string;
  charaktereigenschaften: string[];
  herausforderungen?: string[];
}

export type StoryFormat = "traumreise" | "fabel" | "held" | "dankbarkeit";

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
  kindProfilId: string;
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

export const STORY_FORMATE: Record<StoryFormat, { label: string; beschreibung: string; emoji: string }> = {
  traumreise: {
    label: "Meditative Traumreise",
    beschreibung: "Eine geführte Meditation verpackt als magisches Abenteuer",
    emoji: "🌙",
  },
  fabel: {
    label: "Philosophische Fabel",
    beschreibung: "Eine Tiergeschichte mit tiefgründiger Botschaft",
    emoji: "🦊",
  },
  held: {
    label: "Magische Ich-Geschichte",
    beschreibung: "Dein Kind wird zum Helden seiner eigenen Geschichte",
    emoji: "⭐",
  },
  dankbarkeit: {
    label: "Dankbarkeits-Ritual",
    beschreibung: "Eine Geschichte die in eine Dankbarkeitsübung mündet",
    emoji: "🙏",
  },
};

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

export const INTERESSEN_VORSCHLAEGE = [
  "Dinosaurier",
  "Weltraum",
  "Tiere",
  "Prinzessinnen",
  "Ritter",
  "Meerjungfrauen",
  "Superhelden",
  "Natur & Wald",
  "Ozean & Meer",
  "Magie & Zauberei",
  "Musik",
  "Sport",
  "Fahrzeuge",
  "Kochen & Backen",
  "Bauen & Konstruieren",
];

export const CHARAKTER_VORSCHLAEGE = [
  "neugierig",
  "schüchtern",
  "mutig",
  "kreativ",
  "energisch",
  "sensibel",
  "lustig",
  "nachdenklich",
  "hilfsbereit",
  "abenteuerlustig",
];

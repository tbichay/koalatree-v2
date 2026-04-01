"use client";

import { useState } from "react";
import {
  StoryConfig,
  StoryFormat,
  PaedagogischesZiel,
  StoryDauer,
  STORY_FORMATE,
  PAEDAGOGISCHE_ZIELE,
  DAUER_OPTIONEN,
} from "@/lib/types";

interface Props {
  kindProfilId: string;
  kindName: string;
  onGenerate: (config: StoryConfig) => void;
}

export default function StoryConfigurator({ kindProfilId, kindName, onGenerate }: Props) {
  const [format, setFormat] = useState<StoryFormat | null>(null);
  const [ziel, setZiel] = useState<PaedagogischesZiel | null>(null);
  const [dauer, setDauer] = useState<StoryDauer>("mittel");
  const [besonderesThema, setBesonderesThema] = useState("");

  const canGenerate = format && ziel;

  const handleGenerate = () => {
    if (!format || !ziel) return;
    onGenerate({
      kindProfilId,
      format,
      ziel,
      dauer,
      besonderesThema: besonderesThema || undefined,
    });
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">
          Geschichte für {kindName}
        </h1>
        <p className="text-white/60">Wähle aus, was für eine Geschichte heute Nacht erzählt werden soll.</p>
      </div>

      {/* Format */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Art der Geschichte</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(STORY_FORMATE) as [StoryFormat, typeof STORY_FORMATE[StoryFormat]][]).map(
            ([key, value]) => (
              <button
                key={key}
                className={`card p-4 text-left ${format === key ? "card-selected" : ""}`}
                onClick={() => setFormat(key)}
              >
                <div className="text-2xl mb-1">{value.emoji}</div>
                <div className="font-semibold">{value.label}</div>
                <div className="text-sm text-white/50 mt-1">{value.beschreibung}</div>
              </button>
            )
          )}
        </div>
      </div>

      {/* Ziel */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Pädagogisches Ziel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(PAEDAGOGISCHE_ZIELE) as [PaedagogischesZiel, typeof PAEDAGOGISCHE_ZIELE[PaedagogischesZiel]][]).map(
            ([key, value]) => (
              <button
                key={key}
                className={`card p-4 text-left ${ziel === key ? "card-selected" : ""}`}
                onClick={() => setZiel(key)}
              >
                <span className="text-xl mr-2">{value.emoji}</span>
                <span className="font-semibold">{value.label}</span>
                <div className="text-sm text-white/50 mt-1">{value.beschreibung}</div>
              </button>
            )
          )}
        </div>
      </div>

      {/* Dauer */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Dauer</h2>
        <div className="flex gap-3">
          {(Object.entries(DAUER_OPTIONEN) as [StoryDauer, typeof DAUER_OPTIONEN[StoryDauer]][]).map(
            ([key, value]) => (
              <button
                key={key}
                className={`chip flex-1 justify-center ${dauer === key ? "chip-selected" : ""}`}
                onClick={() => setDauer(key)}
              >
                {value.label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Besonderes Thema */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Besonderer Anlass (optional)</h2>
        <input
          type="text"
          value={besonderesThema}
          onChange={(e) => setBesonderesThema(e.target.value)}
          placeholder="z.B. Erster Schultag, Umzug, Geschwisterchen..."
        />
      </div>

      {/* Generate Button */}
      <div className="text-center pt-4">
        <button
          className="btn-primary text-lg px-8 py-3"
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          Geschichte erzeugen ✨
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  StoryConfig,
  StoryFormat,
  PaedagogischesZiel,
  StoryDauer,
  StoryFormatInfo,
  PAEDAGOGISCHE_ZIELE,
  DAUER_OPTIONEN,
  getFormateForAlter,
} from "@/lib/types";
import HelpAudio from "./HelpAudio";

interface Props {
  kindProfilId: string;
  kindName: string;
  alter?: number;
  onGenerate: (config: StoryConfig) => void;
}

export default function StoryConfigurator({ kindProfilId, kindName, alter = 5, onGenerate }: Props) {
  const [format, setFormat] = useState<StoryFormat | null>(null);
  const [ziel, setZiel] = useState<PaedagogischesZiel | null>(null);
  const [dauer, setDauer] = useState<StoryDauer>("mittel");
  const [besonderesThema, setBesonderesThema] = useState("");

  const verfuegbareFormate = getFormateForAlter(alter);
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
        <div className="text-4xl mb-2">🐨</div>
        <h1 className="text-3xl font-bold mb-2">
          Geschichte für {kindName}
        </h1>
        <p className="text-white/60">
          {alter >= 18
            ? "Was soll Koda heute für dich erzählen?"
            : "Was soll Koda heute Nacht erzählen?"}
        </p>
        {alter > 0 && (
          <p className="text-xs text-[#d4a853] mt-1">
            {Object.keys(verfuegbareFormate).length} Formate verfügbar für {alter} Jahre
          </p>
        )}
      </div>

      {/* Format */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">Art der Geschichte <HelpAudio clipId="story-format" /></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(verfuegbareFormate) as [StoryFormat, StoryFormatInfo][]).map(
            ([key, value]) => (
              <button
                key={key}
                className={`card p-4 text-left ${format === key ? "card-selected" : ""}`}
                onClick={() => setFormat(key)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xl mb-1">{value.emoji}</div>
                    <div className="font-semibold">{value.label}</div>
                  </div>
                  {value.koala && (
                    <span className="text-xs text-white/30 bg-white/5 rounded-full px-2 py-0.5">
                      {value.koala}
                    </span>
                  )}
                </div>
                <div className="text-sm text-white/50 mt-1">{value.beschreibung}</div>
              </button>
            )
          )}
        </div>
      </div>

      {/* Ziel */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          {alter >= 18 ? "Fokus" : "Pädagogisches Ziel"} <HelpAudio clipId="story-ziel" />
        </h2>
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
        <h2 className="text-lg font-semibold mb-2">Worum soll es gehen? (optional)</h2>
        <input
          type="text"
          value={besonderesThema}
          onChange={(e) => setBesonderesThema(e.target.value)}
          placeholder={
            alter >= 18
              ? "z.B. Stress loslassen, neue Perspektive, innere Ruhe..."
              : "z.B. Erster Schultag, Streit mit Freund, neues Geschwisterchen..."
          }
        />
        <p className="text-xs text-white/30 mt-1">Koda merkt sich das für zukünftige Geschichten</p>
      </div>

      {/* Generate Button */}
      <div className="text-center pt-4">
        <button
          className="btn-primary text-lg px-8 py-3"
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          Koda soll erzählen 🐨
        </button>
      </div>
    </div>
  );
}

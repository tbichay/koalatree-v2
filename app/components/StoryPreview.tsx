"use client";

import { parseForDisplay } from "@/lib/story-parser";
import { CHARACTERS } from "@/lib/types";

interface Props {
  text: string;
}

export default function StoryPreview({ text }: Props) {
  const hasMultiVoice = /\[(KODA|KIKI|LUNA|MIKA|PIP|SAGE|NUKI)\]/.test(text);

  if (!hasMultiVoice) {
    // Legacy: einfache Textanzeige
    const cleanText = text
      .replace(/\[ATEMPAUSE\]/g, "\n\n")
      .replace(/\[PAUSE\]/g, "\n\n")
      .replace(/\[LANGSAM\]/g, "")
      .replace(/\[DANKBARKEIT\]/g, "");

    return (
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white/70">Geschichte (Textvorschau)</h3>
        </div>
        <div className="prose prose-invert max-w-none">
          {cleanText.split("\n\n").map((paragraph, i) => (
            <p key={i} className="text-white/80 leading-relaxed mb-3 text-[0.95rem]">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // Multi-Voice: Charakter-zugeordnete Anzeige
  const segments = parseForDisplay(text);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white/70">Geschichte (Textvorschau)</h3>
        <span className="text-xs text-white/30">Multi-Voice</span>
      </div>
      <div className="space-y-3">
        {segments.map((segment, i) => {
          if (segment.type === "pause") {
            return (
              <div key={i} className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/20 text-xs">Pause</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            );
          }

          if (segment.type === "sfx") {
            return (
              <div key={i} className="flex items-center gap-2 py-1 px-3">
                <span className="text-xs bg-white/5 text-white/40 rounded-full px-3 py-1">
                  SFX: {segment.text}
                </span>
              </div>
            );
          }

          // Speech segment
          const character = segment.characterId ? CHARACTERS[segment.characterId] : null;
          const borderColor = character?.color || "#a8d5b8";
          const charName = character?.name || "Koda";
          const charEmoji = character?.emoji || "";

          return (
            <div
              key={i}
              className="pl-4 py-2 rounded-r-lg"
              style={{ borderLeft: `3px solid ${borderColor}` }}
            >
              <span
                className="text-xs font-medium mb-1 block"
                style={{ color: borderColor }}
              >
                {charEmoji} {charName}
              </span>
              <p className="text-white/80 leading-relaxed text-[0.95rem]">
                {segment.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

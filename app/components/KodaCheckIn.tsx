"use client";

import { useState, KeyboardEvent } from "react";
import Image from "next/image";
import { HoererProfil } from "@/lib/types";
import { berechneAlter, getInteressenFuerAlter, getCharakterFuerAlter } from "@/lib/utils";
import { getHerausforderungenFuerAlter } from "@/lib/challenge-suggestions";
import { CheckInReason, getCheckInMessage } from "@/lib/check-in-triggers";

interface Props {
  profil: HoererProfil;
  reason: CheckInReason;
  onSave: (updates: Partial<HoererProfil>) => Promise<void>;
  onDismiss: () => void;
}

interface CategoryState {
  interessen: string[];
  charaktereigenschaften: string[];
  herausforderungen: string[];
  tags: string[];
}

export default function KodaCheckIn({ profil, reason, onSave, onDismiss }: Props) {
  const alter = profil.geburtsdatum ? berechneAlter(profil.geburtsdatum) : 5;

  const [state, setState] = useState<CategoryState>({
    interessen: [...profil.interessen],
    charaktereigenschaften: [...profil.charaktereigenschaften],
    herausforderungen: [...(profil.herausforderungen || [])],
    tags: [...(profil.tags || [])],
  });

  const [expandedCategory, setExpandedCategory] = useState<keyof CategoryState | null>(
    reason === "first-visit" ? "interessen" : null
  );
  const [inputs, setInputs] = useState({ interessen: "", charaktereigenschaften: "", herausforderungen: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const suggestions: Record<keyof CategoryState, string[]> = {
    interessen: getInteressenFuerAlter(alter),
    charaktereigenschaften: getCharakterFuerAlter(alter),
    herausforderungen: getHerausforderungenFuerAlter(alter),
    tags: [],
  };

  const labels: Record<keyof CategoryState, { emoji: string; title: string; placeholder: string }> = {
    interessen: { emoji: "⭐", title: "Interessen", placeholder: "Eigenes Interesse..." },
    charaktereigenschaften: { emoji: "💪", title: "So bin ich", placeholder: "Eigene Eigenschaft..." },
    herausforderungen: { emoji: "🌱", title: "Aktuelle Themen", placeholder: "Aktuelles Thema..." },
    tags: { emoji: "🏷️", title: "Sonstiges", placeholder: "Freier Tag..." },
  };

  const toggle = (category: keyof CategoryState, item: string) => {
    setState((prev) => {
      const list = prev[category];
      return {
        ...prev,
        [category]: list.includes(item) ? list.filter((i) => i !== item) : [...list, item],
      };
    });
  };

  const addCustom = (category: keyof CategoryState) => {
    const value = inputs[category].trim();
    if (value && !state[category].includes(value)) {
      setState((prev) => ({ ...prev, [category]: [...prev[category], value] }));
    }
    setInputs((prev) => ({ ...prev, [category]: "" }));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, category: keyof CategoryState) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom(category);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      interessen: state.interessen,
      charaktereigenschaften: state.charaktereigenschaften,
      herausforderungen: state.herausforderungen.length > 0 ? state.herausforderungen : undefined,
      tags: state.tags.length > 0 ? state.tags : undefined,
    });
    setSaving(false);
  };

  const hasChanges =
    JSON.stringify(state.interessen) !== JSON.stringify(profil.interessen) ||
    JSON.stringify(state.charaktereigenschaften) !== JSON.stringify(profil.charaktereigenschaften) ||
    JSON.stringify(state.herausforderungen) !== JSON.stringify(profil.herausforderungen || []) ||
    JSON.stringify(state.tags) !== JSON.stringify(profil.tags || []);

  const message = getCheckInMessage(reason, profil.name, alter);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#2a4a2a]/60 to-[#1a3a2a]/60 border border-[#4a7c59]/30 overflow-hidden">
      {/* Koda speech bubble */}
      <div className="p-5 flex gap-4">
        <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 float">
          <Image src="/api/images/koda-portrait.png" alt="Koda" width={56} height={56} className="object-cover" unoptimized />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 leading-relaxed">{message}</p>
          <p className="text-[10px] text-white/30 mt-1">Koda merkt sich alles für bessere Geschichten</p>
        </div>
        <button
          className="text-white/20 hover:text-white/40 transition-colors text-xs self-start shrink-0"
          onClick={onDismiss}
        >
          Später
        </button>
      </div>

      {/* Tag categories */}
      <div className="px-5 pb-5 space-y-2">
        {(Object.keys(labels) as (keyof CategoryState)[]).map((category) => {
          const label = labels[category];
          const isExpanded = expandedCategory === category;
          const items = state[category];
          const categorysuggestions = suggestions[category];

          return (
            <div key={category} className="rounded-xl bg-white/5 overflow-hidden">
              {/* Category header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                onClick={() => setExpandedCategory(isExpanded ? null : category)}
              >
                <span className="text-base">{label.emoji}</span>
                <span className="text-sm text-white/70 font-medium flex-1">{label.title}</span>
                {items.length > 0 && (
                  <span className="text-[10px] text-white/30 bg-white/10 rounded-full px-1.5 py-0.5">
                    {items.length}
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded: tags + suggestions */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Active tags */}
                  {items.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <button
                          key={item}
                          className="text-xs bg-[#3d6b4a]/30 text-[#a8d5b8] rounded-full px-2.5 py-1 flex items-center gap-1 hover:bg-[#3d6b4a]/50 transition-colors"
                          onClick={() => toggle(category, item)}
                        >
                          {item}
                          <span className="text-[#a8d5b8]/50 hover:text-red-400 ml-0.5">✕</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Suggestions */}
                  {categorysuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {categorysuggestions
                        .filter((s) => !items.includes(s))
                        .map((suggestion) => (
                          <button
                            key={suggestion}
                            className="text-xs bg-white/5 text-white/40 rounded-full px-2.5 py-1 hover:bg-white/10 hover:text-white/60 transition-colors"
                            onClick={() => toggle(category, suggestion)}
                          >
                            + {suggestion}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Custom input */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={inputs[category]}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [category]: e.target.value }))}
                      onKeyDown={(e) => handleKeyDown(e, category)}
                      placeholder={label.placeholder}
                      className="flex-1 text-xs !py-1.5 !px-2.5 bg-white/5 border-white/10"
                    />
                    {inputs[category].trim() && (
                      <button
                        className="text-xs bg-[#3d6b4a]/30 text-[#a8d5b8] rounded-lg px-2.5 hover:bg-[#3d6b4a]/50 transition-colors"
                        onClick={() => addCustom(category)}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Collapsed: show preview chips */}
              {!isExpanded && items.length > 0 && (
                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {items.slice(0, 4).map((item) => (
                    <span key={item} className="text-[10px] bg-white/5 text-white/30 rounded-full px-2 py-0.5">
                      {item}
                    </span>
                  ))}
                  {items.length > 4 && (
                    <span className="text-[10px] text-white/20">+{items.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Save button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-white/20">
            {hasChanges ? "Änderungen nicht gespeichert" : "Alles aktuell"}
          </p>
          <button
            className="btn-primary text-sm px-6 py-2 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? "Speichern..." : "Fertig"}
          </button>
        </div>
      </div>
    </div>
  );
}

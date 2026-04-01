"use client";

import { useState } from "react";
import { KindProfil, INTERESSEN_VORSCHLAEGE, CHARAKTER_VORSCHLAEGE } from "@/lib/types";

interface Props {
  onSave: (profil: KindProfil) => void;
  initial?: KindProfil;
}

export default function ProfilForm({ onSave, initial }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name || "");
  const [alter, setAlter] = useState(initial?.alter || 5);
  const [geschlecht, setGeschlecht] = useState<"m" | "w" | "d" | undefined>(initial?.geschlecht);
  const [interessen, setInteressen] = useState<string[]>(initial?.interessen || []);
  const [lieblingsfarbe, setLieblingsfarbe] = useState(initial?.lieblingsfarbe || "");
  const [lieblingstier, setLieblingstier] = useState(initial?.lieblingstier || "");
  const [charakter, setCharakter] = useState<string[]>(initial?.charaktereigenschaften || []);
  const [herausforderungen, setHerausforderungen] = useState(initial?.herausforderungen?.join(", ") || "");

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const handleSubmit = () => {
    const profil: KindProfil = {
      id: initial?.id || crypto.randomUUID(),
      name,
      alter,
      geschlecht,
      interessen,
      lieblingsfarbe: lieblingsfarbe || undefined,
      lieblingstier: lieblingstier || undefined,
      charaktereigenschaften: charakter,
      herausforderungen: herausforderungen ? herausforderungen.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    };
    onSave(profil);
  };

  const steps = [
    // Step 0: Name & Alter
    <div key="basics" className="space-y-6">
      <h2 className="text-2xl font-bold text-center mb-2">Erzähl uns von deinem Kind</h2>
      <p className="text-center text-white/60 mb-6">Wir erstellen ein Profil, damit jede Geschichte persönlich wird.</p>
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Wie heißt dein Kind?</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name eingeben..."
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Wie alt ist dein Kind?</label>
        <input
          type="number"
          value={alter}
          onChange={(e) => setAlter(Number(e.target.value))}
          min={2}
          max={12}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Geschlecht (optional)</label>
        <div className="flex gap-3">
          {([["m", "Junge"], ["w", "Mädchen"], ["d", "Divers"]] as const).map(([value, label]) => (
            <button
              key={value}
              className={`chip ${geschlecht === value ? "chip-selected" : ""}`}
              onClick={() => setGeschlecht(geschlecht === value ? undefined : value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 1: Interessen
    <div key="interessen" className="space-y-6">
      <h2 className="text-2xl font-bold text-center mb-2">Was liebt {name || "dein Kind"}?</h2>
      <p className="text-center text-white/60 mb-6">Wähle Interessen aus — sie werden Teil der Geschichte.</p>
      <div className="flex flex-wrap gap-2">
        {INTERESSEN_VORSCHLAEGE.map((interesse) => (
          <button
            key={interesse}
            className={`chip ${interessen.includes(interesse) ? "chip-selected" : ""}`}
            onClick={() => toggleItem(interessen, setInteressen, interesse)}
          >
            {interesse}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">Lieblingstier</label>
          <input
            type="text"
            value={lieblingstier}
            onChange={(e) => setLieblingstier(e.target.value)}
            placeholder="z.B. Katze, Drache..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">Lieblingsfarbe</label>
          <input
            type="text"
            value={lieblingsfarbe}
            onChange={(e) => setLieblingsfarbe(e.target.value)}
            placeholder="z.B. Blau, Gold..."
          />
        </div>
      </div>
    </div>,

    // Step 2: Charakter
    <div key="charakter" className="space-y-6">
      <h2 className="text-2xl font-bold text-center mb-2">Wie ist {name || "dein Kind"}?</h2>
      <p className="text-center text-white/60 mb-6">Diese Eigenschaften helfen uns, die Geschichte anzupassen.</p>
      <div className="flex flex-wrap gap-2">
        {CHARAKTER_VORSCHLAEGE.map((eigenschaft) => (
          <button
            key={eigenschaft}
            className={`chip ${charakter.includes(eigenschaft) ? "chip-selected" : ""}`}
            onClick={() => toggleItem(charakter, setCharakter, eigenschaft)}
          >
            {eigenschaft}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-white/70 mb-1">
          Aktuelle Herausforderungen (optional)
        </label>
        <input
          type="text"
          value={herausforderungen}
          onChange={(e) => setHerausforderungen(e.target.value)}
          placeholder="z.B. Einschulung, neues Geschwisterchen..."
        />
        <p className="text-xs text-white/40 mt-1">Kommagetrennt — hilft uns, die Geschichte einfühlsam zu gestalten</p>
      </div>
    </div>,
  ];

  const canProceed = step === 0 ? name.trim().length > 0 : true;

  return (
    <div className="card p-8 max-w-lg mx-auto">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-6">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              i === step ? "bg-indigo-400 scale-125" : i < step ? "bg-indigo-400/50" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      {steps[step]}

      <div className="flex justify-between mt-8">
        {step > 0 ? (
          <button className="chip" onClick={() => setStep(step - 1)}>
            Zurück
          </button>
        ) : (
          <div />
        )}
        {step < steps.length - 1 ? (
          <button
            className="btn-primary"
            disabled={!canProceed}
            onClick={() => setStep(step + 1)}
          >
            Weiter
          </button>
        ) : (
          <button className="btn-primary" onClick={handleSubmit}>
            Profil speichern
          </button>
        )}
      </div>
    </div>
  );
}

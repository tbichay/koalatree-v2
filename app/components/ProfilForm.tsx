"use client";

import { useState } from "react";
import { HoererProfil } from "@/lib/types";
import { berechneAlter } from "@/lib/utils";

interface Props {
  onSave: (profil: HoererProfil) => void;
  initial?: HoererProfil;
}

/**
 * Simplified profile form — identity fields only (name, birthday, gender).
 * All tag-based fields (interests, character, challenges, tags) are managed
 * through the KodaCheckIn component on the dashboard.
 */
export default function ProfilForm({ onSave, initial }: Props) {
  const [name, setName] = useState(initial?.name || "");
  const [geburtsdatum, setGeburtsdatum] = useState(
    initial?.geburtsdatum ? initial.geburtsdatum.split("T")[0] : ""
  );
  const [geschlecht, setGeschlecht] = useState<"m" | "w" | "d" | undefined>(initial?.geschlecht);

  const alter = geburtsdatum ? berechneAlter(geburtsdatum) : 0;

  const handleSubmit = () => {
    const profil: HoererProfil = {
      id: initial?.id || crypto.randomUUID(),
      name,
      geburtsdatum: geburtsdatum ? new Date(geburtsdatum).toISOString() : undefined,
      alter: geburtsdatum ? berechneAlter(geburtsdatum) : undefined,
      geschlecht,
      // Preserve existing tag data on edit, empty on create
      interessen: initial?.interessen || [],
      charaktereigenschaften: initial?.charaktereigenschaften || [],
      herausforderungen: initial?.herausforderungen,
      tags: initial?.tags,
      // Deprecated fields — preserve if editing, don't set on create
      lieblingsfarbe: initial?.lieblingsfarbe,
      lieblingstier: initial?.lieblingstier,
    };
    onSave(profil);
  };

  const isValid = name.trim().length > 0;

  return (
    <div className="card p-8 max-w-lg mx-auto">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-center mb-2">
          {initial ? `${name || "Profil"} bearbeiten` : "Neues Profil erstellen"}
        </h2>
        <p className="text-center text-white/60 mb-6">
          {initial
            ? "Name und Geburtsdatum anpassen"
            : alter >= 18
            ? "Erzähl Koda von dir — den Rest fragt er gleich selbst."
            : "Erzähl Koda, für wen die Geschichten sind — den Rest fragt er gleich selbst."}
        </p>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name eingeben..."
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">Geburtsdatum</label>
          <input
            type="date"
            value={geburtsdatum}
            onChange={(e) => setGeburtsdatum(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            className="w-full"
          />
          {geburtsdatum && (
            <p className="text-xs text-[#d4a853] mt-1">
              {alter} Jahre — Geschichten und Vorschläge werden automatisch angepasst
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">Geschlecht (optional)</label>
          <div className="flex gap-3">
            {([["m", "Männlich"], ["w", "Weiblich"], ["d", "Divers"]] as const).map(([value, label]) => (
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
      </div>

      <div className="flex justify-end mt-8">
        <button className="btn-primary" disabled={!isValid} onClick={handleSubmit}>
          {initial ? "Speichern" : "Profil erstellen"}
        </button>
      </div>
    </div>
  );
}

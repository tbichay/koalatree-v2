"use client";

import { KindProfil } from "@/lib/types";

interface Props {
  profil: KindProfil;
  onSelect: (profil: KindProfil) => void;
  onDelete: (id: string) => void;
}

export default function ProfilCard({ profil, onSelect, onDelete }: Props) {
  return (
    <div className="card p-5 cursor-pointer group" onClick={() => onSelect(profil)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-2xl">
            {profil.geschlecht === "w" ? "👧" : profil.geschlecht === "m" ? "👦" : "🧒"}
          </div>
          <div>
            <h3 className="font-bold text-lg">{profil.name}</h3>
            <p className="text-white/50 text-sm">{profil.alter} Jahre</p>
          </div>
        </div>
        <button
          className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all text-sm p-1"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(profil.id);
          }}
          title="Profil löschen"
        >
          ✕
        </button>
      </div>
      {profil.interessen.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {profil.interessen.slice(0, 4).map((i) => (
            <span key={i} className="text-xs bg-white/10 rounded-full px-2 py-0.5 text-white/60">
              {i}
            </span>
          ))}
          {profil.interessen.length > 4 && (
            <span className="text-xs text-white/40">+{profil.interessen.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

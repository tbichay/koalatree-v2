"use client";

import { useState } from "react";
import { HoererProfil } from "@/lib/types";
import { berechneAlter } from "@/lib/utils";
import AvatarUpload from "./AvatarUpload";

interface Props {
  profil: HoererProfil;
  onSelect: (profil: HoererProfil) => void;
  onDelete: (id: string) => void;
  onEdit?: (profil: HoererProfil) => void;
  onHistory?: (profil: HoererProfil) => void;
  onCheckIn?: (profil: HoererProfil) => void;
  onAvatarChange?: (profilId: string, avatarUrl: string | null) => void;
}

export default function ProfilCard({ profil, onSelect, onDelete, onEdit, onHistory, onCheckIn, onAvatarChange }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(profil.avatarUrl);
  const alter = profil.geburtsdatum
    ? berechneAlter(profil.geburtsdatum)
    : profil.alter ?? 0;

  const tagCount = profil.interessen.length
    + (profil.charaktereigenschaften?.length ?? 0)
    + (profil.herausforderungen?.length ?? 0)
    + (profil.tags?.length ?? 0);

  return (
    <div className="card p-5 cursor-pointer group" onClick={() => onSelect(profil)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div onClick={(e) => e.stopPropagation()}>
            <AvatarUpload
              currentImage={avatarUrl}
              fallback={<span className="text-xl">{profil.geschlecht === "w" ? "👧" : profil.geschlecht === "m" ? "👦" : alter >= 18 ? "🧑" : "🧒"}</span>}
              size={48}
              onUpload={async (blob) => {
                const formData = new FormData();
                formData.append("file", blob, "avatar.png");
                formData.append("type", "profile");
                formData.append("id", profil.id);
                const res = await fetch("/api/avatars/upload", { method: "POST", body: formData });
                const data = await res.json();
                if (data.url) {
                  const freshUrl = data.url + '?t=' + Date.now();
                  setAvatarUrl(freshUrl);
                  onAvatarChange?.(profil.id, freshUrl);
                } else {
                  throw new Error(data.error || "Upload fehlgeschlagen");
                }
              }}
              onRemove={async () => {
                await fetch("/api/avatars/upload", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "profile", id: profil.id }),
                });
                setAvatarUrl(undefined);
                onAvatarChange?.(profil.id, null);
              }}
            />
          </div>
          <div>
            <h3 className="font-bold text-lg">{profil.name}</h3>
            <p className="text-white/50 text-sm">{alter} Jahre</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-all">
          {onCheckIn && (
            <button
              className="text-white/50 hover:text-[#a8d5b8] text-sm p-1 transition-colors"
              onClick={(e) => { e.stopPropagation(); onCheckIn(profil); }}
              title="Interessen & Tags bearbeiten"
            >
              🏷️
            </button>
          )}
          {onHistory && (
            <button
              className="text-white/50 hover:text-[#d4a853] text-sm p-1 transition-colors"
              onClick={(e) => { e.stopPropagation(); onHistory(profil); }}
              title="Entwicklung ansehen"
            >
              🌱
            </button>
          )}
          {onEdit && (
            <button
              className="text-white/50 hover:text-white/80 text-sm p-1 transition-colors"
              onClick={(e) => { e.stopPropagation(); onEdit(profil); }}
              title="Name & Geburtsdatum bearbeiten"
            >
              ✏️
            </button>
          )}
          <button
            className="text-white/50 hover:text-red-400 transition-all text-sm p-1"
            onClick={(e) => { e.stopPropagation(); onDelete(profil.id); }}
            title="Profil löschen"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tag preview */}
      {tagCount > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {profil.interessen.slice(0, 3).map((i) => (
            <span key={i} className="text-xs bg-white/10 rounded-full px-2 py-0.5 text-white/60">
              {i}
            </span>
          ))}
          {profil.charaktereigenschaften?.slice(0, 2).map((c) => (
            <span key={c} className="text-xs bg-[#3d6b4a]/20 rounded-full px-2 py-0.5 text-[#a8d5b8]/60">
              {c}
            </span>
          ))}
          {profil.herausforderungen?.slice(0, 1).map((h) => (
            <span key={h} className="text-xs bg-[#d4a853]/10 rounded-full px-2 py-0.5 text-[#d4a853]/60">
              {h}
            </span>
          ))}
          {tagCount > 6 && (
            <span className="text-xs text-white/30">+{tagCount - 6}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/25 mt-2 italic">
          Noch keine Interessen — tippe auf 🏷️ um Koda mehr zu erzählen
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useProfile } from "@/lib/profile-context";
import { berechneAlter } from "@/lib/utils";

function getProfileEmoji(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  const map: Record<string, string> = {
    A: "\u{1F981}", B: "\u{1F43B}", C: "\u{1F431}", D: "\u{1F432}",
    E: "\u{1F418}", F: "\u{1F98A}", G: "\u{1F992}", H: "\u{1F439}",
    I: "\u{1F98E}", J: "\u{1F42F}", K: "\u{1F428}", L: "\u{1F981}",
    M: "\u{1F435}", N: "\u{1F984}", O: "\u{1F989}", P: "\u{1F43C}",
    Q: "\u{1F425}", R: "\u{1F430}", S: "\u{1F40D}", T: "\u{1F422}",
    U: "\u{1F984}", V: "\u{1F985}", W: "\u{1F40B}", X: "\u{1F98E}",
    Y: "\u{1F43A}", Z: "\u{1F993}",
  };
  return map[first] ?? "\u{1F9D2}";
}

export { getProfileEmoji };

interface ProfileSwitcherProps {
  variant: "sidebar" | "navbar";
  onClose?: () => void;
}

export default function ProfileSwitcher({ variant, onClose }: ProfileSwitcherProps) {
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    // Use pointerdown for unified mouse+touch handling
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  if (!profiles.length || !activeProfile) {
    // Empty state: no profiles yet
    if (variant === "sidebar") {
      return (
        <div className="px-2 mb-1">
          <Link
            href="/dashboard?new=1"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#4a7c59]/30 flex items-center justify-center text-lg shrink-0">
              <svg className="w-5 h-5 text-[#a8d5b8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#a8d5b8]">Profil erstellen</p>
              <p className="text-[10px] text-white/30">Damit Koda loslegen kann</p>
            </div>
          </Link>
        </div>
      );
    }
    return (
      <Link
        href="/dashboard?new=1"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm text-[#a8d5b8] hover:bg-white/5 transition-colors min-h-[36px]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-xs">Profil erstellen</span>
      </Link>
    );
  }

  const alter = activeProfile.geburtsdatum ? berechneAlter(activeProfile.geburtsdatum) : activeProfile.alter ?? 0;
  const tagCount = (activeProfile.interessen?.length || 0) + (activeProfile.charaktereigenschaften?.length || 0);

  if (variant === "sidebar") {
    return (
      <div ref={ref} className="relative px-2 mb-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-[#3d6b4a]/40 flex items-center justify-center text-lg shrink-0 overflow-hidden">
            {activeProfile.avatarUrl ? (
              <img src={activeProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : getProfileEmoji(activeProfile.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#f5eed6] truncate">{activeProfile.name}</p>
            <p className="text-[10px] text-white/40">
              {alter > 0 ? `${alter} Jahre` : ""}
              {tagCount > 0 && alter > 0 ? " · " : ""}
              {tagCount > 0 ? `${tagCount} Tags` : ""}
            </p>
          </div>
          <svg className={`w-4 h-4 text-white/30 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-2 right-2 top-full mt-1 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
            {profiles.map((p) => {
              const isActive = p.id === activeProfile.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { setActiveProfile(p.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium" : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="text-base shrink-0">{p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : getProfileEmoji(p.name)}</span>
                  <span className="truncate">{p.name}</span>
                  {p.isShared && (
                    <span className="text-[9px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded shrink-0">Geteilt</span>
                  )}
                  {isActive && (
                    <svg className="w-3.5 h-3.5 ml-auto text-[#a8d5b8] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
            <div className="border-t border-white/5">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Alle Profile verwalten
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  // variant === "navbar"
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors min-h-[36px]"
      >
        <span className="text-base">{activeProfile.avatarUrl ? (
          <img src={activeProfile.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
        ) : getProfileEmoji(activeProfile.name)}</span>
        <span className="max-w-[100px] truncate text-xs">{activeProfile.name}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
          {profiles.map((p) => {
            const isActive = p.id === activeProfile.id;
            return (
              <button
                key={p.id}
                onClick={() => { setActiveProfile(p.id); setOpen(false); onClose?.(); }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium" : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <span>{p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : getProfileEmoji(p.name)}</span>
                <span className="truncate">{p.name}</span>
                {isActive && <svg className="w-3.5 h-3.5 ml-auto text-[#a8d5b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
            );
          })}
          <div className="border-t border-white/5">
            <Link
              href={`/profil/${activeProfile.id}`}
              onClick={() => { setOpen(false); onClose?.(); }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#a8d5b8]/60 hover:text-[#a8d5b8] hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Profil bearbeiten
            </Link>
            <Link
              href="/profile"
              onClick={() => { setOpen(false); onClose?.(); }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
            >
              Alle Profile verwalten
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

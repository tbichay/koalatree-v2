"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useProfile } from "@/lib/profile-context";
import { useState, useRef, useEffect } from "react";

const NAV_ITEMS: { href: string; label: string; emoji: string; adminOnly?: boolean }[] = [
  { href: "/story", label: "Neue Geschichte", emoji: "\u2728" },
  { href: "/geschichten", label: "Meine Geschichten", emoji: "\u{1F4DA}" },
  { href: "/studio", label: "Studio", emoji: "\u{1F3A8}", adminOnly: true },
];

function getProfileEmoji(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  if (!first) return "\u{1F9D2}";
  // Map common first letters to child-friendly emojis
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

function ProfileSwitcher({ className }: { className?: string }) {
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!profiles.length || !activeProfile) return null;

  const emoji = getProfileEmoji(activeProfile.name);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-full min-h-[44px] text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
      >
        <span className="text-lg">{emoji}</span>
        <span className="max-w-[120px] truncate">{activeProfile.name}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
          <div className="py-1">
            {profiles.map((p) => {
              const isActive = p.id === activeProfile.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveProfile(p.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm min-h-[44px] transition-colors ${
                    isActive
                      ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="text-lg">{getProfileEmoji(p.name)}</span>
                  <span className="truncate">{p.name}</span>
                  {isActive && (
                    <svg className="w-4 h-4 ml-auto shrink-0 text-[#a8d5b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-white/5">
            <Link
              href="/dashboard?new=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/50 hover:text-white hover:bg-white/5 min-h-[44px] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Neues Profil
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/50 hover:text-white hover:bg-white/5 min-h-[44px] transition-colors"
            >
              Profile verwalten
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const email = session?.user?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-[#3d6b4a] text-[#f5eed6] text-sm font-semibold flex items-center justify-center hover:bg-[#4a7c59] transition-colors"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs text-white/40 truncate">{email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 min-h-[44px] transition-colors"
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { activeProfile } = useProfile();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin || false))
      .catch(() => {});
  }, []);

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* ── Desktop Top Bar (sm+) ── */}
      <nav className="sticky top-0 z-30 w-full bg-[#1a2e1a]/90 backdrop-blur-sm border-b border-white/5 hidden sm:block">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/story" className="flex items-center gap-2 shrink-0 min-h-[44px]">
            <Image src="/api/icons/logo.png" alt="KoalaTree" height={48} width={160} className="object-contain max-h-[48px] w-auto" />
          </Link>

          <div className="flex items-center gap-1">
            {visibleItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-full text-sm min-h-[44px] flex items-center transition-colors ${
                    isActive
                      ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
                      : "text-white/50 hover:text-white/80 hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ProfileSwitcher />
            <UserMenu />
          </div>
        </div>
      </nav>

      {/* ── Mobile Top Bar (<sm) ── */}
      <nav className="sticky top-0 z-30 w-full bg-[#1a2e1a]/90 backdrop-blur-sm border-b border-white/5 sm:hidden">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/story" className="flex items-center shrink-0 min-h-[44px]">
            <Image src="/api/icons/logo.png" alt="KoalaTree" height={36} width={120} className="object-contain max-h-[36px] w-auto" />
          </Link>

          <div className="flex items-center gap-3">
            {activeProfile && (
              <ProfileSwitcher className="" />
            )}
            <UserMenu />
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Bar (<sm) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#1a2e1a]/95 backdrop-blur-sm border-t border-white/5 sm:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center min-h-[56px] text-xs transition-colors ${
                  isActive
                    ? "text-[#a8d5b8] bg-[#3d6b4a]/20"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                <span className="text-xl mb-0.5">{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

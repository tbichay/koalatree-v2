"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useProfile } from "@/lib/profile-context";
import { useState, useRef, useEffect } from "react";

function getProfileEmoji(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  const map: Record<string, string> = {
    A: "\u{1F981}", B: "\u{1F43B}", C: "\u{1F431}", D: "\u{1F432}",
    E: "\u{1F418}", F: "\u{1F98A}", G: "\u{1F992}", H: "\u{1F439}",
    K: "\u{1F428}", L: "\u{1F981}", M: "\u{1F435}", N: "\u{1F984}",
    P: "\u{1F43C}", R: "\u{1F430}", S: "\u{1F40D}", T: "\u{1F422}",
  };
  return map[first] ?? "\u{1F9D2}";
}

function ProfileSwitcher() {
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!profiles.length || !activeProfile) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors min-h-[36px]"
      >
        <span className="text-base">{activeProfile.avatarUrl ? (
          <img src={activeProfile.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
        ) : getProfileEmoji(activeProfile.name)}</span>
        <span className="max-w-[80px] truncate text-xs">{activeProfile.name}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
          {profiles.map((p) => {
            const isActive = p.id === activeProfile.id;
            return (
              <div key={p.id} className="flex items-center">
                <button
                  onClick={() => { setActiveProfile(p.id); setOpen(false); }}
                  className={`flex-1 flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium" : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>{p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : getProfileEmoji(p.name)}</span>
                  <span className="truncate">{p.name}</span>
                  {isActive && <svg className="w-3.5 h-3.5 ml-auto text-[#a8d5b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </button>
              </div>
            );
          })}
          <div className="border-t border-white/5">
            {activeProfile && (
              <Link
                href={`/profil/${activeProfile.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#a8d5b8]/60 hover:text-[#a8d5b8] hover:bg-white/5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Profil aktualisieren
              </Link>
            )}
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">
              Alle Profile verwalten
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
  const initial = (session?.user?.name || email).charAt(0).toUpperCase() || "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-[#3d6b4a] text-[#f5eed6] text-sm font-semibold flex items-center justify-center hover:bg-[#4a7c59] transition-colors overflow-hidden"
      >
        {session?.user?.image ? (
          <img src={`/api/avatars/${session.user.id}`} alt="" className="w-full h-full object-cover" />
        ) : initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs text-white/60 truncate">{email}</p>
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 min-h-[44px] transition-colors"
          >
            Konto verwalten
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 min-h-[44px] transition-colors border-t border-white/5"
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

const MOBILE_TABS = [
  { href: "/dashboard", label: "Start", icon: (active: boolean) => (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { href: "/geschichten", label: "Bibliothek", icon: (active: boolean) => (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  )},
  // ➕ wird separat gerendert (raised center button)
  { href: "/geteilt", label: "Geteilt", icon: (active: boolean) => (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  )},
  { href: "/dashboard", label: "Profil", icon: (active: boolean) => (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )},
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Mobile Top Bar ── */}
      <nav className="sticky top-0 z-30 w-full bg-[#1a2e1a]/90 backdrop-blur-sm border-b border-white/5 md:hidden">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center shrink-0 min-h-[44px]">
            <Image src="/api/icons/logo.png" alt="KoalaTree" height={24} width={80} className="object-contain max-h-[24px] w-auto" unoptimized />
          </Link>
          <div className="flex items-center gap-2">
            <ProfileSwitcher />
            <UserMenu />
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Bar (5 Tabs + Center ➕) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#1a2e1a]/95 backdrop-blur-sm border-t border-white/5 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end">
          {/* Tab 1: Start */}
          {renderTab(MOBILE_TABS[0], pathname)}

          {/* Tab 2: Bibliothek */}
          {renderTab(MOBILE_TABS[1], pathname)}

          {/* Center: ➕ Neue Geschichte (raised) */}
          <Link
            href="/story"
            className="flex-1 flex flex-col items-center justify-center -mt-3"
          >
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
              pathname === "/story" || pathname?.startsWith("/story/")
                ? "bg-[#4a7c59] ring-2 ring-[#a8d5b8]/30"
                : "bg-gradient-to-br from-[#4a7c59] to-[#3d6b4a] hover:from-[#5a8c69] hover:to-[#4a7c59]"
            }`}>
              <svg className="w-7 h-7 text-[#f5eed6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-[10px] text-white/60 mt-0.5">Neu</span>
          </Link>

          {/* Tab 4: Geteilt */}
          {renderTab(MOBILE_TABS[2], pathname)}

          {/* Tab 5: Profil */}
          {renderTab(MOBILE_TABS[3], pathname, true)}
        </div>
      </div>
    </>
  );
}

function renderTab(
  tab: (typeof MOBILE_TABS)[0],
  pathname: string | null,
  isProfileTab?: boolean
) {
  // Profile tab: active on /dashboard only when not in other sections
  const isActive = isProfileTab
    ? pathname === "/dashboard" || pathname?.startsWith("/dashboard/")
    : pathname === tab.href || pathname?.startsWith(tab.href + "/");

  return (
    <Link
      href={tab.href}
      className={`flex-1 flex flex-col items-center justify-center min-h-[56px] text-xs transition-colors ${
        isActive
          ? "text-[#a8d5b8]"
          : "text-white/60"
      }`}
    >
      {tab.icon(!!isActive)}
      <span className="mt-0.5">{tab.label}</span>
    </Link>
  );
}

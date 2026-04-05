"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useProfile } from "@/lib/profile-context";
import { useState, useRef, useEffect } from "react";
import ProfileSwitcher from "./ProfileSwitcher";

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

function BottomSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeProfile } = useProfile();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-bottomsheet-backdrop]")) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div data-bottomsheet-backdrop className="fixed inset-0 z-50 bg-black/50 flex items-end">
      <div className="w-full bg-[#1a2e1a] rounded-t-2xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <nav className="px-4 pb-4 space-y-1">
          <Link
            href="/profile"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors min-h-[48px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Alle Profile verwalten
          </Link>

          <Link
            href="/geteilt"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors min-h-[48px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Geteilte Stories
          </Link>

          <Link
            href="/account"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors min-h-[48px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Konto
          </Link>

          <div className="border-t border-white/5 pt-1 mt-1">
            <button
              onClick={() => { onClose(); signOut({ callbackUrl: "/" }); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors min-h-[48px]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Abmelden
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { activeProfile } = useProfile();
  const [moreOpen, setMoreOpen] = useState(false);

  const profilHref = activeProfile ? `/profil/${activeProfile.id}` : "/dashboard";

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
    // Center button rendered separately
    { href: profilHref, label: "Profil", icon: (active: boolean) => (
      <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )},
  ];

  return (
    <>
      {/* Mobile Top Bar */}
      <nav className="sticky top-0 z-30 w-full bg-[#1a2e1a]/90 backdrop-blur-sm border-b border-white/5 md:hidden">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center shrink-0 min-h-[44px]">
            <Image src="/api/icons/logo.png" alt="KoalaTree" height={24} width={80} className="object-contain max-h-[24px] w-auto" unoptimized />
          </Link>
          <div className="flex items-center gap-2">
            <ProfileSwitcher variant="navbar" />
            <UserMenu />
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#1a2e1a]/95 backdrop-blur-sm border-t border-white/5 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end">
          {/* Tab 1: Start */}
          {renderTab(MOBILE_TABS[0], pathname)}

          {/* Tab 2: Bibliothek */}
          {renderTab(MOBILE_TABS[1], pathname)}

          {/* Center: Neue Geschichte (raised) */}
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

          {/* Tab 4: Profil */}
          {renderTab(MOBILE_TABS[2], pathname, true)}

          {/* Tab 5: Mehr */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center min-h-[56px] text-xs transition-colors ${
              moreOpen ? "text-[#a8d5b8]" : "text-white/60"
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span className="mt-0.5">Mehr</span>
          </button>
        </div>
      </div>

      {/* Bottom Sheet */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function renderTab(
  tab: { href: string; label: string; icon: (active: boolean) => React.ReactNode },
  pathname: string | null,
  isProfileTab?: boolean
) {
  const isActive = isProfileTab
    ? pathname?.startsWith("/profil/")
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

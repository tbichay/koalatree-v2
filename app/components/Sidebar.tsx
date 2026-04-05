"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useProfile } from "@/lib/profile-context";
import { useState } from "react";

function getProfileEmoji(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  if (!first) return "\u{1F9D2}";
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

const NAV_ITEMS = [
  { href: "/dashboard", label: "Start", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { href: "/story", label: "Neue Geschichte", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )},
  { href: "/geschichten", label: "Bibliothek", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  )},
  { href: "/geteilt", label: "Geteilt", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  )},
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin check
  useState(() => {
    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin || false))
      .catch(() => {});
  });

  const email = session?.user?.email ?? "";
  const initial = (session?.user?.name || email).charAt(0).toUpperCase() || "?";

  return (
    <aside
      className={`hidden md:flex flex-col h-screen sticky top-0 bg-[#162816] border-r border-white/5 transition-all duration-200 ${
        collapsed ? "w-[72px]" : "w-56"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 shrink-0 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-2 min-h-[44px]">
          <Image src="/api/icons/logo.png" alt="KoalaTree" height={28} width={28} className="object-contain rounded" />
          {!collapsed && <span className="text-[#f5eed6] font-semibold text-sm">KoalaTree</span>}
        </Link>
        <button
          className="ml-auto text-white/30 hover:text-white/80 transition-colors p-1"
          onClick={() => setCollapsed(!collapsed)}
        >
          <svg className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-[44px] transition-colors ${
                isActive
                  ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Admin: Studio */}
        {isAdmin && (
          <Link
            href="/studio"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-[44px] transition-colors ${
              pathname === "/studio"
                ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
            title={collapsed ? "Studio" : undefined}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {!collapsed && <span>Studio</span>}
          </Link>
        )}

        {/* Divider */}
        <div className="border-t border-white/5 my-3" />

        {/* Profile Section — wie YouTube "Abonnements" */}
        {!collapsed && (
          <div className="px-1 mb-1">
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Profile</span>
          </div>
        )}
        {profiles.map((p) => {
          const isActive = activeProfile?.id === p.id;
          return (
            <div key={p.id} className="group/profile flex items-center">
              <button
                onClick={() => setActiveProfile(p.id)}
                className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-sm min-h-[40px] transition-colors ${
                  isActive
                    ? "bg-[#3d6b4a]/20 text-[#a8d5b8]"
                    : "text-white/60 hover:text-white/70 hover:bg-white/5"
                }`}
                title={collapsed ? p.name : undefined}
              >
                <span className="text-lg shrink-0">{p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : getProfileEmoji(p.name)}</span>
                {!collapsed && <span className="truncate">{p.name}</span>}
                {isActive && !collapsed && (
                  <svg className="w-3 h-3 ml-auto shrink-0 text-[#a8d5b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {!collapsed && (
                <Link
                  href={`/profil/${p.id}`}
                  className="p-1.5 text-white/20 hover:text-white/80 opacity-0 group-hover/profile:opacity-100 transition-all shrink-0"
                  title="Profil bearbeiten"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </Link>
              )}
            </div>
          );
        })}
        <Link
          href="/dashboard?new=1"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/30 hover:text-white/80 hover:bg-white/5 transition-colors min-h-[40px]"
          title={collapsed ? "Neues Profil" : undefined}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {!collapsed && <span>Neues Profil</span>}
        </Link>
      </nav>

      {/* Footer: Account */}
      <div className="border-t border-white/5 p-2 space-y-1">
        <Link
          href="/account"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-[44px] transition-colors ${
            pathname === "/account"
              ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
              : "text-white/50 hover:text-white/80 hover:bg-white/5"
          }`}
          title={collapsed ? "Konto" : undefined}
        >
          <div className="w-6 h-6 rounded-full bg-[#3d6b4a] text-[#f5eed6] text-xs font-semibold flex items-center justify-center shrink-0 overflow-hidden">
            {session?.user?.image ? (
              <img src={`/api/avatars/${session.user.id}`} alt="" className="w-full h-full object-cover" />
            ) : initial}
          </div>
          {!collapsed && <span className="truncate">{session?.user?.name || email}</span>}
        </Link>
        {!collapsed && (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/30 hover:text-white/80 hover:bg-white/5 transition-colors min-h-[40px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Abmelden</span>
          </button>
        )}
      </div>
    </aside>
  );
}

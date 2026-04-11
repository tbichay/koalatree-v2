"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// ── Engine Navigation (koalatree.io) — Dark sidebar ──────────────

const ENGINE_NAV = [
  { href: "/studio/engine", label: "Engine", icon: "⬡" },
  { href: "/studio/library", label: "Library", icon: "◫" },
  { href: "/studio/tasks", label: "Tasks", icon: "◎" },
  { href: "/studio/prompts", label: "Prompts", icon: "⎕" },
  { href: "/studio/models", label: "Models", icon: "◇" },
  { href: "/studio/settings", label: "Settings", icon: "⚙" },
];

// ── Legacy Navigation (koalatree.ai/studio) — Green top bar ──────

const LEGACY_NAV = [
  { href: "/studio", label: "Übersicht", emoji: "🏠", exact: true },
  { href: "/studio/engine", label: "Engine", emoji: "🎬" },
  { href: "/studio/library", label: "Library", emoji: "📁" },
  { href: "/studio/prompts", label: "Prompts", emoji: "📝" },
  { href: "/studio/models", label: "Models", emoji: "🤖" },
  { href: "/studio/film-maker", label: "Film-Maker", emoji: "🎥" },
  { href: "/studio/settings", label: "Einstellungen", emoji: "⚙️" },
];

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEngine, setIsEngine] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  useEffect(() => {
    // Detect domain or ?theme=engine override for preview testing
    const params = new URLSearchParams(window.location.search);
    setIsEngine(
      window.location.hostname.includes("koalatree.io") ||
      params.get("theme") === "engine"
    );

    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => { setIsAdmin(d.isAdmin || false); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#141414" }}>
        <div className="w-4 h-4 border-2 border-[#C8A97E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "#141414" }}>
        <p className="text-[#8A8A8A] text-sm">Zugang nur fuer Administratoren.</p>
      </div>
    );
  }

  // ── Engine Layout (koalatree.io) ──
  if (isEngine) {
    return (
      <div className="flex-1 flex" data-theme="engine" style={{ background: "#141414", color: "#E8E8E8" }}>
        {/* Sidebar */}
        <nav
          className="shrink-0 flex flex-col border-r transition-all duration-200"
          style={{
            width: sidebarExpanded ? 180 : 52,
            borderColor: "#2A2A2A",
            background: "#1A1A1A",
          }}
          onMouseEnter={() => setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          {/* Logo */}
          <div className="h-12 flex items-center px-3.5 border-b" style={{ borderColor: "#2A2A2A" }}>
            <span className="text-[#C8A97E] text-sm font-medium tracking-wide">
              {sidebarExpanded ? "koalatree" : "kt"}
            </span>
          </div>

          {/* Nav Items */}
          <div className="flex-1 py-3 space-y-0.5">
            {ENGINE_NAV.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 mx-1.5 px-2.5 py-2 rounded-lg transition-all relative"
                  style={{
                    color: isActive ? "#E8E8E8" : "#555",
                    background: isActive ? "#262626" : "transparent",
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r" style={{ background: "#C8A97E" }} />
                  )}
                  <span className="text-sm w-5 text-center shrink-0">{item.icon}</span>
                  {sidebarExpanded && (
                    <span className="text-[11px] tracking-wide whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    );
  }

  // ── Legacy Layout (koalatree.ai/studio) ──
  return (
    <div className="flex-1 flex flex-col">
      {/* Studio Navigation Bar */}
      <div className="border-b border-white/5 bg-[#162816]/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-2" style={{ scrollbarWidth: "none" }}>
            {LEGACY_NAV.map((tool) => {
              const isActive = tool.exact
                ? pathname === tool.href
                : pathname?.startsWith(tool.href);

              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all ${
                    isActive
                      ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  <span>{tool.emoji}</span>
                  <span>{tool.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

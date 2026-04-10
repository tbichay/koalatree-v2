"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const STUDIO_TOOLS = [
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

  useEffect(() => {
    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => { setIsAdmin(d.isAdmin || false); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30">Laden...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/50">Zugang nur fuer Administratoren.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Studio Navigation Bar */}
      <div className="border-b border-white/5 bg-[#162816]/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-2" style={{ scrollbarWidth: "none" }}>
            {STUDIO_TOOLS.map((tool) => {
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

"use client";

import Link from "next/link";
import Stars from "../components/Stars";

const TOOLS = [
  {
    href: "/studio/film-maker",
    emoji: "🎥",
    title: "Film-Maker",
    description: "Storyboard erstellen und Geschichten als animierten Film generieren",
    tag: "NEU",
    tagColor: "bg-[#d4a853]/20 text-[#d4a853]",
  },
  {
    href: "/studio/videos",
    emoji: "🎬",
    title: "Marketing Videos",
    description: "Lip-Sync Clips der KoalaTree-Charaktere fuer Social Media",
  },
  {
    href: "/studio/portraits",
    emoji: "🎨",
    title: "Portraits",
    description: "Character-Portraits in verschiedenen Posen und Szenen generieren",
  },
  {
    href: "/studio/hero",
    emoji: "🏔️",
    title: "Hero Builder",
    description: "Landing Page Hero-Bild mit allen Charakteren erstellen",
  },
  {
    href: "/studio/branding",
    emoji: "✨",
    title: "Branding",
    description: "Logos, Favicons und App-Icons generieren und verwalten",
  },
];

export default function StudioHub() {
  return (
    <div className="relative">
      <Stars />
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 pb-24 sm:pb-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#f5eed6]">
            KoalaTree Studio
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Kreativ-Tools fuer Bilder, Videos und Filme
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="card p-5 hover:border-[#4a7c59]/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">{tool.emoji}</div>
                {tool.tag && (
                  <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${tool.tagColor}`}>
                    {tool.tag}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-medium text-[#f5eed6] group-hover:text-[#a8d5b8] transition-colors mb-1">
                {tool.title}
              </h3>
              <p className="text-xs text-white/40 leading-relaxed">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

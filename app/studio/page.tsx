"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Stars from "../components/Stars";

// ── KoalaTree Admin Hub (koalatree.ai/studio) ────────────────────

const ADMIN_TOOLS = [
  {
    href: "/studio/engine",
    emoji: "🎬",
    title: "Engine",
    description: "Story-to-Film Pipeline — Geschichten als animierte Filme produzieren",
    tag: "V2",
    tagColor: "bg-[#d4a853]/20 text-[#d4a853]",
  },
  {
    href: "/studio/library",
    emoji: "📁",
    title: "Library",
    description: "Asset Library — Portraits, Landscapes, Clips und Sounds verwalten",
  },
  {
    href: "/studio/film-maker",
    emoji: "🎥",
    title: "Film-Maker",
    description: "V1 Film-Maker — Legacy Storyboard und Clip-Generierung",
  },
  {
    href: "/studio/prompts",
    emoji: "📝",
    title: "Prompts",
    description: "Prompt Library — Baukasten-System fuer AI-Prompts verwalten",
  },
  {
    href: "/studio/models",
    emoji: "🤖",
    title: "Models",
    description: "AI Model Registry — Provider, Preise und Capabilities",
  },
  {
    href: "/studio/settings",
    emoji: "⚙️",
    title: "Einstellungen",
    description: "Stil-Prompt, Charakter-Definitionen und Projekt-Konfiguration",
  },
];

function AdminHub() {
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
          {ADMIN_TOOLS.map((tool) => (
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

// ── Engine Landing Page (koalatree.io) ───────────────────────────

const PIPELINE_STEPS = [
  { icon: "✎", label: "Geschichte", desc: "Text, Upload oder AI" },
  { icon: "◧", label: "Drehbuch", desc: "Szenen & Regie" },
  { icon: "♫", label: "Audio", desc: "Stimmen & Sound" },
  { icon: "▶", label: "Film", desc: "Clips & Assembly" },
];

function EngineLanding() {
  return (
    <div style={{ background: "#141414", color: "#E8E8E8", minHeight: "100vh" }}>
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-16">
        <div className="mb-4">
          <span
            className="text-[11px] tracking-[0.2em] uppercase"
            style={{ color: "#555" }}
          >
            Story-to-Film Engine
          </span>
        </div>
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-light leading-[1.1] mb-6"
          style={{ color: "#E8E8E8", letterSpacing: "-0.02em" }}
        >
          Verwandle jede
          <br />
          Geschichte in einen
          <br />
          <span style={{ color: "#C8A97E" }}>animierten Film.</span>
        </h1>
        <p className="text-base max-w-lg mb-10" style={{ color: "#8A8A8A", lineHeight: 1.7 }}>
          Von der Idee zum fertigen Film in Minuten.
          AI-generierte Geschichten, professionelle Sprachausgabe,
          cinematische Video-Clips — alles in einer Pipeline.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/studio/engine"
            className="px-6 py-2.5 rounded-lg text-sm tracking-wide transition-all"
            style={{
              border: "1px solid #C8A97E",
              color: "#C8A97E",
              background: "transparent",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(200,169,126,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Engine starten
          </Link>
          <Link
            href="/studio/library"
            className="px-6 py-2.5 rounded-lg text-sm tracking-wide transition-all"
            style={{
              border: "1px solid #2A2A2A",
              color: "#8A8A8A",
              background: "transparent",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#262626"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Asset Library
          </Link>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="max-w-4xl mx-auto px-6 py-16" style={{ borderTop: "1px solid #1E1E1E" }}>
        <div className="grid grid-cols-4 gap-6">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={i} className="text-center">
              <div
                className="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center text-xl"
                style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
              >
                <span style={{ color: i === 3 ? "#C8A97E" : "#8A8A8A" }}>{step.icon}</span>
              </div>
              <p className="text-[11px] font-medium mb-0.5" style={{ color: "#E8E8E8" }}>
                {step.label}
              </p>
              <p className="text-[10px]" style={{ color: "#555" }}>
                {step.desc}
              </p>
              {i < 3 && (
                <div className="hidden sm:block absolute" style={{ color: "#2A2A2A" }}>
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-6 py-16" style={{ borderTop: "1px solid #1E1E1E" }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            {
              title: "Prompt Library",
              desc: "Modulare Prompt-Bausteine mit Versionierung. Character-Blocks, Regie-Stile, Atmosphaeren — alles kombinierbar.",
            },
            {
              title: "Multi-Provider",
              desc: "Kling, Seedance, Veo, ElevenLabs — waehle den besten Provider pro Szene. Preise und Quality im Blick.",
            },
            {
              title: "Asset Management",
              desc: "Jedes generierte Bild, jeder Clip mit Provenance. Welcher Prompt erzeugte was — immer nachvollziehbar.",
            },
          ].map((f, i) => (
            <div key={i}>
              <h3 className="text-sm font-medium mb-2" style={{ color: "#E8E8E8" }}>
                {f.title}
              </h3>
              <p className="text-[11px] leading-relaxed" style={{ color: "#555" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-6 py-8" style={{ borderTop: "1px solid #1E1E1E" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: "#333" }}>
            koalatree.io
          </span>
          <div className="flex items-center gap-6">
            <Link href="/studio/prompts" className="text-[10px] transition-colors" style={{ color: "#555" }}>
              Prompts
            </Link>
            <Link href="/studio/models" className="text-[10px] transition-colors" style={{ color: "#555" }}>
              Models
            </Link>
            <Link href="/sign-in" className="text-[10px] transition-colors" style={{ color: "#555" }}>
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Router ───────────────────────────────────────────────────────

export default function StudioHub() {
  const [isEngine, setIsEngine] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsEngine(
      window.location.hostname.includes("koalatree.io") ||
      params.get("theme") === "engine",
    );
    setChecked(true);
  }, []);

  if (!checked) return null;

  return isEngine ? <EngineLanding /> : <AdminHub />;
}

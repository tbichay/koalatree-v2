"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export default function FilmSettingsPage() {
  const [defaultQuality, setDefaultQuality] = useState<"standard" | "premium">("standard");
  const [introEnabled, setIntroEnabled] = useState(true);
  const [outroEnabled, setOutroEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(8);
  const [warmth, setWarmth] = useState(30);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("koalatree-film-settings");
      if (saved) {
        const s = JSON.parse(saved);
        setDefaultQuality(s.defaultQuality || "standard");
        setIntroEnabled(s.introEnabled ?? true);
        setOutroEnabled(s.outroEnabled ?? true);
        setMusicVolume(s.musicVolume ?? 8);
        setWarmth(s.warmth ?? 30);
      }
    } catch { /* ignore */ }
  }, []);

  const save = () => {
    const settings = { defaultQuality, introEnabled, outroEnabled, musicVolume, warmth };
    localStorage.setItem("koalatree-film-settings", JSON.stringify(settings));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-[#f5eed6] mb-6">Film-Einstellungen</h1>

      {/* Default Quality */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Standard-Qualitaet</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setDefaultQuality("standard"); save(); }}
            className={`p-3 rounded-xl text-left transition-all ${
              defaultQuality === "standard" ? "bg-[#4a7c59]/20 border border-[#4a7c59]/40" : "bg-white/5 border border-transparent"
            }`}
          >
            <p className="text-xs font-medium text-[#f5eed6]">Standard</p>
            <p className="text-[10px] text-white/30 mt-1">Hedra Character-3 fuer Dialog. ~100 Credits/30s.</p>
          </button>
          <button
            onClick={() => { setDefaultQuality("premium"); save(); }}
            className={`p-3 rounded-xl text-left transition-all ${
              defaultQuality === "premium" ? "bg-[#d4a853]/20 border border-[#d4a853]/40" : "bg-white/5 border border-transparent"
            }`}
          >
            <p className="text-xs font-medium text-[#f5eed6]">Premium</p>
            <p className="text-[10px] text-white/30 mt-1">Kling Avatar v2 fuer Dialog. ~240 Credits/30s. Mehr Bewegung.</p>
          </button>
        </div>
      </div>

      {/* Intro/Outro */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Vorspann & Abspann</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={introEnabled} onChange={(e) => { setIntroEnabled(e.target.checked); save(); }} className="accent-[#4a7c59]" />
            <div>
              <p className="text-xs text-[#f5eed6]">Vorspann einfuegen</p>
              <p className="text-[10px] text-white/30">&quot;KoalaTree praesentiert&quot; (3 Sekunden)</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={outroEnabled} onChange={(e) => { setOutroEnabled(e.target.checked); save(); }} className="accent-[#4a7c59]" />
            <div>
              <p className="text-xs text-[#f5eed6]">Abspann einfuegen</p>
              <p className="text-[10px] text-white/30">&quot;Erstellt mit KoalaTree&quot; + Logo (4 Sekunden)</p>
            </div>
          </label>
        </div>
      </div>

      {/* Mastering Defaults */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Standard Mastering</h3>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-white/30 block mb-1">Farbtemperatur: {warmth > 0 ? "warm" : warmth < 0 ? "kalt" : "neutral"}</label>
            <input type="range" min={-100} max={100} value={warmth} onChange={(e) => { setWarmth(parseInt(e.target.value)); save(); }} className="w-full h-1 accent-[#d4a853]" />
          </div>
          <div>
            <label className="text-[10px] text-white/30 block mb-1">Hintergrundmusik: {musicVolume}%</label>
            <input type="range" min={0} max={30} value={musicVolume} onChange={(e) => { setMusicVolume(parseInt(e.target.value)); save(); }} className="w-full h-1 accent-[#a8d5b8]" />
          </div>
        </div>
      </div>

      {/* Intro/Outro Generator */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Vorspann & Abspann generieren</h3>
        <p className="text-[10px] text-white/30 mb-3">
          Einmal generieren, bei jeder Folge wiederverwenden. Kosten: ~$0.08 (Bild) + ~35-120 Hedra Credits (Animation).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Intros */}
          <div>
            <p className="text-[10px] text-white/40 font-medium mb-2">🎬 Vorspann</p>
            <div className="space-y-1.5">
              {[
                { id: "koalatree_classic", label: "Classic (Goldene Stunde)" },
                { id: "koalatree_night", label: "Nacht (Mond + Sterne)" },
                { id: "koalatree_dawn", label: "Morgen (Sonnenaufgang)" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={async () => {
                    if (!confirm(`Vorspann "${preset.label}" generieren? (~$0.08 + ~35 Credits)`)) return;
                    try {
                      const res = await fetch("/api/admin/generate-intro-outro", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "intro", presetId: preset.id }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      alert(`Vorspann generiert! (${(data.size / 1024 / 1024).toFixed(1)} MB)`);
                    } catch (err) {
                      alert("Fehler: " + (err instanceof Error ? err.message : "Unbekannt"));
                    }
                  }}
                  className="w-full text-left text-[10px] p-2 rounded-lg bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                >
                  🌅 {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Outros */}
          <div>
            <p className="text-[10px] text-white/40 font-medium mb-2">🎬 Abspann</p>
            <div className="space-y-1.5">
              {[
                { id: "koalatree_wave", label: "Koda winkt" },
                { id: "koalatree_group", label: "Alle winken" },
                { id: "simple_fade", label: "Einfacher Text" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={async () => {
                    if (preset.id === "simple_fade") {
                      alert("Einfacher Text-Abspann wird beim Mastering automatisch erstellt (ffmpeg).");
                      return;
                    }
                    if (!confirm(`Abspann "${preset.label}" generieren? (~$0.08 + ~35 Credits)`)) return;
                    try {
                      const res = await fetch("/api/admin/generate-intro-outro", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "outro", presetId: preset.id }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      alert(`Abspann generiert! (${(data.size / 1024 / 1024).toFixed(1)} MB)`);
                    } catch (err) {
                      alert("Fehler: " + (err instanceof Error ? err.message : "Unbekannt"));
                    }
                  }}
                  className="w-full text-left text-[10px] p-2 rounded-lg bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                >
                  👋 {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KoalaTree Style Reference */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Stil-Referenz</h3>
        <p className="text-[10px] text-white/30 mb-3">
          Alle generierten Bilder und Videos verwenden den KoalaTree-Stil:
          Traditional hand-drawn cel animation, Disney 1994 era (Lion King, Jungle Book).
        </p>
        <div className="grid grid-cols-4 gap-2">
          {["koda", "kiki", "luna", "mika"].map((c) => (
            <div key={c} className="aspect-square rounded-xl overflow-hidden bg-[#1a2e1a]">
              <Image src={`/api/images/${c}-portrait.png`} alt={c} width={100} height={100} className="w-full h-full object-cover" unoptimized />
            </div>
          ))}
        </div>
      </div>

      {/* Credits Info */}
      <div className="card p-5">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Credits</h3>
        <div className="space-y-2 text-[10px] text-white/40">
          <div className="flex justify-between">
            <span>Dialog-Clip (Standard, 30s)</span>
            <span>~100 Credits</span>
          </div>
          <div className="flex justify-between">
            <span>Dialog-Clip (Premium, 30s)</span>
            <span>~240 Credits</span>
          </div>
          <div className="flex justify-between">
            <span>Landscape-Clip (5-10s)</span>
            <span>~35-120 Credits</span>
          </div>
          <div className="flex justify-between">
            <span>Szenen-Bild (DALL-E)</span>
            <span>~$0.08</span>
          </div>
          <div className="border-t border-white/5 pt-2 mt-2 flex justify-between text-white/60">
            <span>Geschaetzter Film (18 Szenen)</span>
            <span>~1.500 Credits + ~$1.50</span>
          </div>
        </div>
      </div>
    </div>
  );
}

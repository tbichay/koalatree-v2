"use client";

import { useState, useEffect, useCallback } from "react";

interface MarketingVideo {
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}

const CHARACTERS = [
  { id: "koda", name: "Koda", emoji: "🐨", color: "#a8d5b8" },
  { id: "kiki", name: "Kiki", emoji: "🐦", color: "#e8c547" },
  { id: "luna", name: "Luna", emoji: "🦉", color: "#b8a9d4" },
  { id: "mika", name: "Mika", emoji: "🐕", color: "#d4884a" },
  { id: "pip", name: "Pip", emoji: "🦫", color: "#6bb5c9" },
  { id: "sage", name: "Sage", emoji: "🐻", color: "#8a9e7a" },
  { id: "nuki", name: "Nuki", emoji: "☀️", color: "#f0b85a" },
];

const AUDIO_SOURCES = [
  { id: "help-clip:willkommen", label: "Willkommen (Koda)", char: "koda" },
  { id: "help-clip:interessen", label: "Interessen (Pip)", char: "pip" },
  { id: "help-clip:story-format", label: "Story-Formate (Kiki)", char: "kiki" },
  { id: "help-clip:story-ziel", label: "Story-Ziel (Sage)", char: "sage" },
  { id: "help-clip:bibliothek", label: "Bibliothek (Nuki)", char: "nuki" },
  { id: "help-clip:profil-teilen", label: "Profil teilen (Luna)", char: "luna" },
  { id: "help-clip:herausforderungen", label: "Herausforderungen (Pip)", char: "pip" },
  { id: "help-clip:charaktereigenschaften", label: "Eigenschaften (Pip)", char: "pip" },
  { id: "help-clip:entwicklung", label: "Entwicklung (Sage)", char: "sage" },
  { id: "help-clip:profil-erstellen", label: "Profil erstellen (Koda)", char: "koda" },
  { id: "help-clip:tags", label: "Tags (Pip)", char: "pip" },
  { id: "help-clip:story-thema", label: "Story-Thema (Koda)", char: "koda" },
  { id: "onboarding", label: "Welcome Story (alle)", char: "koda" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudioVideos() {
  const [videos, setVideos] = useState<MarketingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genChar, setGenChar] = useState("koda");
  const [genAudio, setGenAudio] = useState("help-clip:willkommen");
  const [genAspect, setGenAspect] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [genStatus, setGenStatus] = useState("");
  const [genError, setGenError] = useState("");
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing-video");
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError("");
    setGenStatus("Video wird generiert... (ca. 2 Minuten)");

    try {
      const res = await fetch("/api/admin/marketing-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: genChar,
          audioSource: genAudio,
          aspectRatio: genAspect,
          resolution: "720p",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      setGenStatus(`Video generiert: ${data.videoName}`);
      await loadVideos();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Fehler");
      setGenStatus("");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#f5eed6]">Marketing Videos</h2>
      <p className="text-sm text-white/50">
        Lip-Sync Videos der KoalaTree-Charaktere. Generiert via Hedra Character-3 mit euren ElevenLabs-Stimmen.
      </p>

      {/* Generate new video */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-medium text-[#f5eed6]">Neues Video generieren</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Charakter</label>
            <select
              value={genChar}
              onChange={(e) => setGenChar(e.target.value)}
              className="w-full text-sm py-2"
              disabled={generating}
            >
              {CHARACTERS.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Audio-Clip</label>
            <select
              value={genAudio}
              onChange={(e) => setGenAudio(e.target.value)}
              className="w-full text-sm py-2"
              disabled={generating}
            >
              {AUDIO_SOURCES.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Format</label>
            <select
              value={genAspect}
              onChange={(e) => setGenAspect(e.target.value as "9:16" | "16:9" | "1:1")}
              className="w-full text-sm py-2"
              disabled={generating}
            >
              <option value="9:16">9:16 (Story/Reel)</option>
              <option value="16:9">16:9 (YouTube)</option>
              <option value="1:1">1:1 (Instagram)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary text-sm px-5 py-2 disabled:opacity-50"
          >
            {generating ? "Generiert..." : "Video generieren"}
          </button>
          {genStatus && <p className="text-xs text-[#a8d5b8]">{genStatus}</p>}
          {genError && <p className="text-xs text-red-400">{genError}</p>}
        </div>
      </div>

      {/* Video Gallery */}
      <div>
        <h3 className="text-sm font-medium text-[#f5eed6] mb-3">
          Generierte Videos ({videos.length})
        </h3>

        {loading ? (
          <div className="text-white/30 text-sm">Laden...</div>
        ) : videos.length === 0 ? (
          <div className="card p-6 text-center text-white/40 text-sm">
            Noch keine Videos generiert.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map((v) => {
              const charName = v.name.split("-")[0];
              const char = CHARACTERS.find((c) => c.id === charName);
              const isPlaying = playingVideo === v.name;

              return (
                <div key={v.name} className="card overflow-hidden">
                  {/* Video player */}
                  <div className="relative aspect-[9/16] bg-black">
                    {isPlaying ? (
                      <video
                        src={v.url}
                        autoPlay
                        controls
                        className="w-full h-full object-contain"
                        onEnded={() => setPlayingVideo(null)}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setPlayingVideo(v.name)}
                      >
                        <div className="w-20 h-20 rounded-2xl overflow-hidden mb-3">
                          <img
                            src={`/api/images/${charName}-portrait.png`}
                            alt={char?.name || charName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{char?.emoji || "🎬"}</span>
                      <span className="text-sm font-medium text-[#f5eed6]">{char?.name || charName}</span>
                    </div>
                    <p className="text-[10px] text-white/30">
                      {v.name} · {formatBytes(v.size)}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <a
                        href={v.url}
                        download={`${v.name}.mp4`}
                        className="text-[10px] text-[#a8d5b8]/60 hover:text-[#a8d5b8] transition-colors"
                      >
                        Download
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.origin + v.url);
                        }}
                        className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                      >
                        Link kopieren
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

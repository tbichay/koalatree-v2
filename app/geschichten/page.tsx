"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavBar from "../components/NavBar";
import AudioPlayer from "../components/AudioPlayer";
import { STORY_FORMATE, PAEDAGOGISCHE_ZIELE, StoryFormat, PaedagogischesZiel } from "@/lib/types";

interface GeschichteWithProfil {
  id: string;
  format: string;
  ziel: string;
  besonderesThema?: string;
  titel?: string;
  text: string;
  audioUrl?: string;
  zusammenfassung?: string;
  createdAt: string;
  kindProfil: {
    name: string;
    alter: number;
    geschlecht?: string;
  };
}

type SortBy = "newest" | "oldest" | "name";

export default function GeschichtenPage() {
  const router = useRouter();
  const [geschichten, setGeschichten] = useState<GeschichteWithProfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingAudioId, setGeneratingAudioId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  useEffect(() => {
    fetch("/api/geschichten")
      .then((res) => res.json())
      .then(setGeschichten)
      .finally(() => setLoading(false));
  }, []);

  // Get unique child names for filter
  const kindNames = useMemo(
    () => [...new Set(geschichten.map((g) => g.kindProfil.name))],
    [geschichten]
  );

  // Get unique formats for filter
  const usedFormats = useMemo(
    () => [...new Set(geschichten.map((g) => g.format))],
    [geschichten]
  );

  // Filter & sort
  const filtered = useMemo(() => {
    let result = [...geschichten];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          (g.titel?.toLowerCase().includes(q)) ||
          g.kindProfil.name.toLowerCase().includes(q) ||
          g.text.toLowerCase().includes(q) ||
          g.besonderesThema?.toLowerCase().includes(q)
      );
    }

    // Filter by child
    if (filterKind !== "all") {
      result = result.filter((g) => g.kindProfil.name === filterKind);
    }

    // Filter by format
    if (filterFormat !== "all") {
      result = result.filter((g) => g.format === filterFormat);
    }

    // Sort
    if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === "name") {
      result.sort((a, b) => (a.titel || "").localeCompare(b.titel || ""));
    }

    return result;
  }, [geschichten, search, filterKind, filterFormat, sortBy]);

  const hasPlayableAudio = (url?: string) =>
    url && url !== "local" && url.length > 10;

  const regenerateAudio = async (g: GeschichteWithProfil) => {
    setGeneratingAudioId(g.id);
    try {
      const response = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: g.text, geschichteId: g.id }),
      });
      if (!response.ok) throw new Error("Audio-Fehler");
      const data = await response.json();
      setGeschichten((prev) =>
        prev.map((story) =>
          story.id === g.id ? { ...story, audioUrl: data.audioUrl } : story
        )
      );
    } catch (err) {
      console.error("Audio regeneration failed:", err);
    } finally {
      setGeneratingAudioId(null);
    }
  };

  const getTitle = (g: GeschichteWithProfil) => {
    if (g.titel) return g.titel;
    const formatInfo = STORY_FORMATE[g.format as StoryFormat];
    return `${formatInfo?.label || g.format} für ${g.kindProfil.name}`;
  };

  const cleanText = (text: string) =>
    text
      .replace(/\[(?:ATEMPAUSE|PAUSE|LANGSAM|DANKBARKEIT|KOALA|KODA|KIKI)\]/g, "")
      .replace(/\[SFX:[^\]]+\]/g, "")
      .trim();

  if (loading) {
    return (
      <>
        <NavBar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-white/40">Geschichten werden geladen...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main className="relative flex-1 flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-2xl">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Bibliothek</h1>
            <span className="text-white/30 text-sm">{geschichten.length} Geschichten</span>
          </div>

          {geschichten.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="mx-auto mb-4 w-32 h-32 relative">
                <Image src="/koda-welcome.png" alt="Koda" fill className="object-contain rounded-2xl" />
              </div>
              <p className="text-white/50 text-lg mb-4">Noch keine Geschichten</p>
              <p className="text-white/40 text-sm mb-6">
                Koda wartet gespannt darauf, dir eine Geschichte zu erzählen!
              </p>
              <button className="btn-primary" onClick={() => router.push("/dashboard")}>
                Erste Geschichte erstellen
              </button>
            </div>
          ) : (
            <>
              {/* Search & Filters */}
              <div className="space-y-3 mb-6">
                {/* Search */}
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Suche nach Titel, Name, Thema..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#4a7c59]/50 transition-colors"
                  />
                </div>

                {/* Filter row */}
                <div className="flex gap-2 flex-wrap">
                  {/* Kind filter */}
                  {kindNames.length > 1 && (
                    <select
                      value={filterKind}
                      onChange={(e) => setFilterKind(e.target.value)}
                      className="w-auto text-xs"
                    >
                      <option value="all">Alle Kinder</option>
                      {kindNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}

                  {/* Format filter */}
                  <select
                    value={filterFormat}
                    onChange={(e) => setFilterFormat(e.target.value)}
                    className="w-auto text-xs"
                  >
                    <option value="all">Alle Formate</option>
                    {usedFormats.map((f) => {
                      const info = STORY_FORMATE[f as StoryFormat];
                      return (
                        <option key={f} value={f}>{info?.emoji} {info?.label || f}</option>
                      );
                    })}
                  </select>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="w-auto text-xs ml-auto"
                  >
                    <option value="newest">Neueste zuerst</option>
                    <option value="oldest">Älteste zuerst</option>
                    <option value="name">Nach Titel</option>
                  </select>
                </div>
              </div>

              {/* Results count */}
              {(search || filterKind !== "all" || filterFormat !== "all") && (
                <p className="text-white/30 text-xs mb-3">
                  {filtered.length} von {geschichten.length} Geschichten
                </p>
              )}

              {/* Story list */}
              <div className="space-y-2">
                {filtered.map((g) => {
                  const formatInfo = STORY_FORMATE[g.format as StoryFormat];
                  const zielInfo = PAEDAGOGISCHE_ZIELE[g.ziel as PaedagogischesZiel];
                  const isExpanded = expandedId === g.id;
                  const title = getTitle(g);
                  const playable = hasPlayableAudio(g.audioUrl);

                  return (
                    <div key={g.id} className="card overflow-hidden">
                      {/* Header: Title + Meta — always visible */}
                      <div className="p-4 pb-2">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-base shrink-0">
                            {formatInfo?.emoji || "📖"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-[#f5eed6] text-sm leading-tight">
                              {title}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-white/35">
                              <span>{g.kindProfil.name}</span>
                              <span>·</span>
                              <span>{formatInfo?.label}</span>
                              <span>·</span>
                              <span>{new Date(g.createdAt).toLocaleDateString("de-DE")}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Player — always visible at title level */}
                      <div className="px-4 pb-3">
                        {generatingAudioId === g.id ? (
                          <div className="flex items-center gap-3 py-2">
                            <div className="flex gap-1 items-end h-5">
                              {[0, 1, 2, 3, 4].map((i) => (
                                <div
                                  key={i}
                                  className="w-1 bg-[#4a7c59] rounded-full animate-pulse"
                                  style={{
                                    height: `${8 + Math.random() * 12}px`,
                                    animationDelay: `${i * 0.15}s`,
                                    animationDuration: "0.8s",
                                  }}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-white/50">
                              Koda und Kiki erzeugen das Hörspiel... das kann bis zu einer Minute dauern
                            </span>
                          </div>
                        ) : playable ? (
                          <AudioPlayer
                            audioUrl={g.audioUrl!}
                            title={title}
                            compact
                          />
                        ) : (
                          <button
                            className="w-full btn-primary text-sm py-2"
                            onClick={() => regenerateAudio(g)}
                          >
                            🎧 Audio-Hörspiel erzeugen
                          </button>
                        )}
                      </div>

                      {/* Expand toggle — text + actions */}
                      <div className="px-4 pb-3 flex items-center gap-3 border-t border-white/5 pt-2">
                        <button
                          className="text-xs text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
                          onClick={() => setExpandedId(isExpanded ? null : g.id)}
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          {isExpanded ? "Text ausblenden" : "Text lesen"}
                        </button>

                        <span className="text-white/10">·</span>

                        <button
                          className="text-xs text-white/30 hover:text-white/50 transition-colors"
                          onClick={() => router.push(`/story/result?id=${g.id}`)}
                        >
                          Vollansicht
                        </button>

                        {playable && (
                          <a
                            href={g.audioUrl!}
                            download={`${title.replace(/[^a-zA-ZäöüÄÖÜß0-9 ]/g, "").trim()}.wav`}
                            className="text-xs text-white/30 hover:text-white/50 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Download
                          </a>
                        )}

                        <button
                          className="text-xs text-white/30 hover:text-white/50 transition-colors ml-auto disabled:opacity-40"
                          disabled={generatingAudioId === g.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            regenerateAudio(g);
                          }}
                        >
                          {generatingAudioId === g.id ? "Audio wird erzeugt..." : "Audio neu erzeugen"}
                        </button>
                      </div>

                      {/* Expanded: Text + meta */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
                          {/* Meta tags */}
                          <div className="flex items-center gap-2 flex-wrap pt-3">
                            <span className="px-2 py-0.5 bg-white/5 rounded text-xs text-white/40">
                              {zielInfo?.emoji} {zielInfo?.label}
                            </span>
                            {g.besonderesThema && (
                              <span className="px-2 py-0.5 bg-white/5 rounded text-xs text-white/40">
                                {g.besonderesThema}
                              </span>
                            )}
                          </div>

                          {/* Story text */}
                          <div className="text-sm text-white/60 leading-relaxed max-h-72 overflow-y-auto pr-2">
                            {cleanText(g.text)
                              .split("\n\n")
                              .map((p, i) => (
                                <p key={i} className="mb-2">{p}</p>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 && geschichten.length > 0 && (
                <div className="text-center py-12">
                  <p className="text-white/30 text-sm">Keine Geschichten gefunden</p>
                  <button
                    className="text-xs text-[#a8d5b8] mt-2"
                    onClick={() => { setSearch(""); setFilterKind("all"); setFilterFormat("all"); }}
                  >
                    Filter zurücksetzen
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import StoryVisualPlayer from "../components/StoryVisualPlayer";
import QueuePlayer, { QueueItem } from "../components/QueuePlayer";
import StoryCard from "../components/StoryCard";
import { STORY_FORMATE, PAEDAGOGISCHE_ZIELE, StoryFormat, PaedagogischesZiel } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import { SkeletonStoryCard } from "../components/Skeleton";
import PageTransition from "../components/PageTransition";

interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

interface GeschichteWithProfil {
  id: string;
  format: string;
  ziel: string;
  besonderesThema?: string;
  titel?: string;
  text: string;
  audioUrl?: string;
  audioDauerSek?: number;
  zusammenfassung?: string;
  timeline?: TimelineEntry[];
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
  const { activeProfile } = useProfile();
  const [geschichten, setGeschichten] = useState<GeschichteWithProfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [generatingAudioId, setGeneratingAudioId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [welcomeTimeline, setWelcomeTimeline] = useState<TimelineEntry[]>([]);
  const [hasWelcome, setHasWelcome] = useState(false);
  const [playingWelcome, setPlayingWelcome] = useState(false);

  // Welcome-Story Timeline laden
  useEffect(() => {
    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => {
        if (d.hasAudio) {
          setHasWelcome(true);
          fetch("/api/audio/onboarding/timeline")
            .then((r) => r.ok ? r.json() : [])
            .then((tl) => setWelcomeTimeline(Array.isArray(tl) ? tl : []))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/geschichten")
      .then((res) => res.json())
      .then(setGeschichten)
      .finally(() => setLoading(false));
  }, []);

  const kindNames = useMemo(
    () => [...new Set(geschichten.map((g) => g.kindProfil.name))],
    [geschichten]
  );

  // Profil-Wechsel → Filter automatisch anpassen
  useEffect(() => {
    if (activeProfile && kindNames.includes(activeProfile.name)) {
      setFilterKind(activeProfile.name);
    }
  }, [activeProfile?.id, kindNames]);

  const usedFormats = useMemo(
    () => [...new Set(geschichten.map((g) => g.format))],
    [geschichten]
  );

  const filtered = useMemo(() => {
    let result = [...geschichten];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.titel?.toLowerCase().includes(q) ||
          g.kindProfil.name.toLowerCase().includes(q) ||
          g.text.toLowerCase().includes(q) ||
          g.besonderesThema?.toLowerCase().includes(q)
      );
    }

    if (filterKind !== "all") {
      result = result.filter((g) => g.kindProfil.name === filterKind);
    }

    if (filterFormat !== "all") {
      result = result.filter((g) => g.format === filterFormat);
    }

    if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === "name") {
      result.sort((a, b) => (a.titel || "").localeCompare(b.titel || ""));
    }

    return result;
  }, [geschichten, search, filterKind, filterFormat, sortBy]);

  const activeStory = geschichten.find((g) => g.id === activeStoryId) || null;

  const hasPlayableAudio = (url?: string) =>
    url && url !== "local" && url.length > 10;

  const getTitle = useCallback((g: GeschichteWithProfil) => {
    if (g.titel) return g.titel;
    const formatInfo = STORY_FORMATE[g.format as StoryFormat];
    return `${formatInfo?.label || g.format} für ${g.kindProfil.name}`;
  }, []);

  const playStory = (g: GeschichteWithProfil) => {
    if (!hasPlayableAudio(g.audioUrl)) {
      regenerateAudio(g);
      return;
    }
    setActiveStoryId(g.id);
    setPlayingWelcome(false); // Welcome-Story stoppen wenn andere Story gewählt
    setAutoPlay(true);
    // Scroll zum Player nach kurzer Verzögerung (DOM braucht Zeit)
    setTimeout(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const regenerateAudio = async (g: GeschichteWithProfil) => {
    setGeneratingAudioId(g.id);
    setAudioError(null);
    try {
      const response = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: g.text, geschichteId: g.id }),
      });
      const data = await response.json().catch(() => ({ error: "Server-Fehler" }));
      if (!response.ok) throw new Error(data.error || "Audio-Fehler");
      setGeschichten((prev) =>
        prev.map((story) =>
          story.id === g.id ? { ...story, audioUrl: data.audioUrl, timeline: data.timeline } : story
        )
      );
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "Audio-Generierung fehlgeschlagen");
    } finally {
      setGeneratingAudioId(null);
    }
  };

  const addToQueue = (g: GeschichteWithProfil) => {
    if (!hasPlayableAudio(g.audioUrl) || queue.some((q) => q.id === g.id)) return;
    setQueue((prev) => [
      ...prev,
      { id: g.id, title: getTitle(g), audioUrl: g.audioUrl!, kindName: g.kindProfil.name, timeline: g.timeline, audioDauerSek: g.audioDauerSek },
    ]);
  };

  const addAllToQueue = () => {
    const playable = filtered.filter((g) => hasPlayableAudio(g.audioUrl));
    const newItems = playable
      .filter((g) => !queue.some((q) => q.id === g.id))
      .map((g) => ({ id: g.id, title: getTitle(g), audioUrl: g.audioUrl!, kindName: g.kindProfil.name, timeline: g.timeline, audioDauerSek: g.audioDauerSek }));
    setQueue((prev) => [...prev, ...newItems]);
  };

  const shareStory = async (g: GeschichteWithProfil) => {
    try {
      const res = await fetch(`/api/geschichten/${g.id}/share`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        // Try native share, fallback to clipboard
        if (navigator.share) {
          await navigator.share({
            title: getTitle(g),
            text: g.zusammenfassung || `Eine Geschichte für ${g.kindProfil.name}`,
            url: data.url,
          });
        } else {
          await navigator.clipboard.writeText(data.url);
          // Brief visual feedback
          setAudioError(null);
          alert("Link kopiert!");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  };

  const deleteGeschichte = async (g: GeschichteWithProfil) => {
    const title = getTitle(g);
    if (!confirm(`"${title}" wirklich löschen?`)) return;
    setDeletingId(g.id);
    try {
      const res = await fetch(`/api/geschichten/${g.id}`, { method: "DELETE" });
      if (res.ok) {
        setGeschichten((prev) => prev.filter((s) => s.id !== g.id));
        setQueue((prev) => prev.filter((q) => q.id !== g.id));
        if (activeStoryId === g.id) setActiveStoryId(null);
      } else {
        const data = await res.json().catch(() => ({ error: "Fehler" }));
        setAudioError(data.error || "Löschen fehlgeschlagen");
      }
    } catch {
      setAudioError("Netzwerk-Fehler beim Löschen");
    }
    setDeletingId(null);
  };

  // Loading state
  if (loading) {
    return (
      <main className="relative flex-1 flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <div className="h-7 w-32 rounded bg-white/5 shimmer" />
            <div className="h-4 w-20 rounded bg-white/5 shimmer" />
          </div>
          <div className="space-y-2">
            <SkeletonStoryCard />
            <SkeletonStoryCard />
            <SkeletonStoryCard />
          </div>
        </div>
      </main>
    );
  }

  const activeFormat = activeStory ? STORY_FORMATE[activeStory.format as StoryFormat] : null;
  const activeZiel = activeStory ? PAEDAGOGISCHE_ZIELE[activeStory.ziel as PaedagogischesZiel] : null;

  return (
    <>
      <PageTransition>
        <main className="relative flex-1 flex flex-col items-center px-4 py-6 pb-28 sm:pb-6">
          <div className="w-full max-w-5xl">

            {/* ═══ Active Player Section (Welcome or User Story) ═══ */}
            {playingWelcome && hasWelcome && welcomeTimeline.length > 0 && (
              <div className="mb-8" ref={playerRef}>
                <StoryVisualPlayer
                  key="welcome"
                  audioUrl="/api/audio/onboarding"
                  timeline={welcomeTimeline}
                  title="Willkommen am KoalaTree!"
                  autoPlay={autoPlay}
                  onEnded={() => setPlayingWelcome(false)}
                />
                <div className="mt-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#d4a853]/20 text-[#d4a853] rounded text-[10px] font-medium">Einführung</span>
                    <h2 className="text-lg font-semibold text-[#f5eed6]">Willkommen am KoalaTree!</h2>
                  </div>
                  <p className="text-sm text-white/60 mt-1">Koda und seine Freunde stellen sich vor</p>
                </div>
              </div>
            )}
            {!playingWelcome && activeStory && hasPlayableAudio(activeStory.audioUrl) && (
              <div className="mb-8" ref={playerRef}>
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Player */}
                  <div className="flex-1 min-w-0">
                    {activeStory.timeline && activeStory.timeline.length > 0 ? (
                      <StoryVisualPlayer
                        key={activeStory.id}
                        audioUrl={activeStory.audioUrl!}
                        timeline={activeStory.timeline}
                        title={getTitle(activeStory)}
                        knownDuration={activeStory.audioDauerSek}
                        autoPlay={autoPlay}
                        onShare={() => shareStory(activeStory)}
                        onEnded={() => {
                          setAutoPlay(true); // Nächste Story auch auto-play
                          // Auto-play nächste in der Queue oder nächste gefilterte Story
                          const currentIdx = filtered.findIndex((g) => g.id === activeStoryId);
                          const next = filtered.slice(currentIdx + 1).find((g) => hasPlayableAudio(g.audioUrl));
                          if (next) setActiveStoryId(next.id);
                        }}
                      />
                    ) : (
                      <div className="card p-6 text-center">
                        <p className="text-white/60 text-sm">Kein Timeline vorhanden</p>
                        <button
                          className="btn-primary text-sm mt-3"
                          onClick={() => regenerateAudio(activeStory)}
                        >
                          Audio neu erzeugen
                        </button>
                      </div>
                    )}

                    {/* Story info under player */}
                    <div className="mt-3 px-1">
                      <h2 className="text-lg font-semibold text-[#f5eed6]">
                        {getTitle(activeStory)}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 text-xs text-white/35 flex-wrap">
                        <span>{activeStory.kindProfil.name}</span>
                        <span>·</span>
                        <span>{activeFormat?.emoji} {activeFormat?.label}</span>
                        <span>·</span>
                        <span>{activeZiel?.emoji} {activeZiel?.label}</span>
                        <span>·</span>
                        <span>{new Date(activeStory.createdAt).toLocaleDateString("de-DE")}</span>
                      </div>
                      {activeStory.zusammenfassung && (
                        <p className="text-sm text-white/60 mt-2 leading-relaxed">
                          {activeStory.zusammenfassung}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          className="text-xs text-white/50 hover:text-white/80 transition-colors"
                          onClick={() => router.push(`/story/result?id=${activeStory.id}`)}
                        >
                          Vollansicht
                        </button>
                        <button
                          className="text-xs text-white/50 hover:text-white/80 transition-colors"
                          onClick={() => addToQueue(activeStory)}
                          disabled={queue.some((q) => q.id === activeStory.id)}
                        >
                          {queue.some((q) => q.id === activeStory.id) ? "In Queue" : "+ Zur Queue"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Queue sidebar (Desktop) */}
                  {queue.length > 0 && (
                    <div className="hidden lg:block w-72 shrink-0">
                      <div className="card overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                          <h3 className="text-sm font-medium text-[#f5eed6]">
                            Warteschlange ({queue.length})
                          </h3>
                          <button
                            className="text-xs text-white/30 hover:text-red-400/60 transition-colors"
                            onClick={() => setQueue([])}
                          >
                            Leeren
                          </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                          {queue.map((item, idx) => (
                            <div
                              key={item.id}
                              className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors ${
                                activeStoryId === item.id
                                  ? "bg-[#3d6b4a]/15 border-l-2 border-[#4a7c59]"
                                  : "border-l-2 border-transparent hover:bg-white/[0.03]"
                              }`}
                              onClick={() => setActiveStoryId(item.id)}
                            >
                              <span className="text-[10px] text-white/20 w-4 text-center shrink-0">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/60 truncate">{item.title}</p>
                                <p className="text-[10px] text-white/25">{item.kindName}</p>
                              </div>
                              <button
                                className="text-white/50 hover:text-red-400/70 transition-colors shrink-0"
                                onClick={(e) => { e.stopPropagation(); setQueue((q) => q.filter((i) => i.id !== item.id)); }}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ Header ═══ */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold">
                {activeStory ? "Weitere Geschichten" : "Bibliothek"}
              </h1>
              <div className="flex items-center gap-3">
                {filtered.some((g) => hasPlayableAudio(g.audioUrl)) && (
                  <button
                    className="text-xs text-[#a8d5b8]/60 hover:text-[#a8d5b8] transition-colors flex items-center gap-1"
                    onClick={addAllToQueue}
                  >
                    Alle zur Queue
                  </button>
                )}
                <span className="text-white/30 text-sm">{geschichten.length} Geschichten</span>
              </div>
            </div>

            {geschichten.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="mx-auto mb-4 w-32 h-32 relative">
                  <Image src="/api/images/koda-waving.png" alt="Koda" fill className="object-contain rounded-2xl" unoptimized />
                </div>
                <p className="text-white/50 text-lg mb-4">Noch keine Geschichten</p>
                <p className="text-white/60 text-sm mb-6">
                  Koda wartet gespannt darauf, dir eine Geschichte zu erzählen!
                </p>
                <button className="btn-primary" onClick={() => router.push("/dashboard")}>
                  Erste Geschichte erstellen
                </button>
              </div>
            ) : (
              <>
                {/* ═══ Search & Filters ═══ */}
                <div className="space-y-3 mb-4">
                  <div className="relative flex items-center">
                    <svg className="absolute left-3.5 w-4 h-4 text-white/60 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Suche nach Titel, Name, Thema..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#4a7c59]/50 transition-colors"
                    />
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {kindNames.length > 1 && (
                      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                        <button
                          className={`chip whitespace-nowrap ${filterKind === "all" ? "chip-selected" : ""}`}
                          onClick={() => setFilterKind("all")}
                        >
                          Alle
                        </button>
                        {kindNames.map((name) => (
                          <button
                            key={name}
                            className={`chip whitespace-nowrap ${filterKind === name ? "chip-selected" : ""}`}
                            onClick={() => setFilterKind(name)}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}

                    <select
                      value={filterFormat}
                      onChange={(e) => setFilterFormat(e.target.value)}
                      className="w-auto text-xs"
                    >
                      <option value="all">Alle Formate</option>
                      {usedFormats.map((f) => {
                        const info = STORY_FORMATE[f as StoryFormat];
                        return <option key={f} value={f}>{info?.emoji} {info?.label || f}</option>;
                      })}
                    </select>

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

                {(search || filterKind !== "all" || filterFormat !== "all") && (
                  <p className="text-white/30 text-xs mb-3">
                    {filtered.length} von {geschichten.length} Geschichten
                  </p>
                )}

                {audioError && (
                  <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300 flex items-center justify-between">
                    <span>{audioError}</span>
                    <button onClick={() => setAudioError(null)} className="text-red-400 hover:text-red-200 ml-3 shrink-0">✕</button>
                  </div>
                )}

                {/* ═══ Story Cards (Grid auf Desktop, Liste auf Mobile) ═══ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {/* Angepinnte Welcome-Story */}
                  {hasWelcome && welcomeTimeline.length > 0 && (
                    <div
                      className={`group relative flex gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                        playingWelcome
                          ? "bg-[#d4a853]/10 border border-[#d4a853]/20"
                          : "bg-white/[0.04] border border-transparent hover:bg-white/[0.07] hover:border-white/[0.08]"
                      }`}
                      onClick={() => {
                        setPlayingWelcome(true);
                        setActiveStoryId(null);
                        setAutoPlay(true);
                        setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                      }}
                    >
                      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg bg-[#1a2e1a] overflow-hidden shrink-0 flex flex-wrap">
                        {[...new Set(welcomeTimeline.map(t => t.characterId))].slice(0, 6).map((charId) => {
                          const chars = [...new Set(welcomeTimeline.map(t => t.characterId))];
                          const cols = chars.length <= 4 ? 2 : 3;
                          const rows = Math.ceil(chars.length / cols);
                          const CHARS: Record<string, string> = {
                            koda: "/api/images/koda-portrait.png", kiki: "/api/images/kiki-portrait.png",
                            luna: "/api/images/luna-portrait.png", mika: "/api/images/mika-portrait.png",
                            pip: "/api/images/pip-portrait.png", sage: "/api/images/sage-portrait.png",
                            nuki: "/api/images/nuki-portrait.png",
                          };
                          return (
                            <div key={charId} className="relative overflow-hidden" style={{ width: `${100/cols}%`, height: `${100/rows}%` }}>
                              <Image src={CHARS[charId] || ""} alt={charId} fill className="object-cover" unoptimized />
                            </div>
                          );
                        })}
                        {playingWelcome && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="flex gap-0.5 items-end h-5">
                              {[0,1,2,3].map(i => <div key={i} className="w-1 bg-[#d4a853] rounded-full" style={{ animation: "equalizer 0.8s ease-in-out infinite alternate", animationDelay: `${i*0.15}s`, height: "60%" }} />)}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-[#d4a853]/20 text-[#d4a853] rounded text-[9px] font-medium shrink-0">Einführung</span>
                          <h3 className="font-medium text-[#f5eed6] text-sm truncate">Willkommen am KoalaTree!</h3>
                        </div>
                        <p className="text-xs text-white/35 mt-1">Koda und seine Freunde stellen sich vor</p>
                      </div>
                    </div>
                  )}

                  {filtered.map((g) => (
                    <StoryCard
                      key={g.id}
                      id={g.id}
                      titel={g.titel}
                      format={g.format}
                      zusammenfassung={g.zusammenfassung}
                      audioDauerSek={g.audioDauerSek}
                      audioUrl={g.audioUrl}
                      timeline={g.timeline}
                      kindName={g.kindProfil.name}
                      createdAt={g.createdAt}
                      isPlaying={activeStoryId === g.id}
                      isInQueue={queue.some((q) => q.id === g.id)}
                      onPlay={() => playStory(g)}
                      onAddToQueue={() => addToQueue(g)}
                      onOpenFullView={() => router.push(`/story/result?id=${g.id}`)}
                      onDelete={() => deleteGeschichte(g)}
                      onShare={hasPlayableAudio(g.audioUrl) ? () => shareStory(g) : undefined}
                      onDownload={hasPlayableAudio(g.audioUrl) ? () => {
                        const a = document.createElement("a");
                        a.href = g.audioUrl!;
                        a.download = `${getTitle(g).replace(/[^a-zA-ZäöüÄÖÜß0-9 ]/g, "").trim()}.wav`;
                        a.click();
                      } : undefined}
                    />
                  ))}
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

            {queue.length > 0 && <div className="h-24" />}
          </div>
        </main>
      </PageTransition>

      {/* Queue Player — sticky bottom */}
      <QueuePlayer
        queue={queue}
        onRemove={(id) => setQueue((prev) => prev.filter((q) => q.id !== id))}
        onClear={() => setQueue([])}
        onReorder={setQueue}
      />
    </>
  );
}

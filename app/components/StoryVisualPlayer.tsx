"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";

// --- Types ---

interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

interface Props {
  audioUrl: string;
  timeline: TimelineEntry[];
  title?: string;
  artwork?: string;
  onEnded?: () => void;
}

// --- Character data (matching lib/types.ts but client-safe) ---

const CHARACTERS: Record<string, { name: string; role: string; color: string; portrait: string; emoji: string }> = {
  koda:  { name: "Koda",  role: "Der Weise",        color: "#a8d5b8", portrait: "/api/images/koda-portrait.png",  emoji: "🐨" },
  kiki:  { name: "Kiki",  role: "Die Lustige",      color: "#e8c547", portrait: "/api/images/kiki-portrait.png",  emoji: "🐦" },
  luna:  { name: "Luna",  role: "Die Träumerin",     color: "#b8a9d4", portrait: "/api/images/luna-portrait.png",  emoji: "🦉" },
  mika:  { name: "Mika",  role: "Der Mutige",       color: "#d4884a", portrait: "/api/images/mika-portrait.png",  emoji: "🐕" },
  pip:   { name: "Pip",   role: "Der Entdecker",    color: "#6bb5c9", portrait: "/api/images/pip-portrait.png",   emoji: "🦫" },
  sage:  { name: "Sage",  role: "Der Stille",       color: "#8a9e7a", portrait: "/api/images/sage-portrait.png",  emoji: "🐻" },
  nuki:  { name: "Nuki",  role: "Der Sonnenschein", color: "#f0b85a", portrait: "/api/images/nuki-portrait.png",  emoji: "☀️" },
};

const SLEEP_OPTIONS = [
  { label: "15 Min", minutes: 15 },
  { label: "30 Min", minutes: 30 },
  { label: "45 Min", minutes: 45 },
  { label: "60 Min", minutes: 60 },
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

const AUDIO_PLAY_EVENT = "koalatree-audio-play";

export default function StoryVisualPlayer({ audioUrl, timeline, title, artwork, onEnded }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const instanceId = useRef(Math.random().toString(36).slice(2));

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0); // 0-100 percent buffered
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Derive unique characters in timeline order (for the dots)
  const timelineChars = (() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of timeline) {
      if (!seen.has(entry.characterId) && CHARACTERS[entry.characterId]) {
        seen.add(entry.characterId);
        result.push(entry.characterId);
      }
    }
    return result;
  })();

  const activeChar = activeCharId ? CHARACTERS[activeCharId] : null;

  // --- Media Session API ---
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "KoalaTree Geschichte",
      artist: activeChar ? `${activeChar.name} — KoalaTree` : "KoalaTree",
      album: "Hörspiele",
      artwork: [
        { src: artwork || activeChar?.portrait || "/api/images/koda-portrait.png", sizes: "512x512", type: "image/png" },
      ],
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    const audio = audioRef.current;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      audio.currentTime = Math.max(0, audio.currentTime - (d?.seekOffset || 15));
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d?.seekOffset || 15));
    });
    try {
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d?.seekTime != null) audio.currentTime = d.seekTime;
      });
    } catch {}
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
  }, [title, artwork, isPlaying, activeChar]);

  // Update position state for lockscreen
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio || !duration || !isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(currentTime, duration),
      });
    } catch {}
  }, [currentTime, duration]);

  // Pause when another player starts
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      if ((e as CustomEvent).detail !== instanceId.current) {
        audioRef.current?.pause();
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
  }, []);

  // Audio src change → reset state
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setDuration(0);
    setCurrentTime(0);
    setActiveCharId(null);
  }, [audioUrl]);

  // Audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoading(false);
      }
    };
    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoading(false);
      }
    };
    const onCanPlay = () => setIsLoading(false);
    const onProgress = () => {
      if (audio.buffered.length > 0 && audio.duration && isFinite(audio.duration)) {
        const end = audio.buffered.end(audio.buffered.length - 1);
        setBuffered((end / audio.duration) * 100);
      }
    };
    const onError = () => {
      console.error("[StoryVisualPlayer] Error:", audio.error?.code, audio.error?.message);
      setHasError(true);
      setIsLoading(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };
    const onPlay = () => {
      setIsPlaying(true);
      setHasError(false);
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: instanceId.current }));
    };
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioUrl, onEnded]);

  // --- Timeline sync via requestAnimationFrame ---
  useEffect(() => {
    if (!isPlaying || timeline.length === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const sync = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) { rafRef.current = null; return; }

      const timeMs = audio.currentTime * 1000;
      setCurrentTime(audio.currentTime);

      const entry = timeline.find((e) => timeMs >= e.startMs && timeMs < e.endMs);
      if (entry) {
        setActiveCharId(entry.characterId);
      }

      rafRef.current = requestAnimationFrame(sync);
    };

    rafRef.current = requestAnimationFrame(sync);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, timeline]);

  // Fallback: update currentTime when not using rAF (paused, no timeline)
  useEffect(() => {
    if (isPlaying && timeline.length > 0) return; // rAF handles it
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [isPlaying, timeline.length]);

  // --- Sleep Timer ---
  useEffect(() => {
    if (sleepTimer === null) {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
      setSleepRemaining(null);
      return;
    }
    let remaining = sleepTimer * 60;
    setSleepRemaining(remaining);
    sleepTimerRef.current = setInterval(() => {
      remaining -= 1;
      setSleepRemaining(remaining);
      if (remaining <= 0) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setSleepTimer(null);
        setSleepRemaining(null);
        if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
      }
    }, 1000);
    return () => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); };
  }, [sleepTimer]);

  // --- Actions ---
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (hasError) {
      setHasError(false);
      setIsLoading(true);
      audio.load();
      audio.play().catch((e) => console.error("[StoryVisualPlayer] Retry failed:", e));
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((e) => console.error("[StoryVisualPlayer] Play failed:", e));
    }
  }, [isPlaying, hasError]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || isLoading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  const skipBack = () => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
  };

  const skipForward = () => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
  };

  const changeSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    audio.playbackRate = next;
    setPlaybackRate(next);
  };

  // --- Formatting ---
  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  // --- Build mini-timeline segments for the colored progress bar ---
  const timelineSegments = duration > 0 ? timeline.map((entry) => {
    const char = CHARACTERS[entry.characterId];
    return {
      left: (entry.startMs / 1000 / duration) * 100,
      width: ((entry.endMs - entry.startMs) / 1000 / duration) * 100,
      color: char?.color || "#ffffff",
      charId: entry.characterId,
    };
  }) : [];

  return (
    <div className="card p-6 overflow-hidden">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Error banner */}
      {hasError && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300 flex items-center gap-2">
          <span>Audio konnte nicht geladen werden</span>
          <button onClick={togglePlay} className="text-red-200 hover:text-white text-xs underline ml-auto">
            Erneut versuchen
          </button>
        </div>
      )}

      {/* ═══ Visual Stage: Character Portrait ═══ */}
      <div className="relative flex flex-col items-center mb-6">
        {/* Glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl transition-all duration-1000 opacity-50"
          style={{ background: activeChar?.color || "#a8d5b8" }}
        />

        {/* Portrait */}
        <div
          className="relative w-28 h-28 md:w-36 md:h-36 rounded-3xl overflow-hidden border-2 transition-all duration-500"
          style={{
            borderColor: isPlaying ? `${activeChar?.color || "#a8d5b8"}80` : "rgba(255,255,255,0.1)",
            boxShadow: isPlaying ? `0 0 40px ${activeChar?.color || "#a8d5b8"}25` : "none",
          }}
        >
          {/* Render all character portraits stacked, fade active */}
          {timelineChars.map((charId) => {
            const char = CHARACTERS[charId];
            return (
              <div
                key={charId}
                className="absolute inset-0 transition-opacity duration-700"
                style={{ opacity: charId === activeCharId ? 1 : 0 }}
              >
                <Image
                  src={char.portrait}
                  alt={char.name}
                  fill
                  className="object-cover"
                  sizes="144px"
                  unoptimized
                />
              </div>
            );
          })}

          {/* Fallback when no active character (loading / no timeline match) */}
          {!activeCharId && timelineChars.length > 0 && (
            <div className="absolute inset-0">
              <Image
                src={CHARACTERS[timelineChars[0]].portrait}
                alt="Erzähler"
                fill
                className="object-cover"
                sizes="144px"
                unoptimized
              />
            </div>
          )}

          {/* Loading spinner overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            </div>
          )}

          {/* Speaking pulse */}
          {isPlaying && !isLoading && (
            <div
              className="absolute inset-0 rounded-3xl border-2 animate-pulse"
              style={{ borderColor: `${activeChar?.color || "#a8d5b8"}40` }}
            />
          )}
        </div>

        {/* Character name + role */}
        <div className="text-center mt-3 min-h-[3rem]">
          {activeChar ? (
            <>
              <p
                className="text-lg font-bold transition-colors duration-500 flex items-center justify-center gap-2"
                style={{ color: activeChar.color }}
              >
                {activeChar.name}
                {isPlaying && (
                  <span className="inline-flex gap-[2px] items-end h-3">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="inline-block w-[2px] rounded-full animate-eq"
                        style={{ backgroundColor: activeChar.color, animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                )}
              </p>
              <p className="text-xs text-white/40">{activeChar.role}</p>
            </>
          ) : (
            <p className="text-white/40 text-sm">
              {isLoading ? "Laden..." : title || "Geschichte"}
            </p>
          )}
        </div>

        {/* Character dots */}
        {timelineChars.length > 1 && (
          <div className="flex items-center gap-2 mt-2">
            {timelineChars.map((charId) => {
              const char = CHARACTERS[charId];
              const isActive = charId === activeCharId;
              return (
                <div
                  key={charId}
                  className={`w-7 h-7 rounded-full overflow-hidden border-[1.5px] transition-all duration-300 ${
                    isActive ? "scale-110 shadow-md" : "opacity-40 scale-90"
                  }`}
                  style={{
                    borderColor: isActive ? char.color : "rgba(255,255,255,0.15)",
                    boxShadow: isActive ? `0 0 12px ${char.color}30` : "none",
                  }}
                  title={char.name}
                >
                  <Image
                    src={char.portrait}
                    alt={char.name}
                    width={28}
                    height={28}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Title ═══ */}
      {title && <p className="text-sm text-white/50 text-center mb-3">{title}</p>}

      {/* ═══ Colored Timeline Progress Bar ═══ */}
      <div className="mb-1">
        {isLoading && !duration ? (
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full" />
          </div>
        ) : (
          <div className="relative h-2 bg-white/10 rounded-full cursor-pointer group" onClick={seek}>
            {/* Buffer progress (subtle light bar behind everything) */}
            {buffered > 0 && buffered < 99 && (
              <div
                className="absolute top-0 h-full rounded-full bg-white/[0.07] transition-all duration-500"
                style={{ width: `${buffered}%` }}
              />
            )}

            {/* Colored character segments (background layer) */}
            {timelineSegments.map((seg, i) => (
              <div
                key={i}
                className="absolute top-0 h-full rounded-full opacity-20"
                style={{
                  left: `${seg.left}%`,
                  width: `${seg.width}%`,
                  backgroundColor: seg.color,
                }}
              />
            ))}

            {/* Playback progress overlay */}
            <div
              className="absolute top-0 h-full rounded-full transition-all"
              style={{ width: `${progress}%` }}
            >
              {/* Colored fill matching segments up to current position */}
              <div className="relative h-full w-full rounded-full overflow-hidden">
                {timelineSegments.map((seg, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full"
                    style={{
                      left: `${(seg.left / progress) * 100}%`,
                      width: `${(seg.width / progress) * 100}%`,
                      backgroundColor: seg.color,
                      opacity: 0.85,
                    }}
                  />
                ))}
                {/* Fallback solid gradient if no segments in view */}
                {timelineSegments.length === 0 && (
                  <div className="h-full w-full bg-gradient-to-r from-[#3d6b4a] to-[#d4a853] rounded-full" />
                )}
              </div>
            </div>

            {/* Scrubber dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
        )}

        {/* Time */}
        <div className="flex justify-between text-xs text-white/40 mt-1">
          {isLoading && !duration ? (
            <>
              <span className="animate-pulse">
                {buffered > 0 ? `Laden... ${Math.round(buffered)}%` : "Laden..."}
              </span>
              <span />
            </>
          ) : (
            <>
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </>
          )}
        </div>
      </div>

      {/* ═══ Transport Controls ═══ */}
      <div className="flex items-center justify-center gap-4 mt-3">
        {/* -15s */}
        <button
          className="text-white/40 hover:text-white/60 transition-colors p-2"
          onClick={skipBack}
          aria-label="15 Sekunden zurück"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all text-2xl shrink-0 ${
            hasError
              ? "bg-red-500/20 hover:bg-red-500/30"
              : isPlaying
              ? "bg-[#3d6b4a]/40 ring-2 ring-[#4a7c59]/50"
              : "bg-[#3d6b4a]/20 hover:bg-[#3d6b4a]/30"
          }`}
          onClick={togglePlay}
        >
          {hasError ? (
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : isLoading && !isPlaying ? (
            <div className="w-6 h-6 border-2 border-white/20 border-t-[#a8d5b8] rounded-full animate-spin" />
          ) : isPlaying ? (
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* +15s */}
        <button
          className="text-white/40 hover:text-white/60 transition-colors p-2"
          onClick={skipForward}
          aria-label="15 Sekunden vorwärts"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>
      </div>

      {/* ═══ Bottom Controls ═══ */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Speed */}
          <button
            className="text-xs text-white/40 hover:text-white/60 transition-colors px-2 py-1 rounded bg-white/5"
            onClick={changeSpeed}
          >
            {playbackRate}x
          </button>

          {/* Sleep Timer */}
          <div className="relative">
            <button
              className="text-xs text-white/40 hover:text-white/60 transition-colors px-2 py-1 rounded bg-white/5"
              onClick={() => setShowSleepMenu(!showSleepMenu)}
            >
              {sleepRemaining !== null
                ? `Sleep ${formatTime(sleepRemaining)}`
                : "Sleep Timer"}
            </button>
            {showSleepMenu && (
              <div className="absolute bottom-full left-0 mb-2 bg-[#1a2e1a] border border-white/10 rounded-lg shadow-xl p-2 z-50">
                {SLEEP_OPTIONS.map((opt) => (
                  <button
                    key={opt.minutes}
                    className="block w-full text-left text-xs text-white/60 hover:text-white px-3 py-1.5 rounded hover:bg-white/5 transition-colors"
                    onClick={() => { setSleepTimer(opt.minutes); setShowSleepMenu(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
                {sleepTimer !== null && (
                  <button
                    className="block w-full text-left text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded hover:bg-white/5 transition-colors mt-1 border-t border-white/10 pt-1.5"
                    onClick={() => { setSleepTimer(null); setShowSleepMenu(false); }}
                  >
                    Abbrechen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Download */}
        <a
          href={audioUrl}
          download="koalatree-geschichte.wav"
          className="text-xs text-[#a8d5b8] hover:text-[#c8e5d0] transition-colors"
        >
          Herunterladen
        </a>
      </div>
    </div>
  );
}

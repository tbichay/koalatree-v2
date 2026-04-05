"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

const CHARACTERS: Record<string, { name: string; color: string; portrait: string }> = {
  koda:  { name: "Koda",  color: "#a8d5b8", portrait: "/api/images/koda-portrait.png" },
  kiki:  { name: "Kiki",  color: "#e8c547", portrait: "/api/images/kiki-portrait.png" },
  luna:  { name: "Luna",  color: "#b8a9d4", portrait: "/api/images/luna-portrait.png" },
  mika:  { name: "Mika",  color: "#d4884a", portrait: "/api/images/mika-portrait.png" },
  pip:   { name: "Pip",   color: "#6bb5c9", portrait: "/api/images/pip-portrait.png" },
  sage:  { name: "Sage",  color: "#8a9e7a", portrait: "/api/images/sage-portrait.png" },
  nuki:  { name: "Nuki",  color: "#f0b85a", portrait: "/api/images/nuki-portrait.png" },
};

export interface QueueItem {
  id: string;
  title: string;
  audioUrl: string;
  kindName: string;
  timeline?: Array<{ characterId: string; startMs: number; endMs: number }>;
  audioDauerSek?: number;
}

interface Props {
  queue: QueueItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onReorder: (queue: QueueItem[]) => void;
}

const SLEEP_OPTIONS = [
  { label: "15 Min", minutes: 15 },
  { label: "30 Min", minutes: 30 },
  { label: "45 Min", minutes: 45 },
  { label: "60 Min", minutes: 60 },
];

const AUDIO_PLAY_EVENT = "koalatree-audio-play";
const QUEUE_PLAYER_ID = "queue-player";

export default function QueuePlayer({ queue, onRemove, onClear, onReorder }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [fadingOut, setFadingOut] = useState(false);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const current = queue[currentIndex] || null;
  const activeChar = activeCharId ? CHARACTERS[activeCharId] : null;

  // Reset index if it's out of bounds
  useEffect(() => {
    if (currentIndex >= queue.length) {
      setCurrentIndex(Math.max(0, queue.length - 1));
    }
  }, [queue.length, currentIndex]);

  // Media Session API — Lockscreen + AirPods controls
  // Re-register handlers on every relevant state change so closures stay fresh
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: `KoalaTree — ${current.kindName}`,
      album: "Einschlaf-Warteschlange",
      artwork: [
        { src: "/api/images/koda-portrait.png", sizes: "512x512", type: "image/png" },
      ],
    });

    // Explicit playback state for iOS
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    const audio = audioRef.current;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", () => {
      audio.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audio.pause();
    });
    // Track skip buttons (iOS shows these instead of seek when both are set)
    // Always register so iOS lockscreen shows ⏮⏭ buttons
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
      } else if (currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      } else {
        audio.currentTime = 0;
      }
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      if (currentIndex < queue.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    });
    // Remove seek handlers so iOS prioritizes track buttons on lockscreen
    // Seeking still works via lockscreen progress bar scrubbing (seekto)
    navigator.mediaSession.setActionHandler("seekbackward", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    // Scrubbing on lockscreen
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details?.seekTime != null) {
          audio.currentTime = details.seekTime;
        }
      });
    } catch { /* seekto not supported on all browsers */ }

  }, [current, currentIndex, queue.length, isPlaying]);

  // Update position state for lockscreen progress bar
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio || !duration || !isFinite(duration)) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(currentTime, duration),
      });
    } catch { /* setPositionState not supported on all browsers */ }
  }, [currentTime, duration]);

  // Pause when another player starts
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== QUEUE_PLAYER_ID) {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          audio.pause();
        }
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
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
    const onError = () => {
      const err = audio.error;
      console.error("[QueuePlayer] Audio error:", err?.code, err?.message, current?.audioUrl);
      setHasError(true);
      setIsLoading(false);
    };
    const onPlay = () => {
      setIsPlaying(true);
      setHasError(false);
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: QUEUE_PLAYER_ID }));
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      // Auto-play next track
      if (currentIndex < queue.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsPlaying(false);
        setCurrentIndex(0);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentIndex, queue.length, current?.audioUrl]);

  // Auto-play when currentIndex changes (track advancement)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;

    // Reset state for new track
    setIsLoading(true);
    setHasError(false);
    setDuration(0);
    setCurrentTime(0);

    audio.src = current.audioUrl;
    audio.load();

    if (isPlaying || currentIndex > 0) {
      audio.play().catch((err) => {
        console.error("[QueuePlayer] Auto-play failed:", err);
      });
    }
  }, [currentIndex, current?.id]);

  // Timeline sync — wer spricht gerade
  useEffect(() => {
    if (!isPlaying || !current?.timeline?.length) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const timeline = current.timeline;
    const sync = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) { rafRef.current = null; return; }
      const timeMs = audio.currentTime * 1000;
      const entry = timeline.find((e) => timeMs >= e.startMs && timeMs < e.endMs);
      setActiveCharId(entry?.characterId || null);
      rafRef.current = requestAnimationFrame(sync);
    };
    rafRef.current = requestAnimationFrame(sync);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, current?.id, current?.timeline]);

  // Reset character when track changes
  useEffect(() => { setActiveCharId(null); }, [currentIndex]);

  // Sleep Timer
  useEffect(() => {
    if (sleepTimer === null) {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
      setSleepRemaining(null);
      setFadingOut(false);
      return;
    }

    let remaining = sleepTimer * 60;
    setSleepRemaining(remaining);

    sleepTimerRef.current = setInterval(() => {
      remaining -= 1;
      setSleepRemaining(remaining);

      // Fade out in last 30 seconds
      if (remaining <= 30 && remaining > 0) {
        setFadingOut(true);
        const audio = audioRef.current;
        if (audio) {
          audio.volume = remaining / 30;
        }
      }

      if (remaining <= 0) {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.volume = 1;
        }
        setIsPlaying(false);
        setFadingOut(false);
        setSleepTimer(null);
        setSleepRemaining(null);
        if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
      }
    }, 1000);

    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, [sleepTimer]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (hasError) {
      // Retry: reload and play
      setHasError(false);
      setIsLoading(true);
      audio.load();
      audio.play().catch((err) => {
        console.error("[QueuePlayer] Retry play failed:", err);
      });
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.error("[QueuePlayer] Play failed:", err);
      });
    }
  };

  const playNext = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const playPrevious = () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
    } else if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const playTrack = (index: number) => {
    setCurrentIndex(index);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || isLoading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newQueue = [...queue];
    [newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]];
    onReorder(newQueue);
    if (currentIndex === index) setCurrentIndex(index - 1);
    else if (currentIndex === index - 1) setCurrentIndex(index);
  };

  const moveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const newQueue = [...queue];
    [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
    onReorder(newQueue);
    if (currentIndex === index) setCurrentIndex(index + 1);
    else if (currentIndex === index + 1) setCurrentIndex(index);
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  if (queue.length === 0 || !current) return null;

  return (
    <>
      {/* Queue overlay */}
      {showQueue && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowQueue(false)}>
          <div
            className="absolute bottom-[88px] left-0 right-0 max-h-[60vh] bg-[#1a2e1a] border-t border-white/10 rounded-t-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-[#f5eed6]">
                Einschlaf-Warteschlange ({queue.length})
              </h3>
              <div className="flex items-center gap-3">
                <button
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  onClick={() => { onClear(); setShowQueue(false); }}
                >
                  Alle entfernen
                </button>
                <button
                  className="text-white/60 hover:text-white/80 transition-colors"
                  onClick={() => setShowQueue(false)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(60vh-52px)]">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    index === currentIndex
                      ? "bg-[#3d6b4a]/20 border-l-2 border-[#4a7c59]"
                      : "border-l-2 border-transparent hover:bg-white/5"
                  }`}
                >
                  {/* Track number / playing indicator */}
                  <button
                    className="w-6 text-center shrink-0"
                    onClick={() => playTrack(index)}
                  >
                    {index === currentIndex && isPlaying ? (
                      <div className="flex gap-0.5 items-end justify-center h-4">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-[#4a7c59] rounded-full animate-pulse"
                            style={{
                              height: `${6 + Math.random() * 10}px`,
                              animationDelay: `${i * 0.15}s`,
                              animationDuration: "0.8s",
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-white/30">{index + 1}</span>
                    )}
                  </button>

                  {/* Title */}
                  <div className="flex-1 min-w-0" onClick={() => playTrack(index)}>
                    <p className={`text-sm truncate cursor-pointer ${
                      index === currentIndex ? "text-[#a8d5b8] font-medium" : "text-white/60"
                    }`}>
                      {item.title}
                    </p>
                    <p className="text-xs text-white/25 truncate">{item.kindName}</p>
                  </div>

                  {/* Reorder + Remove */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1 text-white/50 hover:text-white/80 transition-colors disabled:opacity-20"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      className="p-1 text-white/50 hover:text-white/80 transition-colors disabled:opacity-20"
                      onClick={() => moveDown(index)}
                      disabled={index >= queue.length - 1}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      className="p-1 text-white/50 hover:text-red-400/60 transition-colors ml-1"
                      onClick={() => onRemove(item.id)}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom player */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f1f0f]/95 backdrop-blur-sm border-t border-white/10">
        <audio ref={audioRef} preload="metadata" />

        {/* Progress bar — full width, thin, at top of bar */}
        {isLoading && !duration ? (
          <div className="h-1 bg-white/5 overflow-hidden">
            <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        ) : (
          <div className="h-1 bg-white/5 cursor-pointer" onClick={seek}>
            <div
              className="h-full bg-gradient-to-r from-[#3d6b4a] to-[#d4a853] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-3">
          {/* Previous */}
          <button
            className="text-white/60 hover:text-white/80 transition-colors shrink-0"
            onClick={playPrevious}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-lg shrink-0 ${
              hasError
                ? "bg-red-500/20 hover:bg-red-500/30"
                : isPlaying
                ? "bg-[#3d6b4a]/50 ring-2 ring-[#4a7c59]/50"
                : "bg-[#3d6b4a]/30 hover:bg-[#3d6b4a]/50"
            }`}
            onClick={togglePlay}
          >
            {hasError ? (
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : isLoading && !isPlaying ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-[#a8d5b8] rounded-full animate-spin" />
            ) : isPlaying ? (
              <div className="flex gap-[3px] items-end h-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-[3px] bg-[#a8d5b8] rounded-full animate-eq"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            ) : "▶️"}
          </button>

          {/* Next */}
          <button
            className="text-white/60 hover:text-white/80 transition-colors shrink-0 disabled:opacity-30"
            onClick={playNext}
            disabled={currentIndex >= queue.length - 1}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Character portrait (wenn Timeline vorhanden) */}
          {activeChar && (
            <div
              className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition-colors"
              style={{ borderColor: activeChar.color }}
            >
              <Image
                src={activeChar.portrait}
                alt={activeChar.name}
                width={40}
                height={40}
                className="object-cover"
                unoptimized
              />
            </div>
          )}

          {/* Track info */}
          <div className="flex-1 min-w-0 mx-2">
            <p className="text-sm text-[#f5eed6] truncate font-medium">
              {activeChar && <span className="text-white/60">{activeChar.name} · </span>}
              {current.title}
            </p>
            <p className="text-xs text-white/30 truncate">
              {hasError ? (
                <span className="text-red-400/60">Fehler — tippen zum Erneut versuchen</span>
              ) : isLoading && !duration ? (
                <>{current.kindName} · <span className="animate-pulse">Laden...</span></>
              ) : (
                <>{current.kindName} · {formatTime(currentTime)} / {formatTime(duration)}</>
              )}
              {fadingOut && " · Einschlaf-Modus..."}
            </p>
          </div>

          {/* Sleep timer */}
          <div className="relative shrink-0">
            <button
              className={`text-xs px-2 py-1 rounded transition-colors ${
                sleepRemaining !== null
                  ? "text-[#d4a853] bg-[#d4a853]/10"
                  : "text-white/50 hover:text-white/80 bg-white/5"
              }`}
              onClick={() => setShowSleepMenu(!showSleepMenu)}
            >
              {sleepRemaining !== null ? formatTime(sleepRemaining) : "Sleep"}
            </button>

            {showSleepMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-[#1a2e1a] border border-white/10 rounded-lg shadow-xl p-2 z-50 min-w-[120px]">
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

          {/* Queue button */}
          <button
            className={`relative shrink-0 p-2 rounded transition-colors ${
              showQueue ? "text-[#a8d5b8] bg-white/5" : "text-white/50 hover:text-white/80"
            }`}
            onClick={() => setShowQueue(!showQueue)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10m-10 4h6" />
            </svg>
            {queue.length > 1 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#3d6b4a] text-[10px] rounded-full flex items-center justify-center text-white font-bold">
                {queue.length}
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

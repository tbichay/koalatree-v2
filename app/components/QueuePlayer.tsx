"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface QueueItem {
  id: string;
  title: string;
  audioUrl: string;
  kindName: string;
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

export default function QueuePlayer({ queue, onRemove, onClear, onReorder }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [fadingOut, setFadingOut] = useState(false);

  const current = queue[currentIndex] || null;

  // Reset index if it's out of bounds
  useEffect(() => {
    if (currentIndex >= queue.length) {
      setCurrentIndex(Math.max(0, queue.length - 1));
    }
  }, [queue.length, currentIndex]);

  // Media Session API
  const updateMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator) || !current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: `KoalaTree - ${current.kindName}`,
      album: "Einschlaf-Warteschlange",
      artwork: [
        { src: "/koda-portrait.png", sizes: "512x512", type: "image/png" },
      ],
    });

    const audio = audioRef.current;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevious());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNext());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      audio.currentTime = Math.max(0, audio.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
    });
  }, [current]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      updateMediaSession();
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      // Auto-play next track
      if (currentIndex < queue.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        // Will auto-play via the currentIndex effect below
      } else {
        setIsPlaying(false);
        setCurrentIndex(0);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentIndex, queue.length, updateMediaSession]);

  // Auto-play when currentIndex changes (track advancement)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;

    audio.src = current.audioUrl;
    audio.load();

    if (isPlaying || currentIndex > 0) {
      audio.play().catch(() => {});
    }
  }, [currentIndex, current?.id]);

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
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
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
    if (!audio || !duration) return;
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
                  className="text-white/40 hover:text-white/60 transition-colors"
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
                      className="p-1 text-white/20 hover:text-white/50 transition-colors disabled:opacity-20"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      className="p-1 text-white/20 hover:text-white/50 transition-colors disabled:opacity-20"
                      onClick={() => moveDown(index)}
                      disabled={index >= queue.length - 1}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      className="p-1 text-white/20 hover:text-red-400/60 transition-colors ml-1"
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
        <div className="h-1 bg-white/5 cursor-pointer" onClick={seek}>
          <div
            className="h-full bg-gradient-to-r from-[#3d6b4a] to-[#d4a853] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          {/* Previous */}
          <button
            className="text-white/40 hover:text-white/60 transition-colors shrink-0"
            onClick={playPrevious}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            className="w-10 h-10 rounded-full bg-[#3d6b4a]/30 hover:bg-[#3d6b4a]/50 flex items-center justify-center transition-all text-lg shrink-0"
            onClick={togglePlay}
          >
            {isPlaying ? "⏸" : "▶️"}
          </button>

          {/* Next */}
          <button
            className="text-white/40 hover:text-white/60 transition-colors shrink-0 disabled:opacity-30"
            onClick={playNext}
            disabled={currentIndex >= queue.length - 1}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Track info */}
          <div className="flex-1 min-w-0 mx-2">
            <p className="text-sm text-[#f5eed6] truncate font-medium">{current.title}</p>
            <p className="text-xs text-white/30 truncate">
              {current.kindName} · {formatTime(currentTime)} / {formatTime(duration)}
              {fadingOut && " · Einschlaf-Modus..."}
            </p>
          </div>

          {/* Sleep timer */}
          <div className="relative shrink-0">
            <button
              className={`text-xs px-2 py-1 rounded transition-colors ${
                sleepRemaining !== null
                  ? "text-[#d4a853] bg-[#d4a853]/10"
                  : "text-white/30 hover:text-white/50 bg-white/5"
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
              showQueue ? "text-[#a8d5b8] bg-white/5" : "text-white/30 hover:text-white/50"
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

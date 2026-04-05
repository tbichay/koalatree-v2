"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { CHARACTERS } from "@/lib/types";
import { HELP_CLIPS } from "@/lib/help-clips";

function getPortraitUrl(characterId: string): string {
  return `/api/images/${characterId}-portrait.png`;
}

interface Props {
  clipId: string;
  size?: "sm" | "md";
}

// Singleton: only one help clip plays at a time
let activeClipId: string | null = null;
const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((fn) => fn());
}

// Track which clips have been listened to (persisted in localStorage)
const LISTENED_KEY = "koalatree-help-listened";

function getListened(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const data = localStorage.getItem(LISTENED_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch { return new Set(); }
}

function markListened(clipId: string) {
  const set = getListened();
  set.add(clipId);
  localStorage.setItem(LISTENED_KEY, JSON.stringify([...set]));
}

export default function HelpAudio({ clipId, size = "sm" }: Props) {
  const clip = HELP_CLIPS[clipId];
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  // Check localStorage on mount
  useEffect(() => {
    setHasListened(getListened().has(clipId));
  }, [clipId]);

  // Close on click outside the expanded panel
  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: PointerEvent) {
      const target = e.target as Node;
      // Don't close if clicking inside the panel OR the icon button
      if (panelRef.current?.contains(target)) return;
      if (iconRef.current?.contains(target)) return;
      closePlayer();
    }
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClickOutside);
    }, 150);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (!clip) return null;
  const char = CHARACTERS[clip.characterId];
  if (!char) return null;

  const iconSize = size === "sm" ? 28 : 36;

  const closePlayer = () => {
    audioRef.current?.pause();
    setExpanded(false);
    setIsPlaying(false);
    activeClipId = null;
  };

  // Listen for other clips starting
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handleOther = () => {
      if (activeClipId !== clipId && isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    };
    listeners.add(handleOther);
    return () => { listeners.delete(handleOther); };
  }, [clipId, isPlaying]);

  // Sync playback state
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const sync = () => {
      setCurrentTime(audio.currentTime);
      if (!audio.paused) rafRef.current = requestAnimationFrame(sync);
    };

    const onPlay = () => { setIsPlaying(true); rafRef.current = requestAnimationFrame(sync); };
    const onPause = () => { setIsPlaying(false); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      activeClipId = null;
      markListened(clipId);
      setHasListened(true);
      // Auto-close after ended
      setExpanded(false);
    };
    const onLoaded = () => { setDuration(audio.duration); setLoading(false); };
    const onError = () => { setError(true); setLoading(false); };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [expanded, clipId]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      activeClipId = null;
    } else {
      activeClipId = clipId;
      notifyAll();
      window.dispatchEvent(new CustomEvent("koalatree:audio-singleton"));

      setLoading(true);
      try {
        await audio.play();
      } catch {
        setLoading(false);
      }
    }
  };

  const handleIconClick = () => {
    if (expanded) {
      closePlayer();
    } else {
      setExpanded(true);
      setError(false);
      setTimeout(() => togglePlay(), 100);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showPulse = !hasListened && !expanded && !isPlaying;

  return (
    <div className="inline-flex flex-col items-start relative">
      {/* Portrait Button */}
      <button
        ref={iconRef}
        onClick={handleIconClick}
        className="relative group z-20"
        title={clip.label}
      >
        <div
          className={`rounded-full overflow-hidden border-2 transition-all duration-300 ${
            isPlaying
              ? "scale-110 shadow-lg"
              : expanded
                ? "scale-105"
                : "hover:scale-105 opacity-70 hover:opacity-100"
          }`}
          style={{
            width: iconSize,
            height: iconSize,
            borderColor: isPlaying || expanded ? char.color : "rgba(255,255,255,0.15)",
            boxShadow: isPlaying ? `0 0 16px ${char.color}40` : "none",
          }}
        >
          <Image
            src={getPortraitUrl(clip.characterId)}
            alt={char.name}
            width={iconSize}
            height={iconSize}
            className="object-cover w-full h-full"
            unoptimized
          />
        </div>
        {/* Pulse ring — only until listened */}
        {showPulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ backgroundColor: char.color }}
          />
        )}
      </button>

      {/* Expanded Player with large portrait */}
      {expanded && (
        <div ref={panelRef} className="mt-2 w-64 rounded-2xl bg-[#1a2e1a] border border-white/10 shadow-2xl overflow-hidden z-10">
          <audio ref={audioRef} src={`/api/audio/help/${clipId}`} preload="auto" />

          {/* Large character portrait */}
          <div className="relative w-full h-40 bg-gradient-to-b from-black/20 to-[#1a2e1a]">
            <Image
              src={getPortraitUrl(clip.characterId)}
              alt={char.name}
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a2e1a] via-transparent to-transparent" />

            {/* Close button */}
            <button
              onClick={closePlayer}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white/60 hover:text-white flex items-center justify-center transition-colors z-30"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Speaking indicator */}
            {isPlaying && (
              <div className="absolute bottom-3 left-3 flex gap-[2px] items-end h-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block w-[3px] rounded-full animate-eq"
                    style={{ backgroundColor: char.color, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}

            {/* Character name overlay */}
            <div className="absolute bottom-3 right-3 text-right">
              <p className="text-sm font-bold drop-shadow-lg" style={{ color: char.color }}>{char.name}</p>
              <p className="text-[10px] text-white/50 drop-shadow">{char.role}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="px-4 py-3">
            <p className="text-xs text-white/40 mb-2">{clip.label}</p>

            {error ? (
              <p className="text-[10px] text-red-400/60 text-center py-1">Audio nicht verfügbar</p>
            ) : (
              <>
                {/* Progress bar */}
                <div
                  className="h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer mb-3"
                  onClick={(e) => {
                    const audio = audioRef.current;
                    if (!audio || !duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    audio.currentTime = pct * duration;
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{ width: `${progress}%`, backgroundColor: char.color }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                    style={{ backgroundColor: `${char.color}25`, color: char.color }}
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : isPlaying ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                    ) : (
                      <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                  <span className="text-[11px] text-white/30">
                    {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : "..."}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

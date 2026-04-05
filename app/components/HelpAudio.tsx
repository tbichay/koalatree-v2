"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { CHARACTERS } from "@/lib/types";
import { HELP_CLIPS } from "@/lib/help-clips";

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

export default function HelpAudio({ clipId, size = "sm" }: Props) {
  const clip = HELP_CLIPS[clipId];
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(undefined);

  if (!clip) return null;
  const char = CHARACTERS[clip.characterId];
  if (!char) return null;

  const iconSize = size === "sm" ? 28 : 36;

  // Listen for other clips starting
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
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const sync = () => {
      setCurrentTime(audio.currentTime);
      if (!audio.paused) rafRef.current = requestAnimationFrame(sync);
    };

    const onPlay = () => { setIsPlaying(true); rafRef.current = requestAnimationFrame(sync); };
    const onPause = () => { setIsPlaying(false); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); setExpanded(false); activeClipId = null; };
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
  }, [expanded]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      activeClipId = null;
    } else {
      // Stop other clips
      activeClipId = clipId;
      notifyAll();
      // Dispatch event to stop story players too
      window.dispatchEvent(new CustomEvent("koalatree:audio-singleton"));

      setLoading(true);
      try {
        await audio.play();
      } catch {
        setLoading(false);
      }
    }
  };

  const handleClick = () => {
    if (expanded) {
      togglePlay();
    } else {
      setExpanded(true);
      setError(false);
      // Auto-play after expand
      setTimeout(() => togglePlay(), 100);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="inline-flex flex-col items-start">
      {/* Portrait Button */}
      <button
        onClick={handleClick}
        className="relative group"
        title={clip.label}
      >
        <div
          className={`rounded-full overflow-hidden border-2 transition-all duration-300 ${
            isPlaying
              ? "scale-110 shadow-lg"
              : "hover:scale-105 opacity-70 hover:opacity-100"
          }`}
          style={{
            width: iconSize,
            height: iconSize,
            borderColor: isPlaying ? char.color : "rgba(255,255,255,0.15)",
            boxShadow: isPlaying ? `0 0 16px ${char.color}40` : "none",
          }}
        >
          <Image
            src={char.portrait}
            alt={char.name}
            width={iconSize}
            height={iconSize}
            className="object-cover w-full h-full"
            unoptimized
          />
        </div>
        {/* Pulse ring when not yet played */}
        {!expanded && !isPlaying && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ backgroundColor: char.color }}
          />
        )}
      </button>

      {/* Expanded Mini Player */}
      {expanded && (
        <div className="mt-2 w-56 rounded-xl bg-[#1a2e1a] border border-white/10 p-3 shadow-xl">
          <audio ref={audioRef} src={`/api/audio/help/${clipId}`} preload="auto" />

          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-full overflow-hidden border shrink-0"
              style={{ borderColor: `${char.color}60` }}
            >
              <Image src={char.portrait} alt={char.name} width={28} height={28} className="object-cover" unoptimized />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: char.color }}>{char.name}</p>
              <p className="text-[10px] text-white/30">{clip.label}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); audioRef.current?.pause(); activeClipId = null; }}
              className="text-white/20 hover:text-white/60 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error ? (
            <p className="text-[10px] text-red-400/60 text-center py-1">Audio nicht verfügbar</p>
          ) : (
            <>
              {/* Progress bar */}
              <div
                className="h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer mb-1.5"
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
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  style={{ backgroundColor: `${char.color}20`, color: char.color }}
                >
                  {loading ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                  ) : (
                    <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
                <span className="text-[10px] text-white/30">
                  {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : "..."}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

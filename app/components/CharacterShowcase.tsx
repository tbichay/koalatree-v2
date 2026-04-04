"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";

interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

const CHARACTERS = [
  {
    id: "koda",
    name: "Koda",
    role: "Der Weise",
    desc: "Euer Geschichtenerzähler — warm, geduldig und voller Liebe.",
    portrait: "/koda-portrait.png",
    color: "#a8d5b8",
    bgGlow: "rgba(168, 213, 184, 0.15)",
  },
  {
    id: "kiki",
    name: "Kiki",
    role: "Die Lustige",
    desc: "Der freche Kookaburra bringt Humor in jede Geschichte!",
    portrait: "/kiki-portrait.png",
    color: "#e8c547",
    bgGlow: "rgba(232, 197, 71, 0.15)",
  },
  {
    id: "luna",
    name: "Luna",
    role: "Die Träumerin",
    desc: "Sanfte Traumreisen und Meditationen zum Einschlafen.",
    portrait: "/luna-portrait.png",
    color: "#b8a0d5",
    bgGlow: "rgba(184, 160, 213, 0.15)",
  },
  {
    id: "mika",
    name: "Mika",
    role: "Der Mutige",
    desc: "Spannende Abenteuer und Herausforderungen meistern.",
    portrait: "/mika-portrait.png",
    color: "#d4884a",
    bgGlow: "rgba(212, 136, 74, 0.15)",
  },
  {
    id: "pip",
    name: "Pip",
    role: "Der Entdecker",
    desc: "Rätsel lösen und die Welt entdecken.",
    portrait: "/pip-portrait.png",
    color: "#6bb5c9",
    bgGlow: "rgba(107, 181, 201, 0.15)",
  },
  {
    id: "sage",
    name: "Sage",
    role: "Der Stille",
    desc: "Tiefe Gedanken und stille Reflexion.",
    portrait: "/sage-portrait.png",
    color: "#8a9e7a",
    bgGlow: "rgba(138, 158, 122, 0.15)",
  },
  {
    id: "nuki",
    name: "Nuki",
    role: "Der Sonnenschein",
    desc: "Das fröhlichste Quokka der Welt — Hakuna Matata!",
    portrait: "/nuki-portrait.png",
    color: "#f0b85a",
    bgGlow: "rgba(240, 184, 90, 0.15)",
  },
];

// Map character ID to CHARACTERS array index
const CHAR_INDEX: Record<string, number> = {};
CHARACTERS.forEach((c, i) => { CHAR_INDEX[c.id] = i; });

export default function CharacterShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);

  const active = CHARACTERS[activeIndex];

  // Fetch timeline on mount
  useEffect(() => {
    fetch("/api/audio/onboarding/timeline")
      .then((r) => r.json())
      .then((data: TimelineEntry[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setTimeline(data);
        }
      })
      .catch(() => {}); // Timeline not available yet — fallback to auto-rotate
  }, []);

  // Auto-rotate when NOT playing audio
  useEffect(() => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % CHARACTERS.length);
    }, 4000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying]);

  // Timeline sync: update active character based on audio.currentTime
  useEffect(() => {
    if (!isPlaying || timeline.length === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const syncLoop = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        rafRef.current = null;
        return;
      }

      const timeMs = audio.currentTime * 1000;
      setCurrentTime(audio.currentTime);

      // Find the active timeline entry
      const entry = timeline.find((e) => timeMs >= e.startMs && timeMs < e.endMs);
      if (entry) {
        const charIndex = CHAR_INDEX[entry.characterId];
        if (charIndex !== undefined) {
          setActiveIndex(charIndex);
        }
      }

      rafRef.current = requestAnimationFrame(syncLoop);
    };

    rafRef.current = requestAnimationFrame(syncLoop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, timeline]);

  const handleCharacterClick = useCallback((index: number) => {
    setActiveIndex(index);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const handlePlayDemo = useCallback(() => {
    setHasInteracted(true);
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative">
      {/* Hidden audio */}
      <audio
        ref={audioRef}
        src="/api/audio/onboarding"
        preload="none"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
      />

      {/* Main showcase area */}
      <div className="relative flex flex-col items-center">
        {/* Active character portrait — large, with glow */}
        <div className="relative mb-8">
          {/* Glow behind portrait */}
          <div
            className="absolute inset-0 rounded-full blur-3xl transition-all duration-1000"
            style={{ background: active.bgGlow, transform: "scale(1.5)" }}
          />

          {/* Portrait with speaking indicator */}
          <div
            className="relative w-36 h-36 md:w-48 md:h-48 rounded-3xl overflow-hidden border-2 transition-all duration-700"
            style={{
              borderColor: isPlaying ? `${active.color}80` : `${active.color}40`,
              boxShadow: isPlaying ? `0 0 40px ${active.color}25` : "none",
            }}
          >
            {CHARACTERS.map((char, i) => (
              <div
                key={char.id}
                className="absolute inset-0 transition-opacity duration-700"
                style={{ opacity: i === activeIndex ? 1 : 0 }}
              >
                <Image
                  src={char.portrait}
                  alt={char.name}
                  fill
                  className="object-cover"
                  sizes="192px"
                />
              </div>
            ))}

            {/* Speaking pulse ring */}
            {isPlaying && (
              <div
                className="absolute inset-0 rounded-3xl border-2 animate-pulse"
                style={{ borderColor: `${active.color}40` }}
              />
            )}
          </div>
        </div>

        {/* Name + Role */}
        <div className="text-center mb-2 min-h-[4.5rem]">
          <h3
            className="text-2xl md:text-3xl font-bold mb-1 transition-colors duration-500"
            style={{ color: active.color }}
          >
            {active.name}
            {isPlaying && (
              <span className="inline-flex gap-[2px] items-end h-4 ml-2 align-middle">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block w-[2px] rounded-full animate-eq"
                    style={{
                      backgroundColor: active.color,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </span>
            )}
          </h3>
          <p className="text-white/50 text-sm font-medium">{active.role}</p>
          <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto">{active.desc}</p>
        </div>

        {/* Character selector dots */}
        <div className="flex items-center gap-3 mt-6 mb-6">
          {CHARACTERS.map((char, i) => (
            <button
              key={char.id}
              onClick={() => handleCharacterClick(i)}
              className="relative group"
              aria-label={`${char.name} anzeigen`}
            >
              <div
                className={`w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden border-2 transition-all duration-300 ${
                  i === activeIndex
                    ? "scale-110 shadow-lg"
                    : "opacity-50 hover:opacity-80 scale-90"
                }`}
                style={{
                  borderColor: i === activeIndex ? char.color : "rgba(255,255,255,0.1)",
                  boxShadow: i === activeIndex ? `0 0 20px ${char.color}30` : "none",
                }}
              >
                <Image
                  src={char.portrait}
                  alt={char.name}
                  width={48}
                  height={48}
                  className="object-cover w-full h-full"
                />
              </div>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/40 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {char.name}
              </span>
            </button>
          ))}
        </div>

        {/* Progress bar (only when playing/played) */}
        {hasInteracted && duration > 0 && (
          <div className="w-full max-w-xs mb-4">
            <div
              className="h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const audio = audioRef.current;
                if (!audio || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                audio.currentTime = ratio * duration;
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${active.color}80, ${active.color})`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/30 mt-1 tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Play/Pause button */}
        <button
          onClick={handlePlayDemo}
          className="flex items-center gap-2 px-6 py-3 rounded-full transition-all duration-300 text-sm font-medium"
          style={{
            background: isPlaying
              ? `linear-gradient(135deg, ${active.color}30, ${active.color}15)`
              : "rgba(255,255,255,0.07)",
            border: `1px solid ${isPlaying ? `${active.color}50` : "rgba(255,255,255,0.1)"}`,
            color: isPlaying ? active.color : "rgba(255,255,255,0.6)",
          }}
        >
          {isPlaying ? (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              {hasInteracted ? "Weiter anhören" : "Hörprobe abspielen"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function formatTime(s: number) {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

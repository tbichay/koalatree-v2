"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  audioUrl: string;
  title?: string;
  compact?: boolean;
  artwork?: string;
}

const SLEEP_OPTIONS = [
  { label: "15 Min", minutes: 15 },
  { label: "30 Min", minutes: 30 },
  { label: "45 Min", minutes: 45 },
  { label: "60 Min", minutes: 60 },
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

export default function AudioPlayer({ audioUrl, title, compact = false, artwork }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Media Session API — Lockscreen-Controls
  const updateMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "KoalaTree Geschichte",
      artist: "KoalaTree",
      album: "Hörspiele",
      artwork: [
        { src: artwork || "/koda-portrait.png", sizes: "512x512", type: "image/png" },
      ],
    });

    const audio = audioRef.current;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", () => {
      audio.play();
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audio.pause();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      audio.currentTime = Math.max(0, audio.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
    });
  }, [title, artwork]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      updateMediaSession();
    };
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioUrl, updateMediaSession]);

  // Sleep Timer
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
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          setIsPlaying(false);
        }
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
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  const changeSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
    const nextRate = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const startSleepTimer = (minutes: number) => {
    setSleepTimer(minutes);
    setShowSleepMenu(false);
  };

  const cancelSleepTimer = () => {
    setSleepTimer(null);
    setShowSleepMenu(false);
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  // Compact mode — einzeiliger Mini-Player
  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2">
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
        <button
          className="w-9 h-9 rounded-full bg-[#3d6b4a]/20 hover:bg-[#3d6b4a]/30 flex items-center justify-center transition-all text-lg shrink-0"
          onClick={togglePlay}
        >
          {isPlaying ? "⏸" : "▶️"}
        </button>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-white/10 rounded-full cursor-pointer" onClick={seek}>
            <div
              className="h-full bg-gradient-to-r from-[#3d6b4a] to-[#d4a853] rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-white/40 shrink-0 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    );
  }

  // Full mode
  return (
    <div className="card p-6">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {title && <p className="text-sm text-white/50 mb-3">{title}</p>}

      <div className="flex items-center gap-4">
        {/* Play/Pause */}
        <button
          className="w-14 h-14 rounded-full bg-[#3d6b4a]/20 hover:bg-[#3d6b4a]/30 flex items-center justify-center transition-all text-2xl shrink-0"
          onClick={togglePlay}
        >
          {isPlaying ? "⏸" : "▶️"}
        </button>

        <div className="flex-1">
          {/* Progress bar */}
          <div
            className="h-2 bg-white/10 rounded-full cursor-pointer group"
            onClick={seek}
          >
            <div
              className="h-full bg-gradient-to-r from-[#3d6b4a] to-[#d4a853] rounded-full relative transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Time */}
          <div className="flex justify-between text-xs text-white/40 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Controls row */}
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
                    onClick={() => startSleepTimer(opt.minutes)}
                  >
                    {opt.label}
                  </button>
                ))}
                {sleepTimer !== null && (
                  <button
                    className="block w-full text-left text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded hover:bg-white/5 transition-colors mt-1 border-t border-white/10 pt-1.5"
                    onClick={cancelSleepTimer}
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

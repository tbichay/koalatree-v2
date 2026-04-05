"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  audioUrl: string;
  title?: string;
  compact?: boolean;
  artwork?: string;
  knownDuration?: number; // Pre-known duration in seconds (from DB), shown before audio loads
  onEnded?: () => void;
}

const SLEEP_OPTIONS = [
  { label: "15 Min", minutes: 15 },
  { label: "30 Min", minutes: 30 },
  { label: "45 Min", minutes: 45 },
  { label: "60 Min", minutes: 60 },
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

// Global: ensure only one audio plays at a time
const AUDIO_PLAY_EVENT = "koalatree-audio-play";

export default function AudioPlayer({ audioUrl, title, compact = false, artwork, knownDuration, onEnded }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const instanceId = useRef(Math.random().toString(36).slice(2));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration || 0);
  const [isLoading, setIsLoading] = useState(!knownDuration);
  const [buffered, setBuffered] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Media Session API — Lockscreen + AirPods controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "KoalaTree Geschichte",
      artist: "KoalaTree",
      album: "Hörspiele",
      artwork: [
        { src: artwork || "/api/images/koda-portrait.png", sizes: "512x512", type: "image/png" },
      ],
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    const audio = audioRef.current;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const offset = details?.seekOffset || 15;
      audio.currentTime = Math.max(0, audio.currentTime - offset);
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const offset = details?.seekOffset || 15;
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + offset);
    });
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details?.seekTime != null) audio.currentTime = details.seekTime;
      });
    } catch { /* seekto not supported everywhere */ }
    // No previoustrack/nexttrack for single-track player
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
  }, [title, artwork, isPlaying]);

  // Update position state for lockscreen progress bar
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
    } catch { /* not supported everywhere */ }
  }, [currentTime, duration]);

  // Pause when another player starts
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== instanceId.current) {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          audio.pause();
        }
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
  }, []);

  // Track whether user has initiated loading (for lazy-load in compact mode)
  const [userActivated, setUserActivated] = useState(!compact); // full mode loads immediately

  // Reset loading state when audioUrl changes
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setBuffered(0);
    setDuration(0);
    setCurrentTime(0);
    // In compact mode, don't auto-load — wait for user click
    if (compact) setUserActivated(false);
  }, [audioUrl, compact]);

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
    const onCanPlay = () => {
      setIsLoading(false);
    };
    const onProgress = () => {
      if (audio.buffered.length > 0 && audio.duration && isFinite(audio.duration)) {
        const end = audio.buffered.end(audio.buffered.length - 1);
        setBuffered((end / audio.duration) * 100);
      }
    };
    const onWaiting = () => {
      // Only set loading if we haven't loaded metadata yet
      if (!duration) setIsLoading(true);
    };
    const onError = () => {
      const err = audio.error;
      console.error("[AudioPlayer] Audio error:", err?.code, err?.message, audioUrl);
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
      // Notify other players to pause
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: instanceId.current }));
    };
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioUrl, onEnded, duration]);

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
    if (hasError) {
      // Retry: reload and play
      setHasError(false);
      setIsLoading(true);
      audio.load();
      audio.play().catch((err) => {
        console.error("[AudioPlayer] Play failed:", err);
      });
      return;
    }
    // First click in compact/lazy mode → set src and load
    if (!userActivated) {
      setUserActivated(true);
      setIsLoading(true);
      audio.src = audioUrl;
      audio.load();
      audio.play().catch((err) => {
        console.error("[AudioPlayer] First play failed:", err);
      });
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.error("[AudioPlayer] Play failed:", err);
      });
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || isLoading) return;
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
  const displayDuration = duration || knownDuration || 0;

  // Loading spinner (reused in compact and full mode)
  const LoadingSpinner = () => (
    <div className="w-4 h-4 border-2 border-white/20 border-t-[#a8d5b8] rounded-full animate-spin" />
  );

  // Compact mode — einzeiliger Mini-Player
  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2">
        <audio ref={audioRef} src={userActivated ? audioUrl : undefined} preload={userActivated ? "metadata" : "none"} />
        <button
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all text-lg shrink-0 ${
            hasError
              ? "bg-red-500/20 hover:bg-red-500/30"
              : isPlaying
              ? "bg-[#3d6b4a]/40 ring-2 ring-[#4a7c59]/50"
              : "bg-[#3d6b4a]/20 hover:bg-[#3d6b4a]/30"
          }`}
          onClick={togglePlay}
        >
          {hasError ? (
            <span className="text-red-400 text-xs">!</span>
          ) : userActivated && isLoading && !isPlaying ? (
            <LoadingSpinner />
          ) : isPlaying ? (
            <div className="flex gap-[3px] items-end h-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[3px] bg-[#a8d5b8] rounded-full animate-eq"
                  style={{
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>
          ) : "▶️"}
        </button>
        <div className="flex-1 min-w-0">
          {userActivated && isLoading && !duration && !isPlaying ? (
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              {buffered > 0 ? (
                <div
                  className="h-full bg-white/15 rounded-full transition-all duration-500"
                  style={{ width: `${buffered}%` }}
                />
              ) : (
                <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full animate-shimmer" />
              )}
            </div>
          ) : (
            <div className="h-1.5 bg-white/10 rounded-full cursor-pointer" onClick={seek}>
              <div
                className="h-full bg-gradient-to-r from-[#3d6b4a] to-[#d4a853] rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
        <span className="text-xs text-white/40 shrink-0 tabular-nums">
          {hasError ? (
            <span className="text-red-400/60">Fehler</span>
          ) : !userActivated && displayDuration ? (
            formatTime(displayDuration)
          ) : !userActivated ? (
            ""
          ) : isLoading && !duration ? (
            buffered > 0 ? `${Math.round(buffered)}%` : "Laden..."
          ) : (
            <>{formatTime(currentTime)} / {formatTime(displayDuration)}</>
          )}
        </span>
      </div>
    );
  }

  // Full mode
  return (
    <div className="card p-6">
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {title && <p className="text-sm text-white/50 mb-3">{title}</p>}

      {/* Error banner */}
      {hasError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300 flex items-center gap-2">
          <span>Audio konnte nicht geladen werden</span>
          <button onClick={togglePlay} className="text-red-200 hover:text-white text-xs underline ml-auto">
            Erneut versuchen
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
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
            <div className="flex gap-1 items-end h-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-[#a8d5b8] rounded-full animate-eq"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
          ) : "▶️"}
        </button>

        <div className="flex-1">
          {/* Progress bar */}
          {isLoading && !duration && !isPlaying ? (
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full animate-shimmer" />
            </div>
          ) : (
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
          )}

          {/* Time */}
          <div className="flex justify-between text-xs text-white/40 mt-1">
            {isLoading && !displayDuration && !isPlaying ? (
              <>
                <span className="animate-pulse">
                  {buffered > 0 ? `Laden... ${Math.round(buffered)}%` : "Laden..."}
                </span>
                <span />
              </>
            ) : (
              <>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(displayDuration)}</span>
              </>
            )}
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

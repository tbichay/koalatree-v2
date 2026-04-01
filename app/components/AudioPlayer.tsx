"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  audioUrl: string;
  title?: string;
}

export default function AudioPlayer({ audioUrl, title }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

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

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="card p-6">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {title && <p className="text-sm text-white/50 mb-3">{title}</p>}

      <div className="flex items-center gap-4">
        {/* Play/Pause */}
        <button
          className="w-14 h-14 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 flex items-center justify-center transition-all text-2xl shrink-0"
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
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative transition-all"
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

      {/* Download */}
      <div className="mt-4 text-center">
        <a
          href={audioUrl}
          download="gute-nacht-geschichte.mp3"
          className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          Herunterladen
        </a>
      </div>
    </div>
  );
}

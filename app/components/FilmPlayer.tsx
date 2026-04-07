"use client";

import { useState, useRef, useCallback } from "react";

interface Clip {
  index: number;
  videoUrl: string;
  characterId?: string;
}

interface Props {
  clips: Clip[];
  onClose?: () => void;
}

export default function FilmPlayer({ clips, onClose }: Props) {
  const [currentClip, setCurrentClip] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true); // Auto-play on open
  const [totalProgress, setTotalProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const playableClips = clips.filter((c) => c.videoUrl);

  const handleEnded = useCallback(() => {
    if (currentClip < playableClips.length - 1) {
      // Advance to next clip — autoPlay will start it
      setCurrentClip((prev) => prev + 1);
    } else {
      // Film finished — reset
      setIsPlaying(false);
      setCurrentClip(0);
      setTotalProgress(100);
    }
  }, [currentClip, playableClips.length]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const clipProgress = videoRef.current.currentTime / (videoRef.current.duration || 1);
    const overall = (currentClip + clipProgress) / playableClips.length;
    setTotalProgress(overall * 100);
  }, [currentClip, playableClips.length]);

  const playAll = () => {
    setCurrentClip(0);
    setIsPlaying(true);
    setTotalProgress(0);
  };

  const togglePlay = () => {
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      videoRef.current?.play().catch(() => {});
    }
  };

  if (playableClips.length === 0) {
    return (
      <div className="bg-black rounded-xl aspect-[9/16] max-h-[500px] flex items-center justify-center text-white/30 text-xs">
        Keine Clips zum Abspielen
      </div>
    );
  }

  const clip = playableClips[Math.min(currentClip, playableClips.length - 1)];

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      {/* Video — key forces remount on clip change, autoPlay continues playback */}
      <div className="aspect-[9/16] max-h-[500px]">
        <video
          ref={videoRef}
          key={`clip-${currentClip}-${clip.videoUrl}`}
          src={clip.videoUrl}
          autoPlay
          preload="auto"
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => { if (!videoRef.current?.ended) setIsPlaying(false); }}
          onLoadedData={() => { if (isPlaying) videoRef.current?.play().catch(() => {}); }}
          playsInline
          controls
          className="w-full h-full object-contain"
        />
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 pt-8">
        {/* Overall progress */}
        <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-[#a8d5b8] rounded-full transition-all duration-200"
            style={{ width: `${totalProgress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-[#4a7c59]/60 flex items-center justify-center">
              {isPlaying ? (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <span className="text-[10px] text-white/50">
              {currentClip + 1}/{playableClips.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentClip(Math.max(0, currentClip - 1))}
              disabled={currentClip === 0}
              className="text-white/30 hover:text-white/60 disabled:opacity-30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setCurrentClip(Math.min(playableClips.length - 1, currentClip + 1))}
              disabled={currentClip >= playableClips.length - 1}
              className="text-white/30 hover:text-white/60 disabled:opacity-30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>

            {onClose && (
              <button onClick={onClose} className="text-white/30 hover:text-white/60 ml-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Clip dots */}
      <div className="absolute top-2 left-0 right-0 flex justify-center gap-1 px-4">
        {playableClips.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrentClip(i); setIsPlaying(true); }}
            className={`h-1 rounded-full transition-all ${
              i === currentClip ? "bg-[#a8d5b8] flex-[2]" : i < currentClip ? "bg-[#a8d5b8]/40 flex-1" : "bg-white/20 flex-1"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

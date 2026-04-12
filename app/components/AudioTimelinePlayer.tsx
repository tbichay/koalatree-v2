"use client";

/**
 * AudioTimelinePlayer — Client-side multi-track audio player
 *
 * Uses Web Audio API to play Dialog + SFX + Ambience tracks synchronously.
 * No server-side mixing needed — each track is loaded and played at the right time.
 *
 * Shows visual timeline with dialog blocks and playback position.
 */

import { useState, useRef, useEffect, useCallback } from "react";

interface TimelineScene {
  dialogAudioUrl?: string;
  sfxAudioUrl?: string;
  audioStartMs: number;
  audioEndMs: number;
  characterId?: string;
  spokenText?: string;
  type: string;
}

interface AudioTimelinePlayerProps {
  projectId: string;
  sequenceId: string;
  scenes: TimelineScene[];
  ambienceUrl?: string;
  musicUrl?: string;
  musicVolume?: number; // 0-1, default 0.08
  blobProxy: (url: string) => string;
}

export default function AudioTimelinePlayer({ scenes, ambienceUrl, musicUrl, musicVolume = 0.08, blobProxy }: AudioTimelinePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTrack, setActiveTrack] = useState<"all" | "dialog" | "ambience">("all");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef(0);
  const animRef = useRef<number>(0);

  const dialogScenes = scenes.filter((s) => s.dialogAudioUrl);
  const sfxScenes = scenes.filter((s) => s.sfxAudioUrl);
  // Total duration: use audioEndMs if set, otherwise estimate from dialog count
  const rawTotalDuration = scenes.reduce((max, s) => Math.max(max, s.audioEndMs || 0), 0);
  const totalDuration = rawTotalDuration > 0 ? rawTotalDuration : dialogScenes.length * 5000; // ~5s per dialog as estimate

  // Debug: log scene timing on mount
  useEffect(() => {
    if (dialogScenes.length > 0) {
      console.log("[AudioTimeline] Scene timing:");
      for (const s of scenes) {
        if (s.dialogAudioUrl || s.sfxAudioUrl) {
          console.log(`  ${s.type} ${s.characterId?.slice(-6) || "—"}: ${s.audioStartMs}ms → ${s.audioEndMs}ms (dialog=${!!s.dialogAudioUrl}, sfx=${!!s.sfxAudioUrl})`);
        }
      }
      console.log(`  Total: ${totalDuration}ms, Dialogs: ${dialogScenes.length}, SFX: ${sfxScenes.length}`);
    }
  }, [scenes.length]);

  if (dialogScenes.length === 0) return null;

  const resolveUrl = (url: string) => {
    if (url.includes(".blob.vercel-storage.com")) return blobProxy(url);
    return url;
  };

  const stopAll = useCallback(() => {
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* */ } });
    sourcesRef.current = [];
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const playTracks = async (track: "all" | "dialog" | "ambience") => {
    stopAll();
    setLoading(true);
    setActiveTrack(track);

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      // ── Phase 1: LOAD all audio files first (no playback yet) ──
      console.log("[AudioTimeline] Loading all tracks...");
      const scheduled: Array<{ buffer: AudioBuffer; startSec: number; volume: number; loop?: boolean }> = [];

      // Check if audioStartMs values are actually set (not all 0)
      const allStartsZero = dialogScenes.every((s) => !s.audioStartMs || s.audioStartMs === 0);

      // Load dialog tracks
      if (track === "all" || track === "dialog") {
        let cumulativeMs = 0; // Fallback timing if audioStartMs is missing
        for (const scene of dialogScenes) {
          if (!scene.dialogAudioUrl) continue;
          try {
            const res = await fetch(resolveUrl(scene.dialogAudioUrl));
            if (!res.ok) continue;
            const arrayBuf = await res.arrayBuffer();
            if (arrayBuf.byteLength < 100) continue;
            const buffer = await ctx.decodeAudioData(arrayBuf);

            // Use audioStartMs if available, otherwise cumulative timing
            const startSec = allStartsZero
              ? cumulativeMs / 1000
              : (scene.audioStartMs || 0) / 1000;

            scheduled.push({ buffer, startSec, volume: 1.0 });

            // Accumulate for fallback timing (dialog duration + small gap)
            cumulativeMs += buffer.duration * 1000 + 300; // 300ms gap between dialogs
          } catch { /* skip */ }
        }
      }

      // Load SFX tracks (play alongside their dialog)
      if (track === "all") {
        let sfxCumulativeMs = 0;
        for (const scene of scenes) {
          if (scene.dialogAudioUrl) {
            // Track cumulative timing for SFX positioning
            sfxCumulativeMs = allStartsZero
              ? sfxCumulativeMs // will be updated below
              : (scene.audioStartMs || sfxCumulativeMs);
          }
          if (!scene.sfxAudioUrl) continue;
          try {
            const res = await fetch(resolveUrl(scene.sfxAudioUrl));
            if (!res.ok) continue;
            const arrayBuf = await res.arrayBuffer();
            if (arrayBuf.byteLength < 100) continue;
            const buffer = await ctx.decodeAudioData(arrayBuf);

            const startSec = allStartsZero
              ? sfxCumulativeMs / 1000
              : (scene.audioStartMs || 0) / 1000;

            scheduled.push({ buffer, startSec, volume: 0.3 });
          } catch { /* skip */ }
        }
      }

      // Load ambience
      if ((track === "all" || track === "ambience") && ambienceUrl) {
        try {
          const res = await fetch(resolveUrl(ambienceUrl));
          const arrayBuf = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuf);
          scheduled.push({ buffer, startSec: 0, volume: track === "ambience" ? 0.5 : 0.08, loop: true });
        } catch { /* skip */ }
      }

      // Load background music
      if ((track === "all") && musicUrl) {
        try {
          const res = await fetch(resolveUrl(musicUrl));
          const arrayBuf = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuf);
          scheduled.push({ buffer, startSec: 0, volume: musicVolume, loop: true });
          console.log(`[AudioTimeline] Music loaded (vol: ${(musicVolume * 100).toFixed(0)}%)`);
        } catch { /* skip */ }
      }

      // ── Phase 2: SCHEDULE all at once (relative to NOW) ──
      console.log("[AudioTimeline] Scheduling", scheduled.length, "tracks:");
      for (const item of scheduled) {
        console.log(`  → startSec=${item.startSec.toFixed(2)}, dur=${item.buffer.duration.toFixed(2)}s, vol=${item.volume}${item.loop ? " (loop)" : ""}`);
      }
      const sources: AudioBufferSourceNode[] = [];
      const playStart = ctx.currentTime + 0.1; // Small buffer for scheduling

      for (const item of scheduled) {
        const source = ctx.createBufferSource();
        source.buffer = item.buffer;
        if (item.loop) source.loop = true;

        const gain = ctx.createGain();
        gain.gain.value = item.volume;
        source.connect(gain);
        gain.connect(ctx.destination);

        source.start(playStart + item.startSec);
        sources.push(source);
      }

      sourcesRef.current = sources;
      startTimeRef.current = playStart;
      setPlaying(true);
      setLoading(false);

      // Animation loop for timeline position
      const updateTime = () => {
        if (!audioCtxRef.current) return;
        const elapsed = (audioCtxRef.current.currentTime - startTimeRef.current) * 1000;
        setCurrentTime(elapsed);

        if (elapsed < totalDuration + 1000) {
          animRef.current = requestAnimationFrame(updateTime);
        } else {
          stopAll();
        }
      };
      animRef.current = requestAnimationFrame(updateTime);
    } catch (err) {
      console.error("[AudioTimeline] Play failed:", err);
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
      audioCtxRef.current?.close();
    };
  }, [stopAll]);

  // Find current dialog
  const currentDialog = dialogScenes.find(
    (s) => currentTime >= s.audioStartMs && currentTime <= s.audioEndMs
  );

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 mb-3">
      <p className="text-[10px] text-white/30 mb-2">Audio-Vorschau</p>

      {/* Track Buttons */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => playing && activeTrack === "all" ? stopAll() : playTracks("all")}
          disabled={loading}
          className={`text-[10px] px-3 py-1.5 rounded-lg font-medium transition-all ${
            playing && activeTrack === "all"
              ? "bg-[#d4a853]/30 text-[#d4a853]"
              : "bg-[#d4a853]/15 text-[#d4a853]/70 hover:text-[#d4a853]"
          } disabled:opacity-30`}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" />
              Laden...
            </span>
          ) : playing && activeTrack === "all" ? "\u23F8 Stop" : "\u25B6 Alle Spuren"}
        </button>

        <button
          onClick={() => playing && activeTrack === "dialog" ? stopAll() : playTracks("dialog")}
          disabled={loading}
          className={`text-[10px] px-3 py-1.5 rounded-lg transition-all ${
            playing && activeTrack === "dialog"
              ? "bg-blue-500/20 text-blue-300"
              : "bg-white/5 text-white/30 hover:text-white/50"
          } disabled:opacity-30`}
        >
          {playing && activeTrack === "dialog" ? "\u23F8 Stop" : "\u25B6 Dialoge"}
        </button>

        {ambienceUrl && (
          <button
            onClick={() => playing && activeTrack === "ambience" ? stopAll() : playTracks("ambience")}
            disabled={loading}
            className={`text-[10px] px-3 py-1.5 rounded-lg transition-all ${
              playing && activeTrack === "ambience"
                ? "bg-green-500/20 text-green-300"
                : "bg-white/5 text-white/30 hover:text-white/50"
            } disabled:opacity-30`}
          >
            {playing && activeTrack === "ambience" ? "\u23F8 Stop" : "\u25B6 Ambience"}
          </button>
        )}

        <span className="text-[9px] text-white/15 self-center ml-auto">
          {dialogScenes.length} Dialoge &middot; {(totalDuration / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Timeline */}
      {totalDuration > 0 && (
        <div className="relative h-8 bg-white/5 rounded-lg overflow-hidden">
          {/* Dialog blocks */}
          {dialogScenes.map((s, i) => {
            const left = (s.audioStartMs / totalDuration) * 100;
            const width = Math.max(0.5, ((s.audioEndMs - s.audioStartMs) / totalDuration) * 100);
            const isCurrent = currentDialog === s;
            return (
              <div
                key={i}
                className={`absolute top-1 bottom-1 rounded transition-colors ${
                  isCurrent ? "bg-[#d4a853]/50" : "bg-blue-500/25"
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={s.spokenText?.slice(0, 60) || `Dialog ${i + 1}`}
              >
                {width > 5 && (
                  <span className="text-[7px] text-white/40 px-0.5 truncate block mt-0.5">
                    {s.spokenText?.slice(0, 20)}
                  </span>
                )}
              </div>
            );
          })}

          {/* SFX markers */}
          {scenes.filter((s) => s.sfxAudioUrl).map((s, i) => {
            const pos = ((s.audioStartMs || 0) / totalDuration) * 100;
            return (
              <div
                key={`sfx-${i}`}
                className="absolute top-0 bottom-0 w-0.5 bg-orange-500/40"
                style={{ left: `${pos}%` }}
                title="SFX"
              />
            );
          })}

          {/* Playback position */}
          {playing && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#d4a853] z-10 shadow-[0_0_4px_rgba(212,168,83,0.5)]"
              style={{ left: `${Math.min(100, (currentTime / totalDuration) * 100)}%` }}
            />
          )}

          {/* Time labels */}
          <span className="absolute bottom-0.5 left-1 text-[7px] text-white/15">0:00</span>
          <span className="absolute bottom-0.5 right-1 text-[7px] text-white/15">{(totalDuration / 1000).toFixed(1)}s</span>
        </div>
      )}

      {/* Current dialog text */}
      {playing && currentDialog?.spokenText && (
        <p className="text-[9px] text-[#d4a853]/60 mt-1.5 truncate italic">
          &quot;{currentDialog.spokenText}&quot;
        </p>
      )}
    </div>
  );
}

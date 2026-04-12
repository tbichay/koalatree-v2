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
  blobProxy: (url: string) => string;
}

export default function AudioTimelinePlayer({ scenes, ambienceUrl, blobProxy }: AudioTimelinePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTrack, setActiveTrack] = useState<"all" | "dialog" | "ambience">("all");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef(0);
  const animRef = useRef<number>(0);

  const dialogScenes = scenes.filter((s) => s.dialogAudioUrl);
  const totalDuration = scenes.reduce((max, s) => Math.max(max, s.audioEndMs || 0), 0);

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
      const sources: AudioBufferSourceNode[] = [];

      // Load and schedule dialog tracks
      if (track === "all" || track === "dialog") {
        for (const scene of dialogScenes) {
          if (!scene.dialogAudioUrl) continue;
          try {
            const dlgUrl = resolveUrl(scene.dialogAudioUrl);
            const res = await fetch(dlgUrl);
            if (!res.ok) { console.warn("[AudioTimeline] Dialog fetch failed:", res.status, dlgUrl.slice(0, 60)); continue; }
            const arrayBuf = await res.arrayBuffer();
            if (arrayBuf.byteLength < 100) { console.warn("[AudioTimeline] Dialog too small:", arrayBuf.byteLength); continue; }
            const audioBuffer = await ctx.decodeAudioData(arrayBuf);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            // Volume control
            const gain = ctx.createGain();
            gain.gain.value = 1.0;
            source.connect(gain);
            gain.connect(ctx.destination);

            // Schedule at correct time
            const startSec = (scene.audioStartMs || 0) / 1000;
            source.start(ctx.currentTime + startSec);
            sources.push(source);
          } catch (err) {
            console.warn("[AudioTimeline] Dialog load failed:", err);
          }
        }
      }

      // Load and schedule SFX tracks
      if (track === "all") {
        for (const scene of scenes) {
          if (!scene.sfxAudioUrl) continue;
          try {
            const sfxUrl = resolveUrl(scene.sfxAudioUrl);
            console.log("[AudioTimeline] Loading SFX:", sfxUrl.slice(0, 60));
            const res = await fetch(sfxUrl);
            if (!res.ok) { console.warn("[AudioTimeline] SFX fetch failed:", res.status); continue; }
            const arrayBuf = await res.arrayBuffer();
            if (arrayBuf.byteLength < 100) { console.warn("[AudioTimeline] SFX too small:", arrayBuf.byteLength); continue; }
            const audioBuffer = await ctx.decodeAudioData(arrayBuf);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            const gain = ctx.createGain();
            gain.gain.value = 0.3; // SFX at 30% volume
            source.connect(gain);
            gain.connect(ctx.destination);

            const startSec = (scene.audioStartMs || 0) / 1000;
            source.start(ctx.currentTime + startSec);
            sources.push(source);
          } catch { /* skip failed SFX */ }
        }
      }

      // Load and play ambience
      if ((track === "all" || track === "ambience") && ambienceUrl) {
        try {
          const res = await fetch(resolveUrl(ambienceUrl));
          const arrayBuf = await res.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuf);

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.loop = true; // Loop ambience

          const gain = ctx.createGain();
          gain.gain.value = track === "ambience" ? 0.5 : 0.08; // Louder when solo
          source.connect(gain);
          gain.connect(ctx.destination);

          source.start(ctx.currentTime);
          sources.push(source);
        } catch { /* skip failed ambience */ }
      }

      sourcesRef.current = sources;
      startTimeRef.current = ctx.currentTime;
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

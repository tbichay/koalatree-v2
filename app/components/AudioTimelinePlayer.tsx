"use client";

/**
 * AudioTimelinePlayer — Preview all audio tracks mixed together
 *
 * Shows: [▶ Alle Spuren] [▶ Dialoge] [▶ Ambience]
 * Generates a server-side mix of Dialog + SFX + Ambience
 * Displays timeline with dialog blocks
 */

import { useState, useRef } from "react";

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

export default function AudioTimelinePlayer({ projectId, sequenceId, scenes, ambienceUrl, blobProxy }: AudioTimelinePlayerProps) {
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState<"mix" | "ambience" | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const dialogScenes = scenes.filter((s) => s.dialogAudioUrl);
  const totalDuration = scenes.reduce((max, s) => Math.max(max, s.audioEndMs || 0), 0);

  if (dialogScenes.length === 0) return null;

  const generateMix = async () => {
    setMixing(true);
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/audio-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.previewUrl) {
        setMixUrl(data.previewUrl);
        playAudio(blobProxy(data.previewUrl), "mix");
      }
    } catch { /* */ }
    setMixing(false);
  };

  const playAudio = (url: string, type: "mix" | "ambience") => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime * 1000);
    audio.onended = () => { setPlaying(null); setCurrentTime(0); };
    audio.play();
    setPlaying(type);
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlaying(null);
    setCurrentTime(0);
  };

  const resolveUrl = (url: string) =>
    url.includes(".blob.vercel-storage.com") ? blobProxy(url) : url;

  // Find current dialog based on playback time
  const currentDialog = dialogScenes.find(
    (s) => currentTime >= s.audioStartMs && currentTime <= s.audioEndMs
  );

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 mb-3">
      <p className="text-[10px] text-white/30 mb-2">Audio-Vorschau</p>

      {/* Buttons */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={playing === "mix" ? stopAudio : () => { mixUrl ? playAudio(blobProxy(mixUrl), "mix") : generateMix(); }}
          disabled={mixing}
          className={`text-[10px] px-3 py-1.5 rounded-lg font-medium transition-all ${
            playing === "mix"
              ? "bg-[#d4a853]/30 text-[#d4a853]"
              : "bg-[#d4a853]/15 text-[#d4a853]/70 hover:text-[#d4a853]"
          } disabled:opacity-30`}
        >
          {mixing ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" />
              Mixe...
            </span>
          ) : playing === "mix" ? "⏸ Stop" : "▶ Alle Spuren"}
        </button>

        {ambienceUrl && (
          <button
            onClick={playing === "ambience" ? stopAudio : () => playAudio(resolveUrl(ambienceUrl), "ambience")}
            className={`text-[10px] px-3 py-1.5 rounded-lg transition-all ${
              playing === "ambience"
                ? "bg-green-500/20 text-green-300"
                : "bg-white/5 text-white/30 hover:text-white/50"
            }`}
          >
            {playing === "ambience" ? "⏸ Stop" : "▶ Ambience"}
          </button>
        )}

        <span className="text-[9px] text-white/15 self-center">
          {dialogScenes.length} Dialoge · {(totalDuration / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Timeline */}
      {totalDuration > 0 && (
        <div className="relative h-6 bg-white/5 rounded-lg overflow-hidden">
          {/* Dialog blocks */}
          {dialogScenes.map((s, i) => {
            const left = (s.audioStartMs / totalDuration) * 100;
            const width = Math.max(1, ((s.audioEndMs - s.audioStartMs) / totalDuration) * 100);
            const isCurrent = currentDialog === s;
            return (
              <div
                key={i}
                className={`absolute top-0 h-full rounded-sm transition-colors ${
                  isCurrent ? "bg-[#d4a853]/40" : "bg-blue-500/20"
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={s.spokenText?.slice(0, 50) || `Dialog ${i + 1}`}
              />
            );
          })}

          {/* SFX markers */}
          {scenes.filter((s) => s.sfxAudioUrl).map((s, i) => {
            const pos = ((s.audioStartMs || 0) / totalDuration) * 100;
            return (
              <div
                key={`sfx-${i}`}
                className="absolute top-0 h-full w-0.5 bg-orange-500/40"
                style={{ left: `${pos}%` }}
                title="SFX"
              />
            );
          })}

          {/* Playback position */}
          {playing && (
            <div
              className="absolute top-0 h-full w-0.5 bg-[#d4a853] z-10"
              style={{ left: `${(currentTime / totalDuration) * 100}%` }}
            />
          )}
        </div>
      )}

      {/* Current dialog text */}
      {playing && currentDialog?.spokenText && (
        <p className="text-[9px] text-[#d4a853]/60 mt-1 truncate italic">
          &quot;{currentDialog.spokenText}&quot;
        </p>
      )}
    </div>
  );
}

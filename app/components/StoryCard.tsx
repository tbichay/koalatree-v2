"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { STORY_FORMATE, StoryFormat } from "@/lib/types";

interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

const CHARACTERS: Record<string, { name: string; color: string; portrait: string; emoji: string }> = {
  koda:  { name: "Koda",  color: "#a8d5b8", portrait: "/api/images/koda-portrait.png",  emoji: "🐨" },
  kiki:  { name: "Kiki",  color: "#e8c547", portrait: "/api/images/kiki-portrait.png",  emoji: "🐦" },
  luna:  { name: "Luna",  color: "#b8a9d4", portrait: "/api/images/luna-portrait.png",  emoji: "🦉" },
  mika:  { name: "Mika",  color: "#d4884a", portrait: "/api/images/mika-portrait.png",  emoji: "🐕" },
  pip:   { name: "Pip",   color: "#6bb5c9", portrait: "/api/images/pip-portrait.png",   emoji: "🦫" },
  sage:  { name: "Sage",  color: "#8a9e7a", portrait: "/api/images/sage-portrait.png",  emoji: "🐻" },
  nuki:  { name: "Nuki",  color: "#f0b85a", portrait: "/api/images/nuki-portrait.png",  emoji: "☀️" },
};

interface Props {
  id: string;
  titel?: string;
  format: string;
  zusammenfassung?: string;
  audioDauerSek?: number;
  audioUrl?: string;
  timeline?: TimelineEntry[];
  kindName: string;
  createdAt: string;
  isPlaying?: boolean;
  isInQueue?: boolean;
  onPlay: () => void;
  onAddToQueue: () => void;
  onOpenFullView: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  onShare?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StoryCard({
  titel, format, zusammenfassung, audioDauerSek, audioUrl, timeline,
  kindName, createdAt, isPlaying, isInQueue,
  onPlay, onAddToQueue, onOpenFullView, onDelete, onDownload, onShare,
}: Props) {
  const formatInfo = STORY_FORMATE[format as StoryFormat];
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasAudio = audioUrl && audioUrl !== "local" && audioUrl.length > 10;

  // Extract unique characters from timeline
  const chars = timeline
    ? [...new Set(timeline.map((t) => t.characterId))].filter((id) => CHARACTERS[id])
    : [];

  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const title = titel || `${formatInfo?.label || format} für ${kindName}`;

  return (
    <div
      className={`group relative flex gap-3 p-3 rounded-xl transition-all cursor-pointer ${
        isPlaying
          ? "bg-[#3d6b4a]/20 border border-[#4a7c59]/30"
          : "bg-white/[0.04] border border-transparent hover:bg-white/[0.07] hover:border-white/[0.08]"
      }`}
      onClick={onPlay}
    >
      {/* Thumbnail: Character Grid */}
      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg bg-[#1a2e1a] overflow-hidden shrink-0">
        {chars.length > 0 ? (
          <div
            className="absolute inset-0 flex flex-wrap"
          >
            {chars.map((charId) => {
              const char = CHARACTERS[charId];
              // Calculate cell size: fills container evenly
              const cols = chars.length === 1 ? 1 : chars.length <= 4 ? 2 : 3;
              const widthPct = 100 / cols;
              const rows = Math.ceil(chars.length / cols);
              const heightPct = 100 / rows;
              return (
                <div
                  key={charId}
                  className="relative overflow-hidden"
                  style={{
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    borderBottom: "1px solid rgba(26,46,26,0.8)",
                    borderRight: "1px solid rgba(26,46,26,0.8)",
                  }}
                >
                  <Image
                    src={char.portrait}
                    alt={char.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* Subtle color tint at bottom */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1"
                    style={{ backgroundColor: char.color }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-40">
            {formatInfo?.emoji || "📖"}
          </div>
        )}

        {/* Play overlay */}
        {hasAudio && !isPlaying && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="flex gap-0.5 items-end h-5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-[#a8d5b8] rounded-full"
                  style={{
                    animation: "equalizer 0.8s ease-in-out infinite alternate",
                    animationDelay: `${i * 0.15}s`,
                    height: "60%",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Duration badge */}
        {audioDauerSek && (
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
            {formatDuration(audioDauerSek)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="font-medium text-[#f5eed6] text-sm leading-tight line-clamp-2">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-white/35">
          <span>{kindName}</span>
          <span>·</span>
          <span>{formatInfo?.emoji} {formatInfo?.label}</span>
          <span>·</span>
          <span>{new Date(createdAt).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</span>
        </div>
        {zusammenfassung && (
          <p className="text-xs text-white/25 mt-1 line-clamp-1">{zusammenfassung}</p>
        )}
        {isInQueue && (
          <span className="text-[10px] text-[#a8d5b8]/60 mt-1">In der Warteschlange</span>
        )}
      </div>

      {/* Share + Three-dot menu */}
      <div className="flex items-center gap-1 shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
        {onShare && hasAudio && (
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-[#a8d5b8] hover:bg-white/5 transition-colors"
            onClick={onShare}
            title="Teilen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        )}
      <div ref={menuRef} className="relative">
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          onClick={() => setShowMenu(!showMenu)}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#1a2e1a] border border-white/10 shadow-xl overflow-hidden z-50">
            {onShare && (
              <button
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => { onShare(); setShowMenu(false); }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Teilen
              </button>
            )}
            {hasAudio && !isInQueue && (
              <button
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => { onAddToQueue(); setShowMenu(false); }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Zur Warteschlange
              </button>
            )}
            <button
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => { onOpenFullView(); setShowMenu(false); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Vollansicht
            </button>
            {hasAudio && onDownload && (
              <button
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => { onDownload(); setShowMenu(false); }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download
              </button>
            )}
            <div className="border-t border-white/5" />
            <button
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-white/5 transition-colors"
              onClick={() => { onDelete(); setShowMenu(false); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Löschen
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

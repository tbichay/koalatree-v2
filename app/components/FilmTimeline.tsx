"use client";

interface Scene {
  type: string;
  characterId?: string;
  spokenText?: string;
  sceneDescription: string;
  audioStartMs: number;
  audioEndMs: number;
  videoUrl?: string;
  status?: string;
}

const CHAR_COLORS: Record<string, string> = {
  koda: "#a8d5b8", kiki: "#e8c547", luna: "#b8a9d4",
  mika: "#d4884a", pip: "#6bb5c9", sage: "#8a9e7a", nuki: "#f0b85a",
};

const CHAR_EMOJI: Record<string, string> = {
  koda: "🐨", kiki: "🐦", luna: "🦉", mika: "🐕", pip: "🦫", sage: "🐻", nuki: "☀️",
};

interface Props {
  scenes: Scene[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  playingSegment?: number | null;
  onPlaySegment?: (index: number) => void;
}

export default function FilmTimeline({ scenes, selectedIndex, onSelect, playingSegment, onPlaySegment }: Props) {
  const totalDuration = scenes.reduce((sum, s) => sum + (s.audioEndMs - s.audioStartMs), 0);

  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        {scenes.map((scene, i) => {
          const dur = (scene.audioEndMs - scene.audioStartMs) / 1000;
          const widthPct = Math.max(3, ((scene.audioEndMs - scene.audioStartMs) / totalDuration) * 100);
          const isSelected = i === selectedIndex;
          const isPlaying = playingSegment === i;
          const isDone = scene.videoUrl || scene.status === "done";
          const isGenerating = scene.status === "generating";
          const color = scene.characterId ? CHAR_COLORS[scene.characterId] || "#666" : "#4a6fa5";

          const isIntro = scene.type === "intro";
          const isOutro = scene.type === "outro";

          const tooltipText = scene.spokenText
            ? `Szene ${i + 1}: ${scene.spokenText.substring(0, 60)}${scene.spokenText.length > 60 ? "..." : ""} (${dur.toFixed(1)}s)`
            : `Szene ${i + 1}: ${scene.sceneDescription?.substring(0, 50)}... (${dur.toFixed(1)}s)`;

          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`group shrink-0 rounded-lg transition-all relative overflow-hidden ${
                isPlaying
                  ? "ring-2 ring-[#d4a853] animate-pulse scale-105"
                  : isSelected
                    ? "ring-2 ring-white/40 scale-105"
                    : "hover:scale-102 hover:brightness-110"
              }`}
              style={{
                width: `${Math.max(40, widthPct * 3)}px`,
                height: 48,
                backgroundColor: isDone ? `${color}30` : isGenerating ? `${color}15` : "rgba(255,255,255,0.03)",
                borderLeft: `3px solid ${isDone ? color : isGenerating ? `${color}80` : "rgba(255,255,255,0.1)"}`,
              }}
              title={tooltipText}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isIntro ? (
                  <span className="text-[10px] font-bold text-white/60 bg-white/10 rounded px-1">I</span>
                ) : isOutro ? (
                  <span className="text-[10px] font-bold text-white/60 bg-white/10 rounded px-1">O</span>
                ) : (
                  <span className="text-[10px]">
                    {scene.characterId ? CHAR_EMOJI[scene.characterId] || "🎬" : "🏔️"}
                  </span>
                )}
                <span className="text-[8px] text-white/40">{dur.toFixed(0)}s</span>
              </div>
              {/* Play button overlay on hover */}
              {onPlaySegment && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlaySegment(i);
                  }}
                >
                  <span className="text-white/80 text-xs">▶</span>
                </div>
              )}
              {/* Status indicator */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${
                isDone ? "bg-[#a8d5b8]" : isGenerating ? "bg-[#d4a853] animate-pulse" : "bg-white/10"
              }`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

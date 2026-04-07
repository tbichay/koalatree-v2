"use client";

import { useState, useEffect } from "react";

interface Asset {
  name: string;
  path: string;
  type: "image" | "video" | "audio";
  category: string;
  size: number;
  url: string;
  uploadedAt: string;
}

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  portrait: { label: "Charaktere", emoji: "🐨" },
  landscape: { label: "Landschaften", emoji: "🏔️" },
  background: { label: "Hintergründe", emoji: "🖼️" },
  "marketing-video": { label: "Marketing-Clips", emoji: "🎬" },
  "film-scene": { label: "Film-Szenen", emoji: "🎥" },
  "help-clip": { label: "Help-Clips", emoji: "🔊" },
  audio: { label: "Audio", emoji: "🎵" },
  branding: { label: "Branding", emoji: "✨" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AssetBrowser() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Asset[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, images: 0, videos: 0, audio: 0, totalSize: 0 });

  useEffect(() => {
    fetch("/api/admin/assets")
      .then((r) => r.json())
      .then((data) => {
        setAssets(data.assets || []);
        setGrouped(data.grouped || {});
        setStats(data.stats || {});
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-white/30 text-sm">Assets laden...</div>;

  const categories = filter === "all"
    ? Object.keys(grouped)
    : [filter];

  return (
    <div>
      {/* Stats + Filter */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[10px] text-white/30">
          <span>{stats.total} Assets</span>
          <span>{stats.images} Bilder</span>
          <span>{stats.videos} Videos</span>
          <span>{stats.audio} Audio</span>
          <span>{formatBytes(stats.totalSize)} gesamt</span>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-[10px] py-1"
        >
          <option value="all">Alle Kategorien</option>
          {Object.keys(grouped).map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]?.emoji || "📦"} {CATEGORY_LABELS[cat]?.label || cat} ({grouped[cat].length})
            </option>
          ))}
        </select>
      </div>

      {/* Asset Grid by Category */}
      {categories.map((cat) => {
        const items = grouped[cat] || [];
        if (items.length === 0) return null;
        const label = CATEGORY_LABELS[cat] || { label: cat, emoji: "📦" };

        return (
          <div key={cat} className="mb-6">
            <h3 className="text-xs font-medium text-[#f5eed6] mb-3 flex items-center gap-1.5">
              <span>{label.emoji}</span>
              <span>{label.label}</span>
              <span className="text-white/20 font-normal">({items.length})</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {items.map((asset) => (
                <div key={asset.path} className="card overflow-hidden group">
                  {/* Preview */}
                  <div className="aspect-square bg-[#1a2e1a] relative flex items-center justify-center overflow-hidden">
                    {asset.type === "image" && asset.url && (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {asset.type === "video" && (
                      <>
                        {playingUrl === asset.url ? (
                          <video
                            src={asset.url}
                            autoPlay
                            controls
                            className="w-full h-full object-contain"
                            onEnded={() => setPlayingUrl(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setPlayingUrl(asset.url)}
                            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </button>
                        )}
                        <div className="absolute top-1 right-1 bg-black/60 text-white/70 text-[8px] px-1 py-0.5 rounded">
                          🎬
                        </div>
                      </>
                    )}
                    {asset.type === "audio" && (
                      <div className="text-2xl opacity-30">🎵</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2">
                    <p className="text-[10px] text-white/60 truncate" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="text-[8px] text-white/20">
                      {formatBytes(asset.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {assets.length === 0 && (
        <div className="card p-8 text-center text-white/30 text-sm">
          Keine Assets gefunden.
        </div>
      )}
    </div>
  );
}

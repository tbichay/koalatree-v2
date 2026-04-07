"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Asset {
  name: string;
  path: string;
  type: "image" | "video" | "audio";
  category: string;
  size: number;
  url: string;
  blobUrl?: string;
  uploadedAt: string;
}

// Categories that support reference images
const REF_CATEGORIES = ["landscape", "portrait", "background"];

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  portrait: { label: "Charaktere", emoji: "🐨" },
  landscape: { label: "Landschaften", emoji: "🏔️" },
  background: { label: "Hintergründe", emoji: "🖼️" },
  intro: { label: "Vorspann", emoji: "🎬" },
  outro: { label: "Abspann", emoji: "👋" },
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

// Character IDs for portrait matching
const CHARACTER_IDS = ["koda", "kiki", "luna", "mika", "pip", "sage", "nuki"];

// Build a reference key from an asset — each character/landscape type gets its own key
function getRefKey(asset: Asset): string {
  if (asset.category === "portrait") {
    // Extract character ID: "koda-portrait-1234.png" → "koda"
    // Must be an actual character, not "hero-background" etc.
    for (const cid of CHARACTER_IDS) {
      if (asset.name.startsWith(cid + "-") || asset.name === cid + ".png") {
        return `portrait:${cid}`;
      }
    }
    // Not a character portrait (hero, etc.) — use full name
    const base = asset.name.replace(/-\d{13}\.png$/, "").replace(/\.png$/, "");
    return `portrait:${base}`;
  }
  if (asset.category === "landscape") {
    // "koalatree_full-1234.png" → "landscape:koalatree_full"
    const base = asset.name.replace(/-\d{13}\.png$/, "").replace(/\.png$/, "");
    return `landscape:${base}`;
  }
  if (asset.category === "background") {
    const base = asset.name.replace(/-\d{13}\.png$/, "").replace(/\.png$/, "");
    return `background:${base}`;
  }
  return `${asset.category}:${asset.name}`;
}

export default function AssetBrowser() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Asset[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, images: 0, videos: 0, audio: 0, totalSize: 0 });
  const [references, setReferences] = useState<Record<string, string>>({});
  const [settingRef, setSettingRef] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genType, setGenType] = useState<"landscape" | "character" | "group" | "custom">("landscape");
  const [genPreset, setGenPreset] = useState("koalatree_full");
  const [genCharacter, setGenCharacter] = useState("koda");
  const [genCustomPrompt, setGenCustomPrompt] = useState("");
  const [genBackground, setGenBackground] = useState("golden");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState("");
  const [lightboxAsset, setLightboxAsset] = useState<Asset | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadAssets = () => {
    fetch("/api/admin/assets")
      .then((r) => r.json())
      .then((data) => {
        setAssets(data.assets || []);
        setGrouped(data.grouped || {});
        setStats(data.stats || {});
        setReferences(data.references || {});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAssets(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult("");
    try {
      const body: Record<string, unknown> = {
        type: genType,
        sceneBackground: genBackground,
        size: "1792x1024",
        quality: "hd",
      };

      if (genType === "landscape") body.landscapeId = genPreset;
      if (genType === "character") body.characterId = genCharacter;
      if (genType === "group") body.characterIds = ["koda", "kiki", "luna", "mika", "pip", "sage", "nuki"];
      if (genCustomPrompt) body.customPrompt = genCustomPrompt;

      const res = await fetch("/api/admin/generate-scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenResult(`Bild generiert! (${(data.size / 1024).toFixed(0)} KB)`);
      loadAssets();
    } catch (err) {
      setGenResult(`Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSetReference = async (asset: Asset) => {
    const refKey = getRefKey(asset);
    const isAlreadyRef = references[refKey] === asset.path;
    setSettingRef(asset.path);
    try {
      const res = await fetch("/api/admin/assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refKey,
          assetPath: isAlreadyRef ? null : asset.path,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReferences(data.references || {});
      }
    } catch { /* ignore */ }
    setSettingRef(null);
  };

  const isReference = (asset: Asset): boolean => {
    const refKey = getRefKey(asset);
    return references[refKey] === asset.path;
  };

  const openLightbox = useCallback((asset: Asset) => {
    setLightboxAsset(asset);
    dialogRef.current?.showModal();
  }, []);

  const closeLightbox = useCallback(() => {
    dialogRef.current?.close();
    setLightboxAsset(null);
  }, []);

  if (loading) return <div className="text-white/30 text-sm">Assets laden...</div>;

  const categories = filter === "all"
    ? Object.keys(grouped)
    : [filter];

  // Count active references
  const refCount = Object.keys(references).length;

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
          {refCount > 0 && (
            <span className="text-[#d4a853]">📌 {refCount} Referenzen</span>
          )}
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
        const supportsRef = REF_CATEGORIES.includes(cat);

        return (
          <div key={cat} className="mb-6">
            <h3 className="text-xs font-medium text-[#f5eed6] mb-3 flex items-center gap-1.5">
              <span>{label.emoji}</span>
              <span>{label.label}</span>
              <span className="text-white/20 font-normal">({items.length})</span>
              {supportsRef && (
                <span className="text-[8px] text-[#d4a853]/50 font-normal ml-1">📌 Referenzen moeglich</span>
              )}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {items.map((asset) => {
                const isRef = isReference(asset);
                return (
                  <div key={asset.path} className={`card overflow-hidden group ${
                    isRef ? "ring-2 ring-[#d4a853]/70 shadow-[0_0_12px_rgba(212,168,83,0.15)]" : ""
                  }`}>
                    {/* Preview */}
                    <div
                      className="aspect-square bg-[#1a2e1a] relative flex items-center justify-center overflow-hidden cursor-pointer"
                      onClick={() => { if (asset.type === "image" || asset.type === "video") openLightbox(asset); }}
                    >
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
                              onClick={(e) => { e.stopPropagation(); setPlayingUrl(asset.url); }}
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
                      {/* Reference badge */}
                      {isRef && (
                        <div className="absolute top-1 left-1 bg-[#d4a853] text-white text-[7px] px-1.5 py-0.5 rounded-full font-bold">
                          📌 Referenz
                        </div>
                      )}
                    </div>

                    {/* Info + Actions */}
                    <div className="p-2">
                      <p className="text-[10px] text-white/60 truncate" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[8px] text-white/20">
                          {formatBytes(asset.size)}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {/* Reference button */}
                          {supportsRef && asset.type === "image" && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await handleSetReference(asset);
                              }}
                              disabled={settingRef === asset.path}
                              className={`text-[8px] transition-colors disabled:opacity-30 ${
                                isRef
                                  ? "text-[#d4a853] font-bold"
                                  : "text-[#d4a853]/30 hover:text-[#d4a853]/80"
                              }`}
                              title={isRef ? "Referenz entfernen" : "Als Referenz setzen"}
                            >
                              {settingRef === asset.path ? "..." : isRef ? "📌" : "📌"}
                            </button>
                          )}
                          {/* Delete button */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!asset.blobUrl) return;
                              if (!confirm(`"${asset.name}" wirklich loeschen?`)) return;
                              try {
                                const res = await fetch(`/api/admin/assets?blobUrl=${encodeURIComponent(asset.blobUrl)}`, { method: "DELETE" });
                                if (res.ok) {
                                  setAssets((prev) => prev.filter((a) => a.path !== asset.path));
                                  setGrouped((prev) => {
                                    const updated = { ...prev };
                                    if (updated[asset.category]) {
                                      updated[asset.category] = updated[asset.category].filter((a) => a.path !== asset.path);
                                    }
                                    return updated;
                                  });
                                }
                              } catch { /* ignore */ }
                            }}
                            className="text-[8px] text-red-400/30 hover:text-red-400/80 transition-colors"
                            title="Loeschen"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {assets.length === 0 && (
        <div className="card p-8 text-center text-white/30 text-sm">
          Keine Assets gefunden.
        </div>
      )}

      {/* Generate Image Panel */}
      <div className="mt-6">
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="flex items-center gap-2 text-xs text-[#a8d5b8] hover:text-[#c8e5d8] transition-colors mb-3"
        >
          <span className="text-base">{showGenerator ? "▾" : "▸"}</span>
          <span>🎨 Bild generieren</span>
        </button>

        {showGenerator && (
          <div className="card p-4 space-y-4">
            {/* Type Selector */}
            <div>
              <label className="text-[10px] text-white/30 block mb-1.5">Typ</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { value: "landscape", label: "🏔️ Landschaft", desc: "Szene ohne Charaktere" },
                  { value: "character", label: "🐨 Charakter", desc: "Einzelnes Portrait" },
                  { value: "group", label: "👥 Gruppe", desc: "Alle 7 Charaktere" },
                  { value: "custom", label: "✏️ Frei", desc: "Eigener Prompt" },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setGenType(t.value)}
                    className={`p-2 rounded-lg text-center transition-all ${
                      genType === t.value
                        ? "bg-[#4a7c59]/30 border border-[#4a7c59]/50"
                        : "bg-white/5 border border-transparent hover:bg-white/10"
                    }`}
                  >
                    <p className="text-[10px] text-[#f5eed6]">{t.label}</p>
                    <p className="text-[8px] text-white/20 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Landscape Preset */}
            {genType === "landscape" && (
              <div>
                <label className="text-[10px] text-white/30 block mb-1.5">Landschaft</label>
                <select
                  value={genPreset}
                  onChange={(e) => setGenPreset(e.target.value)}
                  className="w-full text-[10px] py-1.5 px-2 bg-white/5 border border-white/10 rounded-lg text-white/70"
                >
                  <option value="koalatree_full">🌳 KoalaTree komplett</option>
                  <option value="koalatree_branch">🌿 Ast (Nahaufnahme)</option>
                  <option value="forest_floor">🍃 Waldboden</option>
                  <option value="night_forest">🌙 Nachtwald</option>
                  <option value="beach">🏖️ Strand</option>
                  <option value="stream">💧 Waldbach</option>
                  <option value="meadow">🌾 Wiese</option>
                  <option value="cave">🕳️ Hoehle / Bau</option>
                </select>
              </div>
            )}

            {/* Character Selector */}
            {genType === "character" && (
              <div>
                <label className="text-[10px] text-white/30 block mb-1.5">Charakter</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {([
                    { id: "koda", emoji: "🐨", name: "Koda" },
                    { id: "kiki", emoji: "🐦", name: "Kiki" },
                    { id: "luna", emoji: "🦉", name: "Luna" },
                    { id: "mika", emoji: "🐕", name: "Mika" },
                    { id: "pip", emoji: "🦫", name: "Pip" },
                    { id: "sage", emoji: "🐻", name: "Sage" },
                    { id: "nuki", emoji: "☀️", name: "Nuki" },
                  ]).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setGenCharacter(c.id)}
                      className={`p-2 rounded-lg text-center transition-all ${
                        genCharacter === c.id
                          ? "bg-[#4a7c59]/30 border border-[#4a7c59]/50"
                          : "bg-white/5 border border-transparent hover:bg-white/10"
                      }`}
                    >
                      <span className="text-base">{c.emoji}</span>
                      <p className="text-[8px] text-white/40 mt-0.5">{c.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Background / Sky */}
            <div>
              <label className="text-[10px] text-white/30 block mb-1.5">Hintergrund / Himmel</label>
              <div className="grid grid-cols-5 gap-1.5">
                {([
                  { id: "golden", label: "🌅 Golden" },
                  { id: "blue", label: "🌆 Blau" },
                  { id: "night", label: "🌙 Nacht" },
                  { id: "dawn", label: "🌸 Morgen" },
                  { id: "sunny", label: "☀️ Sonnig" },
                ]).map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setGenBackground(bg.id)}
                    className={`p-1.5 rounded-lg text-center transition-all ${
                      genBackground === bg.id
                        ? "bg-[#d4a853]/20 border border-[#d4a853]/40"
                        : "bg-white/5 border border-transparent hover:bg-white/10"
                    }`}
                  >
                    <p className="text-[9px] text-white/60">{bg.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="text-[10px] text-white/30 block mb-1.5">
                {genType === "custom" ? "Prompt (erforderlich)" : "Zusaetzlicher Prompt (optional)"}
              </label>
              <textarea
                value={genCustomPrompt}
                onChange={(e) => setGenCustomPrompt(e.target.value)}
                placeholder={genType === "custom" ? "Beschreibe die gewuenschte Szene..." : "z.B. 'Regen faellt sanft', 'Nebel am Boden'..."}
                rows={2}
                className="w-full text-[10px] py-1.5 px-2 bg-white/5 border border-white/10 rounded-lg text-white/70 placeholder:text-white/15 resize-none"
              />
            </div>

            {/* Generate Button + Result */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={generating || (genType === "custom" && !genCustomPrompt.trim())}
                className="px-4 py-2 rounded-lg bg-[#4a7c59] text-white text-xs font-medium hover:bg-[#5a8c69] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Generiere...
                  </>
                ) : (
                  <>🎨 Generieren (~$0.08)</>
                )}
              </button>
              {genResult && (
                <span className={`text-[10px] ${genResult.startsWith("Fehler") ? "text-red-400/70" : "text-[#a8d5b8]/70"}`}>
                  {genResult}
                </span>
              )}
            </div>

            {/* Info */}
            <p className="text-[8px] text-white/15">
              GPT-Image-1 · 1536×1024 · KoalaTree Disney-1994 Stil · Bilder werden in studio/scene-images/ gespeichert
            </p>
          </div>
        )}
      </div>

      {/* Lightbox Dialog */}
      <dialog
        ref={dialogRef}
        className="fixed inset-0 w-full h-full max-w-none max-h-none m-0 p-0 bg-black/95 backdrop:bg-black/80"
        onClick={(e) => { if (e.target === dialogRef.current) closeLightbox(); }}
      >
        {lightboxAsset && (
          <div className="w-full h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm text-white/80 flex items-center gap-2">
                    {lightboxAsset.name}
                    {isReference(lightboxAsset) && (
                      <span className="text-[9px] bg-[#d4a853] text-white px-2 py-0.5 rounded-full font-bold">📌 Referenz</span>
                    )}
                  </p>
                  <p className="text-[10px] text-white/30">
                    {formatBytes(lightboxAsset.size)} · {CATEGORY_LABELS[lightboxAsset.category]?.label || lightboxAsset.category}
                  </p>
                </div>
                {/* Set as reference in lightbox */}
                {REF_CATEGORIES.includes(lightboxAsset.category) && lightboxAsset.type === "image" && (
                  <button
                    onClick={() => handleSetReference(lightboxAsset)}
                    disabled={settingRef === lightboxAsset.path}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30 ${
                      isReference(lightboxAsset)
                        ? "bg-[#d4a853]/20 text-[#d4a853] border border-[#d4a853]/40"
                        : "bg-white/10 text-white/60 hover:bg-[#d4a853]/20 hover:text-[#d4a853]"
                    }`}
                  >
                    {settingRef === lightboxAsset.path ? "..." : isReference(lightboxAsset) ? "📌 Referenz entfernen" : "📌 Als Referenz setzen"}
                  </button>
                )}
              </div>
              <button
                onClick={closeLightbox}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              {lightboxAsset.type === "image" && (
                <img
                  src={lightboxAsset.url}
                  alt={lightboxAsset.name}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              )}
              {lightboxAsset.type === "video" && (
                <video
                  src={lightboxAsset.url}
                  autoPlay
                  controls
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              )}
            </div>

            {/* Footer Nav */}
            <div className="flex items-center justify-center gap-4 px-4 py-3 shrink-0">
              <button
                onClick={() => {
                  const allViewable = assets.filter((a) => a.type === "image" || a.type === "video");
                  const idx = allViewable.findIndex((a) => a.path === lightboxAsset.path);
                  if (idx > 0) setLightboxAsset(allViewable[idx - 1]);
                }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[10px] text-white/30">
                {(() => {
                  const allViewable = assets.filter((a) => a.type === "image" || a.type === "video");
                  const idx = allViewable.findIndex((a) => a.path === lightboxAsset.path);
                  return `${idx + 1} / ${allViewable.length}`;
                })()}
              </span>
              <button
                onClick={() => {
                  const allViewable = assets.filter((a) => a.type === "image" || a.type === "video");
                  const idx = allViewable.findIndex((a) => a.path === lightboxAsset.path);
                  if (idx < allViewable.length - 1) setLightboxAsset(allViewable[idx + 1]);
                }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

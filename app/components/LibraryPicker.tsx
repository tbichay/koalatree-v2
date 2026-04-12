"use client";

/**
 * LibraryPicker — Inline modal to pick or create assets from the library.
 *
 * Used everywhere in the project workflow where assets are needed:
 * - Landscape selection in production
 * - Actor casting in characters tab
 * - Voice selection for actors
 * - Music selection for film assembly
 *
 * Pattern:
 * 1. Button in project → opens picker modal
 * 2. Grid of existing library items + "Neu erstellen" button
 * 3. Pick existing → callback with item → modal closes
 * 4. Create new → inline creation form → auto-picks → modal closes
 */

import { useState, useEffect } from "react";
import { ActionButton } from "@/app/components/ui";

interface PickerItem {
  id: string;
  blobUrl?: string;
  previewUrl?: string;
  name?: string;
  category?: string;
  tags?: string[];
}

interface LibraryPickerProps {
  /** What are we picking? */
  type: "landscape" | "actor" | "voice" | "music";
  /** Called when user selects an item */
  onSelect: (item: PickerItem) => void;
  /** Close the picker */
  onClose: () => void;
  /** Blob proxy for private URLs */
  blobProxy: (url: string) => string;
  /** Optional: open directly in create mode */
  startInCreateMode?: boolean;
}

const TYPE_CONFIG = {
  landscape: {
    title: "Location waehlen",
    apiUrl: "/api/studio/assets?type=landscape",
    icon: "\uD83D\uDCCD",
    createLabel: "Neue Location erstellen",
    emptyText: "Noch keine Locations. Erstelle deine erste in der Library.",
    gridCols: "grid-cols-2 sm:grid-cols-3",
    itemHeight: "h-24",
  },
  actor: {
    title: "Actor casten",
    apiUrl: "/api/studio/actors",
    icon: "\uD83C\uDFAD",
    createLabel: "Neuen Actor erstellen",
    emptyText: "Noch keine Actors. Erstelle deinen ersten.",
    gridCols: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    itemHeight: "h-20",
  },
  voice: {
    title: "Stimme waehlen",
    apiUrl: "/api/studio/voices",
    icon: "\uD83C\uDFA4",
    createLabel: "Neue Stimme erstellen",
    emptyText: "Noch keine Stimmen. Erstelle deine erste.",
    gridCols: "grid-cols-1 sm:grid-cols-2",
    itemHeight: "",
  },
  music: {
    title: "Musik waehlen",
    apiUrl: "/api/studio/assets?type=sound",
    icon: "\uD83C\uDFB5",
    createLabel: "Musik hochladen",
    emptyText: "Noch keine Musik. Lade deine erste hoch.",
    gridCols: "grid-cols-1 sm:grid-cols-2",
    itemHeight: "",
  },
};

export default function LibraryPicker({ type, onSelect, onClose, blobProxy }: LibraryPickerProps) {
  const config = TYPE_CONFIG[type];
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(config.apiUrl)
      .then((r) => r.json())
      .then((d) => {
        // Normalize different API response shapes
        const raw = d.assets || d.actors || d.voices || [];
        setItems(raw.map((item: Record<string, unknown>) => ({
          id: item.id as string,
          blobUrl: (item.blobUrl || item.portraitAssetId) as string | undefined,
          previewUrl: (item.previewUrl || item.voicePreviewUrl) as string | undefined,
          name: item.name as string | undefined,
          category: item.category as string | undefined,
          tags: item.tags as string[] | undefined,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [config.apiUrl]);

  const filtered = search.trim()
    ? items.filter((item) => {
        const q = search.toLowerCase();
        return (item.name?.toLowerCase().includes(q)) ||
               (item.category?.toLowerCase().includes(q)) ||
               (item.tags?.some((t) => t.toLowerCase().includes(q)));
      })
    : items;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.icon}</span>
            <h3 className="text-sm font-semibold text-[#f5eed6]">{config.title}</h3>
            <span className="text-[10px] text-white/20">({items.length})</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg">&times;</button>
        </div>

        {/* Search + Create */}
        <div className="px-5 py-3 border-b border-white/5 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#d4a853]/40"
          />
          <a
            href="/studio/library"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-[#d4a853]/20 text-[#d4a853] text-[10px] font-medium hover:bg-[#d4a853]/30 transition-all flex items-center gap-1 whitespace-nowrap"
          >
            + {config.createLabel}
          </a>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-4 h-4 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-3xl block mb-2">{config.icon}</span>
              <p className="text-sm text-white/30">{search ? "Keine Ergebnisse" : config.emptyText}</p>
            </div>
          ) : (
            <div className={`grid ${config.gridCols} gap-3`}>
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden text-left hover:border-[#d4a853]/40 hover:ring-1 hover:ring-[#d4a853]/20 transition-all"
                >
                  {/* Visual */}
                  {type === "landscape" && item.blobUrl && (
                    <img src={blobProxy(item.blobUrl)} alt="" className="w-full h-24 object-cover" loading="lazy" />
                  )}
                  {type === "actor" && (
                    <div className="w-full h-20 bg-white/5 flex items-center justify-center overflow-hidden">
                      {item.blobUrl ? (
                        <img src={blobProxy(item.blobUrl)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-2xl text-white/10">{"\uD83C\uDFAD"}</span>
                      )}
                    </div>
                  )}
                  {(type === "voice" || type === "music") && item.previewUrl && (
                    <div className="p-2">
                      <audio
                        controls
                        src={blobProxy(item.previewUrl)}
                        className="w-full h-7 opacity-60"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-2">
                    {item.name && <p className="text-xs font-medium text-[#f5eed6] truncate">{item.name}</p>}
                    {item.category && <p className="text-[9px] text-white/25 truncate">{item.category}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

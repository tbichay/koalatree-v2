"use client";

import { useState, useEffect, useCallback } from "react";

interface PromptBlock {
  id: string;
  slug: string;
  type: string;
  name: string;
  description?: string;
  content: string;
  variables: Record<string, string>;
  version: number;
  isProduction: boolean;
  scope: string;
  tags: string[];
  modelHint?: string;
  updatedAt: string;
}

const BLOCK_TYPES = [
  { id: "all", label: "Alle" },
  { id: "character", label: "Charakter" },
  { id: "style", label: "Regie-Stil" },
  { id: "atmosphere", label: "Atmosphaere" },
  { id: "visual", label: "Visuell" },
  { id: "format", label: "Format" },
  { id: "rules", label: "Regeln" },
  { id: "camera", label: "Kamera" },
  { id: "mood", label: "Stimmung" },
];

export default function PromptsPage() {
  const [blocks, setBlocks] = useState<PromptBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedBlock, setSelectedBlock] = useState<PromptBlock | null>(null);

  const loadBlocks = useCallback(() => {
    const params = filter !== "all" ? `?type=${filter}` : "";
    fetch(`/api/studio/prompts${params}`)
      .then((r) => r.json())
      .then((d) => { setBlocks(d.blocks || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  if (loading) return <div className="text-white/30 text-sm p-8">Lade Prompt-Blocks...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">Prompt Library</h1>
          <p className="text-sm text-white/40">{blocks.length} Blocks</p>
        </div>
      </div>

      {/* Type Filters */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${
              filter === t.id
                ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                : "text-white/30 hover:text-white/50 bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Block List */}
      <div className="space-y-2">
        {blocks.map((block) => (
          <div
            key={block.id}
            onClick={() => setSelectedBlock(selectedBlock?.id === block.id ? null : block)}
            className={`card p-3 cursor-pointer transition-all ${
              selectedBlock?.id === block.id ? "ring-1 ring-[#a8d5b8]/40" : "hover:border-white/15"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-white/30">{block.type}</span>
                <span className="text-xs text-[#f5eed6]">{block.name}</span>
                {block.isProduction && <span className="text-[7px] text-[#a8d5b8]">production</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-white/20">v{block.version}</span>
                <span className="text-[8px] text-white/15">{block.scope}</span>
              </div>
            </div>
            {block.description && (
              <p className="text-[9px] text-white/30 mt-1">{block.description}</p>
            )}

            {/* Expanded Content */}
            {selectedBlock?.id === block.id && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                <pre className="text-[10px] text-white/50 bg-white/[0.03] rounded-lg p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono">
                  {block.content}
                </pre>

                {Object.keys(block.variables).length > 0 && (
                  <div>
                    <p className="text-[9px] text-white/25 mb-1">Variablen</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(block.variables).map(([k, v]) => (
                        <span key={k} className="text-[8px] px-1.5 py-0.5 bg-white/5 rounded text-white/40">
                          {`{{${k}}}`}: {String(v)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {block.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {block.tags.map((tag) => (
                      <span key={tag} className="text-[7px] px-1.5 py-0.5 bg-[#3d6b4a]/20 text-[#a8d5b8]/60 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {block.modelHint && (
                  <p className="text-[8px] text-white/20">Model: {block.modelHint}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

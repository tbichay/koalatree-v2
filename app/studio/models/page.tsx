"use client";

import { useState, useEffect } from "react";

interface AIModel {
  id: string;
  provider: string;
  category: string;
  name: string;
  costUnit: string;
  costAmount: number;
  capabilities: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  lastChecked?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  "video-lipsync": "Video — Lip-Sync",
  "video-i2v": "Video — Image-to-Video",
  "image-gen": "Bild-Generierung",
  "text-gen": "Text-Generierung",
  "audio-tts": "Audio — Text-to-Speech",
  "audio-sfx": "Audio — Sound Effects",
};

const COST_UNIT_LABELS: Record<string, string> = {
  "per-second": "/Sek",
  "per-image": "/Bild",
  "per-1k-tokens": "/1K Tokens",
  "per-character": "/Zeichen",
};

export default function ModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/studio/models")
      .then((r) => r.json())
      .then((d) => { setModels(d.models || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-white/30 text-sm p-8">Lade Modelle...</div>;

  // Group by category
  const byCategory = models.reduce<Record<string, AIModel[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">AI Model Registry</h1>
          <p className="text-sm text-white/40">{models.length} Modelle</p>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(byCategory).map(([category, categoryModels]) => (
          <div key={category}>
            <h2 className="text-sm font-medium text-white/50 mb-2">
              {CATEGORY_LABELS[category] || category}
            </h2>
            <div className="space-y-1.5">
              {categoryModels
                .sort((a, b) => a.costAmount - b.costAmount)
                .map((model) => (
                  <div key={model.id} className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#f5eed6]">{model.name}</span>
                          {model.isDefault && (
                            <span className="text-[7px] px-1.5 py-0.5 bg-[#a8d5b8]/20 text-[#a8d5b8] rounded">
                              default
                            </span>
                          )}
                          {!model.isActive && (
                            <span className="text-[7px] px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded">
                              inaktiv
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-white/25 mt-0.5">{model.provider}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#d4a853]">
                        ${model.costAmount.toFixed(3)}{COST_UNIT_LABELS[model.costUnit] || ""}
                      </p>
                      {model.lastChecked && (
                        <p className="text-[8px] text-white/15">
                          Geprueft: {new Date(model.lastChecked).toLocaleDateString("de")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

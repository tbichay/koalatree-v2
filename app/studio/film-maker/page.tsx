"use client";

import { useState } from "react";
import FilmProjects from "../../components/FilmProjects";
import FilmEditor from "../../components/FilmEditor";
import AssetBrowser from "../../components/AssetBrowser";
import StudioVideos from "../../components/StudioVideos";

type Tab = "projekte" | "editor" | "assets" | "marketing";

export default function FilmMakerPage() {
  const [activeTab, setActiveTab] = useState<Tab>("projekte");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const openProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveTab("editor");
  };

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: "projekte", label: "Projekte", emoji: "📁" },
    { id: "editor", label: "Editor", emoji: "🎬" },
    { id: "assets", label: "Assets", emoji: "🎨" },
    { id: "marketing", label: "Marketing", emoji: "📢" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#f5eed6]">🎥 Film Studio</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm transition-all ${
              activeTab === tab.id
                ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium shadow-sm"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            <span>{tab.emoji}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "projekte" && (
        <FilmProjects onOpenProject={openProject} />
      )}

      {activeTab === "editor" && (
        <FilmEditor projectId={selectedProjectId} onBack={() => setActiveTab("projekte")} />
      )}

      {activeTab === "assets" && (
        <AssetBrowser />
      )}

      {activeTab === "marketing" && (
        <StudioVideos />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";

interface Story {
  id: string;
  titel?: string;
  format: string;
  audioUrl?: string;
  audioDauerSek?: number;
  videoUrl?: string;
  kindProfil: { name: string };
}

interface Props {
  onOpenProject: (geschichteId: string) => void;
}

function formatDuration(sek: number): string {
  const m = Math.floor(sek / 60);
  const s = Math.floor(sek % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilmProjects({ onOpenProject }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectDetails, setProjectDetails] = useState<Record<string, { clips: number; totalSize: number; status: string }>>({});

  useEffect(() => {
    fetch("/api/geschichten?all=1")
      .then((r) => r.json())
      .then((data) => {
        const withAudio = data.filter((s: Story) => s.audioUrl);
        setStories(withAudio);

        // Load project details for each story
        withAudio.forEach((story: Story) => {
          fetch(`/api/admin/film-project/${story.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((project) => {
              if (project) {
                setProjectDetails((prev) => ({
                  ...prev,
                  [story.id]: {
                    clips: project.stats.completedScenes,
                    totalSize: project.stats.totalClipSize,
                    // Determine status from actual clip count vs total scenes
                    status: project.stats.completedScenes >= project.stats.totalScenes && project.stats.totalScenes > 0
                      ? "COMPLETED"
                      : project.stats.completedScenes > 0
                        ? "IN_PROGRESS"
                        : "NONE",
                  },
                }));
              }
            })
            .catch(() => {});
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-white/30 text-sm">Projekte laden...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[#f5eed6]">Film-Projekte</h2>
        <span className="text-[10px] text-white/30">{stories.length} Geschichten mit Audio</span>
      </div>

      <div className="space-y-2">
        {stories.map((story) => {
          const details = projectDetails[story.id];
          const hasClips = details && details.clips > 0;
          const isComplete = details?.status === "COMPLETED";

          return (
            <button
              key={story.id}
              onClick={() => onOpenProject(story.id)}
              className="w-full card p-4 text-left hover:border-[#4a7c59]/30 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[#f5eed6] truncate group-hover:text-[#a8d5b8] transition-colors">
                      {story.titel || story.format}
                    </h3>
                    {isComplete && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#4a7c59]/30 text-[#a8d5b8] shrink-0">Fertig</span>
                    )}
                    {hasClips && !isComplete && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d4a853]/20 text-[#d4a853] shrink-0">In Arbeit</span>
                    )}
                    {!hasClips && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 shrink-0">Neu</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                    <span>{story.kindProfil.name}</span>
                    {story.audioDauerSek && <span>{formatDuration(story.audioDauerSek)}</span>}
                    {hasClips && <span>{details.clips} Clips ({formatBytes(details.totalSize)})</span>}
                  </div>
                </div>
                <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Stars from "../../components/Stars";

interface Story {
  id: string;
  titel?: string;
  format: string;
  audioUrl?: string;
  audioDauerSek?: number;
  videoUrl?: string;
  filmScenes?: StoryboardScene[];
  kindProfil: { name: string };
}

interface StoryboardScene {
  type: "dialog" | "landscape" | "transition";
  characterId?: string;
  spokenText?: string;
  sceneDescription: string;
  location: string;
  mood: string;
  camera: string;
  durationHint: number;
  audioStartMs: number;
  audioEndMs: number;
  quality?: "standard" | "premium";
  videoUrl?: string;
  status?: "pending" | "generating" | "done" | "error";
}

const CHAR_INFO: Record<string, { name: string; emoji: string; color: string }> = {
  koda: { name: "Koda", emoji: "🐨", color: "#a8d5b8" },
  kiki: { name: "Kiki", emoji: "🐦", color: "#e8c547" },
  luna: { name: "Luna", emoji: "🦉", color: "#b8a9d4" },
  mika: { name: "Mika", emoji: "🐕", color: "#d4884a" },
  pip: { name: "Pip", emoji: "🦫", color: "#6bb5c9" },
  sage: { name: "Sage", emoji: "🐻", color: "#8a9e7a" },
  nuki: { name: "Nuki", emoji: "☀️", color: "#f0b85a" },
};

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function FilmMakerPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingFilm, setGeneratingFilm] = useState(false);
  const [filmProgress, setFilmProgress] = useState("");
  const [error, setError] = useState("");
  const [editingScene, setEditingScene] = useState<number | null>(null);

  // Load ALL stories with audio (no profile filter — admin sees everything)
  useEffect(() => {
    fetch("/api/geschichten?all=1")
      .then((r) => r.json())
      .then((data) => {
        const withAudio = data.filter((s: Story) => s.audioUrl);
        setStories(withAudio);
        if (withAudio.length > 0) setSelectedStoryId(withAudio[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedStory = stories.find((s) => s.id === selectedStoryId);

  // Generate Storyboard via AI Director
  const generateStoryboard = async () => {
    if (!selectedStoryId) return;
    setGeneratingStoryboard(true);
    setError("");

    try {
      const res = await fetch("/api/admin/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: selectedStoryId }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Fehler");
      const data = await res.json();
      setScenes(data.scenes.map((s: StoryboardScene) => ({ ...s, quality: "standard", status: "pending" })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  // Estimate credits
  const estimateCredits = useCallback(() => {
    let standard = 0;
    let premium = 0;
    let landscape = 0;

    for (const scene of scenes) {
      const dur = (scene.audioEndMs - scene.audioStartMs) / 1000;
      if (scene.type === "dialog") {
        if (scene.quality === "premium") {
          premium += Math.ceil(dur) * 8; // Kling Avatar: 8 credits/s
        } else {
          standard += Math.ceil(dur / 5) * 6; // Hedra: ~6 credits per 5s unit
        }
      } else {
        landscape += 35; // Kling I2V: 35 credits
      }
    }

    return { standard, premium, landscape, total: standard + premium + landscape };
  }, [scenes]);

  // Generate film
  const generateFilm = async () => {
    if (!selectedStoryId || scenes.length === 0) return;
    setGeneratingFilm(true);
    setFilmProgress("Film wird in die Queue eingereiht...");
    setError("");

    try {
      const res = await fetch("/api/generate-film", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: selectedStoryId }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Fehler");
      const data = await res.json();

      if (data.status === "COMPLETED") {
        setFilmProgress("Film ist fertig!");
      } else {
        setFilmProgress(`In der Queue (Position ${(data.position || 0) + 1}). Du bekommst eine Email wenn der Film fertig ist.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
      setFilmProgress("");
    } finally {
      setGeneratingFilm(false);
    }
  };

  const credits = estimateCredits();

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-white/30">Laden...</div>;
  }

  return (
    <div className="relative">
      <Stars />
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 pb-24 sm:pb-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#f5eed6]">🎥 Film-Maker</h1>
          <p className="text-white/50 text-sm mt-1">
            Storyboard erstellen und Geschichten als animierten Film generieren
          </p>
        </div>

        {/* Step 1: Select Story */}
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-medium text-[#f5eed6] mb-3">1. Geschichte auswaehlen</h2>
          <select
            value={selectedStoryId}
            onChange={(e) => { setSelectedStoryId(e.target.value); setScenes([]); }}
            className="w-full text-sm py-2"
          >
            <option value="">Geschichte waehlen...</option>
            {stories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titel || s.format} — {s.kindProfil.name}
                {s.audioDauerSek ? ` (${Math.floor(s.audioDauerSek / 60)}:${String(Math.floor(s.audioDauerSek % 60)).padStart(2, "0")})` : ""}
              </option>
            ))}
          </select>

          {selectedStory && (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={generateStoryboard}
                disabled={generatingStoryboard}
                className="btn-primary text-sm px-5 py-2 disabled:opacity-50"
              >
                {generatingStoryboard ? "Storyboard wird erstellt..." : "2. Storyboard generieren"}
              </button>
              {selectedStory.videoUrl && (
                <a href={`/api/video/film/${selectedStory.id}`} target="_blank" className="text-xs text-[#a8d5b8]">
                  Film existiert bereits →
                </a>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="card p-4 border-red-500/30 bg-red-500/10 mb-6">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Step 2: Storyboard Editor */}
        {scenes.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-sm font-medium text-[#f5eed6]">
                3. Storyboard ({scenes.length} Szenen)
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/30">Alle auf:</span>
                <button
                  onClick={() => setScenes(scenes.map(s => ({ ...s, quality: "standard" })))}
                  className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/50 hover:text-white/80 transition-colors"
                >
                  Standard
                </button>
                <button
                  onClick={() => setScenes(scenes.map(s => ({ ...s, quality: "premium" })))}
                  className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/50 hover:text-white/80 transition-colors"
                >
                  Premium
                </button>
                <span className="text-xs text-white/30 ml-2">~{credits.total} Credits</span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {scenes.map((scene, i) => {
                const char = scene.characterId ? CHAR_INFO[scene.characterId] : null;
                const dur = (scene.audioEndMs - scene.audioStartMs) / 1000;
                const isEditing = editingScene === i;

                return (
                  <div key={i} className="card p-4">
                    <div className="flex items-start gap-3">
                      {/* Character portrait or scene icon */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#1a2e1a] shrink-0 flex items-center justify-center">
                        {char ? (
                          <Image
                            src={`/api/images/${scene.characterId}-portrait.png`}
                            alt={char.name}
                            width={64}
                            height={64}
                            className="object-cover w-full h-full"
                            unoptimized
                          />
                        ) : (
                          <span className="text-2xl">🎬</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-white/30">Szene {i + 1}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                            scene.type === "dialog" ? "bg-[#4a7c59]/20 text-[#a8d5b8]" :
                            scene.type === "landscape" ? "bg-[#4a6fa5]/20 text-[#6bb5c9]" :
                            "bg-white/5 text-white/40"
                          }`}>
                            {scene.type === "dialog" ? `${char?.emoji || "🗣️"} Dialog` :
                             scene.type === "landscape" ? "🏔️ Szene" : "↔️ Übergang"}
                          </span>
                          <span className="text-[10px] text-white/20">{formatTime(scene.audioStartMs)} — {formatTime(scene.audioEndMs)} ({dur.toFixed(1)}s)</span>
                        </div>

                        {isEditing ? (
                          <textarea
                            value={scene.sceneDescription}
                            onChange={(e) => {
                              const updated = [...scenes];
                              updated[i] = { ...updated[i], sceneDescription: e.target.value };
                              setScenes(updated);
                            }}
                            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2 text-white mb-2"
                            rows={2}
                          />
                        ) : (
                          <p className="text-xs text-white/60 mb-1">{scene.sceneDescription}</p>
                        )}

                        {scene.spokenText && (
                          <p className="text-[10px] text-white/30 italic line-clamp-1">
                            &quot;{scene.spokenText.substring(0, 100)}&quot;
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          <select
                            value={scene.quality || "standard"}
                            onChange={(e) => {
                              const updated = [...scenes];
                              updated[i] = { ...updated[i], quality: e.target.value as "standard" | "premium" };
                              setScenes(updated);
                            }}
                            className="text-[10px] py-1 px-1.5"
                          >
                            <option value="standard">Standard (Hedra)</option>
                            <option value="premium">Premium (Kling Avatar)</option>
                          </select>

                          <button
                            onClick={() => setEditingScene(isEditing ? null : i)}
                            className="text-[10px] text-white/30 hover:text-white/60"
                          >
                            {isEditing ? "✓ Fertig" : "✏️ Bearbeiten"}
                          </button>

                          <button
                            onClick={() => setScenes(scenes.filter((_, idx) => idx !== i))}
                            className="text-[10px] text-red-400/40 hover:text-red-400/80"
                          >
                            Entfernen
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Credit Summary + Generate */}
            <div className="card p-5">
              <h3 className="text-sm font-medium text-[#f5eed6] mb-3">4. Film generieren</h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[#f5eed6]">{scenes.length}</p>
                  <p className="text-[10px] text-white/30">Szenen</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[#a8d5b8]">{scenes.filter(s => s.type === "dialog").length}</p>
                  <p className="text-[10px] text-white/30">Dialoge</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[#6bb5c9]">{scenes.filter(s => s.type !== "dialog").length}</p>
                  <p className="text-[10px] text-white/30">Szenen/Übergänge</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[#d4a853]">~{credits.total}</p>
                  <p className="text-[10px] text-white/30">Credits</p>
                </div>
              </div>

              {filmProgress && (
                <p className="text-xs text-[#a8d5b8] mb-3">{filmProgress}</p>
              )}

              <button
                onClick={generateFilm}
                disabled={generatingFilm || scenes.length === 0}
                className="btn-primary text-sm px-6 py-2.5 w-full disabled:opacity-50"
              >
                {generatingFilm ? "Wird gestartet..." : `Film generieren (~${credits.total} Credits)`}
              </button>

              <p className="text-[10px] text-white/30 mt-2 text-center">
                Die Generierung laeuft im Hintergrund. Du bekommst eine Email wenn der Film fertig ist.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

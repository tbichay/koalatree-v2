"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import FilmTimeline from "../../components/FilmTimeline";
import MasteringPanel, { type MasteringSettings, DEFAULT_MASTERING_SETTINGS } from "../../components/MasteringPanel";

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
  lastFrameUrl?: string;
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
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function estimateCredits(scene: StoryboardScene): number {
  const dur = (scene.audioEndMs - scene.audioStartMs) / 1000;
  if (scene.type !== "dialog") return 35;
  if (scene.quality === "premium") return Math.ceil(dur) * 8;
  return Math.ceil(dur / 5) * 6;
}

export default function FilmMakerPage() {
  // Story selection
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [loading, setLoading] = useState(true);

  // Storyboard
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [selectedScene, setSelectedScene] = useState(0);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);

  // Scene generation
  const [generatingScene, setGeneratingScene] = useState(false);
  const [sceneProgress, setSceneProgress] = useState("");

  // AI edit
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Mastering
  const [mastering, setMastering] = useState<MasteringSettings>(DEFAULT_MASTERING_SETTINGS);
  const [rendering, setRendering] = useState(false);

  // General
  const [error, setError] = useState("");

  // Load stories
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
  const currentScene = scenes[selectedScene];
  const completedScenes = scenes.filter((s) => s.videoUrl || s.status === "done").length;
  const totalCredits = scenes.reduce((sum, s) => sum + estimateCredits(s), 0);

  // Generate storyboard
  const generateStoryboard = async () => {
    if (!selectedStoryId) return;
    setGeneratingStoryboard(true);
    setError("");
    try {
      const res = await fetch("/api/admin/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: selectedStoryId, force: scenes.length > 0 }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setScenes(data.scenes.map((s: StoryboardScene) => ({ ...s, quality: "standard", status: "pending" })));
      setSelectedScene(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  // Generate ONE scene clip
  const generateSceneClip = async () => {
    if (!selectedStoryId || !currentScene) return;
    setGeneratingScene(true);
    setSceneProgress("Clip wird generiert...");
    setError("");

    // Update scene status
    const updated = [...scenes];
    updated[selectedScene] = { ...updated[selectedScene], status: "generating" };
    setScenes(updated);

    try {
      const res = await fetch("/api/generate-scene-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geschichteId: selectedStoryId,
          sceneIndex: selectedScene,
          scene: currentScene,
          // Frame chaining: pass previous scene's last frame
          previousLastFrameUrl: selectedScene > 0 ? scenes[selectedScene - 1]?.lastFrameUrl : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      // Update scene with video URL
      const updatedAfter = [...scenes];
      updatedAfter[selectedScene] = {
        ...updatedAfter[selectedScene],
        videoUrl: data.videoUrl,
        lastFrameUrl: data.lastFrameUrl,
        status: "done",
      };
      setScenes(updatedAfter);
      setSceneProgress("Clip fertig!");

      // Save scenes to DB
      await fetch("/api/admin/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: selectedStoryId, scenes: updatedAfter }),
      });
    } catch (err) {
      const updatedErr = [...scenes];
      updatedErr[selectedScene] = { ...updatedErr[selectedScene], status: "error" };
      setScenes(updatedErr);
      setError(err instanceof Error ? err.message : "Fehler");
      setSceneProgress("");
    } finally {
      setGeneratingScene(false);
    }
  };

  // AI prompt edit
  const handleAiEdit = async () => {
    if (!aiPrompt.trim() || !currentScene) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/edit-scene-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDescription: currentScene.sceneDescription,
          userInstruction: aiPrompt,
          characterId: currentScene.characterId,
          sceneType: currentScene.type,
        }),
      });
      if (!res.ok) throw new Error("Fehler");
      const data = await res.json();
      const updated = [...scenes];
      updated[selectedScene] = { ...updated[selectedScene], sceneDescription: data.newDescription };
      setScenes(updated);
      setAiPrompt("");
    } catch {
      setError("KI-Bearbeitung fehlgeschlagen");
    } finally {
      setAiLoading(false);
    }
  };

  // Set quality for all
  const setAllQuality = (q: "standard" | "premium") => {
    setScenes(scenes.map((s) => ({ ...s, quality: q })));
  };

  if (loading) return <div className="p-8 text-white/30">Laden...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 sm:pb-6">
      {/* Header + Story Selection */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-[#f5eed6]">🎥 Film Studio</h1>
        <div className="flex items-center gap-2">
          <select
            value={selectedStoryId}
            onChange={(e) => { setSelectedStoryId(e.target.value); setScenes([]); }}
            className="text-xs py-1.5"
          >
            {stories.map((s) => (
              <option key={s.id} value={s.id}>{s.titel || s.format} — {s.kindProfil.name}</option>
            ))}
          </select>
          <button
            onClick={generateStoryboard}
            disabled={generatingStoryboard || !selectedStoryId}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {generatingStoryboard ? "..." : scenes.length > 0 ? "🔄 Neu" : "Storyboard"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">{error}</p>
          <button onClick={() => setError("")} className="text-[10px] text-red-400/60 mt-1">Schliessen</button>
        </div>
      )}

      {scenes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
          {/* Left Column: Preview + Timeline */}
          <div className="space-y-3">
            {/* Video Preview */}
            <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] max-h-[500px] relative">
              {currentScene?.videoUrl ? (
                <video
                  key={currentScene.videoUrl}
                  src={currentScene.videoUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/30">
                  {currentScene?.characterId && (
                    <div className="w-20 h-20 rounded-2xl overflow-hidden mb-3 opacity-40">
                      <Image
                        src={`/api/images/${currentScene.characterId}-portrait.png`}
                        alt=""
                        width={80}
                        height={80}
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <p className="text-xs">Noch kein Clip generiert</p>
                  <p className="text-[10px] mt-1 text-white/20">
                    ~{estimateCredits(currentScene || scenes[0])} Credits
                  </p>
                </div>
              )}
              {/* Scene number badge */}
              <div className="absolute top-3 left-3 bg-black/60 text-white/70 text-[10px] px-2 py-0.5 rounded-full">
                Szene {selectedScene + 1}/{scenes.length}
              </div>
              {/* Frame chain indicator */}
              {selectedScene > 0 && scenes[selectedScene - 1]?.lastFrameUrl && (
                <div className="absolute top-3 right-3 bg-[#4a7c59]/60 text-[#a8d5b8] text-[9px] px-2 py-0.5 rounded-full">
                  🔗 Frame-Chain
                </div>
              )}
            </div>

            {/* Timeline */}
            <FilmTimeline
              scenes={scenes}
              selectedIndex={selectedScene}
              onSelect={setSelectedScene}
            />

            {/* Stats */}
            <div className="flex items-center justify-between text-[10px] text-white/30 px-1">
              <span>{completedScenes}/{scenes.length} Szenen fertig</span>
              <span>~{totalCredits} Credits gesamt</span>
              <div className="flex gap-1">
                <button onClick={() => setAllQuality("standard")} className="text-white/40 hover:text-white/70 px-1.5 py-0.5 rounded bg-white/5">Alle Standard</button>
                <button onClick={() => setAllQuality("premium")} className="text-white/40 hover:text-white/70 px-1.5 py-0.5 rounded bg-white/5">Alle Premium</button>
              </div>
            </div>

            {/* Mastering */}
            <MasteringPanel
              settings={mastering}
              onChange={setMastering}
              onRender={() => { /* TODO: mastering render */ }}
              rendering={rendering}
              completedScenes={completedScenes}
            />
          </div>

          {/* Right Column: Scene Editor */}
          <div className="card p-4 h-fit sticky top-20">
            {currentScene && (
              <>
                {/* Scene header */}
                <div className="flex items-center gap-2 mb-3">
                  {currentScene.characterId && (
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                      <Image
                        src={`/api/images/${currentScene.characterId}-portrait.png`}
                        alt=""
                        width={40}
                        height={40}
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[#f5eed6]">Szene {selectedScene + 1}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        currentScene.type === "dialog" ? "bg-[#4a7c59]/20 text-[#a8d5b8]" :
                        "bg-[#4a6fa5]/20 text-[#6bb5c9]"
                      }`}>
                        {currentScene.type === "dialog"
                          ? `${CHAR_INFO[currentScene.characterId || ""]?.name || "Dialog"}`
                          : currentScene.type === "landscape" ? "Szene" : "Übergang"}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/30">
                      {formatTime(currentScene.audioStartMs)} — {formatTime(currentScene.audioEndMs)}
                      ({((currentScene.audioEndMs - currentScene.audioStartMs) / 1000).toFixed(1)}s)
                    </p>
                  </div>
                </div>

                {/* Scene description / prompt */}
                <div className="mb-3">
                  <label className="text-[10px] text-white/30 block mb-1">Szenen-Beschreibung</label>
                  <textarea
                    value={currentScene.sceneDescription}
                    onChange={(e) => {
                      const updated = [...scenes];
                      updated[selectedScene] = { ...updated[selectedScene], sceneDescription: e.target.value };
                      setScenes(updated);
                    }}
                    className="w-full text-xs bg-white/5 border border-white/10 rounded-lg p-2 text-white resize-none"
                    rows={3}
                  />
                </div>

                {/* Spoken text preview */}
                {currentScene.spokenText && (
                  <div className="mb-3 p-2 bg-white/5 rounded-lg">
                    <p className="text-[10px] text-white/30 mb-0.5">Dialog:</p>
                    <p className="text-[10px] text-white/50 italic line-clamp-2">
                      &quot;{currentScene.spokenText}&quot;
                    </p>
                  </div>
                )}

                {/* AI Edit */}
                <div className="mb-3">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAiEdit()}
                      placeholder="🤖 z.B. 'Kiki fliegt durchs Bild'"
                      className="flex-1 text-[11px] px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/20"
                      disabled={aiLoading}
                    />
                    <button
                      onClick={handleAiEdit}
                      disabled={aiLoading || !aiPrompt.trim()}
                      className="text-[10px] px-2.5 py-1.5 bg-[#4a7c59]/30 text-[#a8d5b8] rounded-lg disabled:opacity-40 shrink-0"
                    >
                      {aiLoading ? "..." : "OK"}
                    </button>
                  </div>
                </div>

                {/* Quality + Credits */}
                <div className="flex items-center gap-2 mb-3">
                  <select
                    value={currentScene.quality || "standard"}
                    onChange={(e) => {
                      const updated = [...scenes];
                      updated[selectedScene] = { ...updated[selectedScene], quality: e.target.value as "standard" | "premium" };
                      setScenes(updated);
                    }}
                    className="text-[10px] py-1 flex-1"
                  >
                    <option value="standard">Standard (Hedra) ~{estimateCredits({ ...currentScene, quality: "standard" })} Cr</option>
                    <option value="premium">Premium (Kling) ~{estimateCredits({ ...currentScene, quality: "premium" })} Cr</option>
                  </select>
                </div>

                {/* Generate button */}
                {sceneProgress && (
                  <p className="text-[10px] text-[#a8d5b8] mb-2">{sceneProgress}</p>
                )}

                <button
                  onClick={generateSceneClip}
                  disabled={generatingScene}
                  className={`w-full text-xs py-2.5 rounded-xl font-medium transition-all ${
                    currentScene.videoUrl
                      ? "bg-white/5 text-white/50 hover:bg-white/10"
                      : "btn-primary"
                  } disabled:opacity-50`}
                >
                  {generatingScene
                    ? "Generiert... (~2 Min)"
                    : currentScene.videoUrl
                      ? `🔄 Neu generieren (~${estimateCredits(currentScene)} Cr)`
                      : `▶ Clip generieren (~${estimateCredits(currentScene)} Cr)`}
                </button>

                {/* Navigation */}
                <div className="flex justify-between mt-3">
                  <button
                    onClick={() => setSelectedScene(Math.max(0, selectedScene - 1))}
                    disabled={selectedScene === 0}
                    className="text-[10px] text-white/30 hover:text-white/60 disabled:opacity-30"
                  >
                    ← Vorherige
                  </button>
                  <button
                    onClick={() => setSelectedScene(Math.min(scenes.length - 1, selectedScene + 1))}
                    disabled={selectedScene === scenes.length - 1}
                    className="text-[10px] text-white/30 hover:text-white/60 disabled:opacity-30"
                  >
                    Nächste →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {scenes.length === 0 && selectedStoryId && !generatingStoryboard && (
        <div className="card p-8 text-center">
          <p className="text-white/40 text-sm mb-3">Waehle eine Geschichte und generiere ein Storyboard</p>
          <button onClick={generateStoryboard} className="btn-primary text-sm px-6 py-2">
            Storyboard generieren
          </button>
        </div>
      )}
    </div>
  );
}

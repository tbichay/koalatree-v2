"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import FilmTimeline from "./FilmTimeline";
import MasteringPanel, { type MasteringSettings, DEFAULT_MASTERING_SETTINGS } from "./MasteringPanel";

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
  status?: string;
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

interface Props {
  projectId: string | null;
  onBack: () => void;
}

export default function FilmEditor({ projectId, onBack }: Props) {
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [selectedScene, setSelectedScene] = useState(0);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingScene, setGeneratingScene] = useState(false);
  const [sceneProgress, setSceneProgress] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [mastering, setMastering] = useState<MasteringSettings>(DEFAULT_MASTERING_SETTINGS);
  const [error, setError] = useState("");

  // Load project with existing clips
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError("");

    fetch(`/api/admin/film-project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setProjectTitle(data.geschichte?.titel || "Unbenannt");
        if (data.scenes && data.scenes.length > 0) {
          setScenes(data.scenes.map((s: StoryboardScene) => ({
            ...s,
            quality: s.quality || "standard",
          })));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const currentScene = scenes[selectedScene];
  const completedScenes = scenes.filter((s) => s.videoUrl || s.status === "done").length;
  const totalCredits = scenes.reduce((sum, s) => sum + estimateCredits(s), 0);

  // Generate storyboard
  const generateStoryboard = async () => {
    if (!projectId) return;
    setGeneratingStoryboard(true);
    setError("");
    try {
      const res = await fetch("/api/admin/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: projectId, force: scenes.length > 0 }),
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
    if (!projectId || !currentScene) return;
    setGeneratingScene(true);
    setSceneProgress("Clip wird generiert (~2 Min)...");
    setError("");

    const updated = [...scenes];
    updated[selectedScene] = { ...updated[selectedScene], status: "generating" };
    setScenes(updated);

    try {
      const res = await fetch("/api/generate-scene-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geschichteId: projectId,
          sceneIndex: selectedScene,
          scene: currentScene,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      const updatedAfter = [...scenes];
      updatedAfter[selectedScene] = { ...updatedAfter[selectedScene], videoUrl: data.videoUrl, status: "done" };
      setScenes(updatedAfter);
      setSceneProgress("Clip fertig!");

      // Save to DB
      await fetch("/api/admin/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: projectId, scenes: updatedAfter }),
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

  if (!projectId) {
    return (
      <div className="card p-8 text-center text-white/40">
        <p className="mb-3">Kein Projekt ausgewaehlt</p>
        <button onClick={onBack} className="btn-primary text-xs px-4 py-2">Projekte anzeigen</button>
      </div>
    );
  }

  if (loading) return <div className="text-white/30 text-sm p-4">Projekt wird geladen...</div>;

  return (
    <div>
      {/* Project Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-white/30 hover:text-white/60 text-xs">← Zurück</button>
        <h2 className="text-sm font-medium text-[#f5eed6] truncate">{projectTitle}</h2>
        <button
          onClick={generateStoryboard}
          disabled={generatingStoryboard}
          className="text-[10px] px-2 py-1 bg-white/5 text-white/40 hover:text-white/70 rounded shrink-0 disabled:opacity-50"
        >
          {generatingStoryboard ? "..." : scenes.length > 0 ? "🔄 Storyboard neu" : "Storyboard generieren"}
        </button>
        <span className="text-[10px] text-white/20 ml-auto">{completedScenes}/{scenes.length} Clips · ~{totalCredits} Cr</span>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400/60">✕</button>
        </div>
      )}

      {scenes.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-4">
          {/* Left: Preview + Timeline + Mastering */}
          <div className="space-y-3">
            {/* Video Preview */}
            <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] max-h-[450px] relative">
              {currentScene?.videoUrl ? (
                <video key={currentScene.videoUrl} src={currentScene.videoUrl} controls className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/30">
                  {currentScene?.characterId && (
                    <div className="w-16 h-16 rounded-xl overflow-hidden mb-2 opacity-40">
                      <Image src={`/api/images/${currentScene.characterId}-portrait.png`} alt="" width={64} height={64} className="object-cover" unoptimized />
                    </div>
                  )}
                  <p className="text-[10px]">Noch kein Clip</p>
                  <p className="text-[8px] mt-1 text-white/15">~{currentScene ? estimateCredits(currentScene) : 0} Credits</p>
                </div>
              )}
              <div className="absolute top-2 left-2 bg-black/60 text-white/60 text-[9px] px-1.5 py-0.5 rounded-full">
                {selectedScene + 1}/{scenes.length}
              </div>
            </div>

            <FilmTimeline scenes={scenes} selectedIndex={selectedScene} onSelect={setSelectedScene} />

            <div className="flex gap-1 text-[9px] text-white/20 px-1">
              <button onClick={() => setScenes(scenes.map(s => ({ ...s, quality: "standard" })))} className="px-1.5 py-0.5 bg-white/5 rounded hover:text-white/50">Alle Standard</button>
              <button onClick={() => setScenes(scenes.map(s => ({ ...s, quality: "premium" })))} className="px-1.5 py-0.5 bg-white/5 rounded hover:text-white/50">Alle Premium</button>
            </div>

            <MasteringPanel settings={mastering} onChange={setMastering} onRender={() => {}} rendering={false} completedScenes={completedScenes} />
          </div>

          {/* Right: Scene Editor */}
          <div className="card p-3 h-fit sticky top-20 space-y-3">
            {currentScene && (
              <>
                <div className="flex items-center gap-2">
                  {currentScene.characterId && (
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                      <Image src={`/api/images/${currentScene.characterId}-portrait.png`} alt="" width={32} height={32} className="object-cover" unoptimized />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-[#f5eed6]">Szene {selectedScene + 1}</span>
                    <span className={`text-[8px] ml-1.5 px-1 py-0.5 rounded ${currentScene.type === "dialog" ? "bg-[#4a7c59]/20 text-[#a8d5b8]" : "bg-[#4a6fa5]/20 text-[#6bb5c9]"}`}>
                      {currentScene.type === "dialog" ? CHAR_INFO[currentScene.characterId || ""]?.name || "Dialog" : "Szene"}
                    </span>
                    <p className="text-[8px] text-white/20">{formatTime(currentScene.audioStartMs)} — {formatTime(currentScene.audioEndMs)}</p>
                  </div>
                </div>

                <textarea
                  value={currentScene.sceneDescription}
                  onChange={(e) => { const u = [...scenes]; u[selectedScene] = { ...u[selectedScene], sceneDescription: e.target.value }; setScenes(u); }}
                  className="w-full text-[10px] bg-white/5 border border-white/10 rounded-lg p-2 text-white resize-none"
                  rows={3}
                />

                {currentScene.spokenText && (
                  <p className="text-[9px] text-white/25 italic p-2 bg-white/5 rounded-lg line-clamp-2">
                    &quot;{currentScene.spokenText.substring(0, 120)}&quot;
                  </p>
                )}

                <div className="flex gap-1.5">
                  <input
                    type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAiEdit()}
                    placeholder="🤖 KI-Anweisung..."
                    className="flex-1 text-[10px] px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/15"
                    disabled={aiLoading}
                  />
                  <button onClick={handleAiEdit} disabled={aiLoading || !aiPrompt.trim()} className="text-[9px] px-2 py-1.5 bg-[#4a7c59]/30 text-[#a8d5b8] rounded-lg disabled:opacity-40">
                    {aiLoading ? "..." : "OK"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {/* Character selector */}
                  <div>
                    <label className="text-[8px] text-white/20 block mb-0.5">Charakter</label>
                    <select
                      value={currentScene.characterId || ""}
                      onChange={(e) => { const u = [...scenes]; u[selectedScene] = { ...u[selectedScene], characterId: e.target.value || undefined }; setScenes(u); }}
                      className="w-full text-[9px] py-1"
                    >
                      <option value="">Kein Charakter</option>
                      {Object.entries(CHAR_INFO).map(([id, c]) => (
                        <option key={id} value={id}>{c.emoji} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quality selector */}
                  <div>
                    <label className="text-[8px] text-white/20 block mb-0.5">Qualitaet</label>
                    <select
                      value={currentScene.quality || "standard"}
                      onChange={(e) => { const u = [...scenes]; u[selectedScene] = { ...u[selectedScene], quality: e.target.value as "standard" | "premium" }; setScenes(u); }}
                      className="w-full text-[9px] py-1"
                    >
                      <option value="standard">Standard ~{estimateCredits({ ...currentScene, quality: "standard" })} Cr</option>
                      <option value="premium">Premium ~{estimateCredits({ ...currentScene, quality: "premium" })} Cr</option>
                    </select>
                  </div>
                </div>

                {/* Scene type selector */}
                <div>
                  <label className="text-[8px] text-white/20 block mb-0.5">Szenen-Typ</label>
                  <div className="flex gap-1">
                    {(["dialog", "landscape", "transition"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { const u = [...scenes]; u[selectedScene] = { ...u[selectedScene], type: t }; setScenes(u); }}
                        className={`flex-1 text-[8px] py-1 rounded ${currentScene.type === t ? "bg-[#4a7c59]/30 text-[#a8d5b8]" : "bg-white/5 text-white/30"}`}
                      >
                        {t === "dialog" ? "🗣️ Dialog" : t === "landscape" ? "🏔️ Szene" : "↔️ Übergang"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scene image generator */}
                <div className="border-t border-white/5 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[8px] text-white/20">Szenen-Bild (fuer Animation)</label>
                    <div className="flex gap-1">
                      {/* Group image button */}
                      <button
                        onClick={async () => {
                          setSceneProgress("Gruppen-Bild wird generiert...");
                          try {
                            const res = await fetch("/api/admin/generate-scene-image", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                type: "group",
                                characterIds: ["koda", "kiki", "luna", "mika", "pip", "sage", "nuki"],
                                customPrompt: currentScene.sceneDescription,
                                landscapeId: "koalatree_full",
                                sceneBackground: "golden",
                                size: "1792x1024",
                                geschichteId: projectId,
                                sceneIndex: selectedScene,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);
                            setSceneProgress("Gruppen-Bild generiert!");
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Fehler");
                            setSceneProgress("");
                          }
                        }}
                        className="text-[7px] px-1.5 py-0.5 bg-[#b8a9d4]/20 text-[#b8a9d4] rounded hover:bg-[#b8a9d4]/30"
                        title="Alle Charaktere zusammen"
                      >
                        👥 Gruppe
                      </button>

                      {/* Single image button */}
                      <button
                        onClick={async () => {
                          setSceneProgress("Szenen-Bild wird generiert...");
                          try {
                            const res = await fetch("/api/admin/generate-scene-image", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                type: currentScene.type === "dialog" ? "character" : "landscape",
                                characterId: currentScene.characterId,
                                customPrompt: currentScene.sceneDescription,
                                sceneBackground: currentScene.mood?.includes("nacht") ? "night" : currentScene.mood?.includes("morgen") ? "dawn" : "golden",
                                size: "1792x1024",
                                geschichteId: projectId,
                                sceneIndex: selectedScene,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          setSceneProgress(`Bild generiert! ${data.revisedPrompt?.substring(0, 60)}...`);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Bild-Generierung fehlgeschlagen");
                          setSceneProgress("");
                        }
                      }}
                      className="text-[8px] px-2 py-0.5 bg-[#d4a853]/20 text-[#d4a853] rounded hover:bg-[#d4a853]/30"
                    >
                      🎨 Bild (~$0.08)
                    </button>
                    </div>
                  </div>

                  {/* Landscape preset selector */}
                  {currentScene.type !== "dialog" && (
                    <select
                      className="w-full text-[8px] py-0.5 mb-1"
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const presets: Record<string, string> = {
                          koalatree_full: "Der riesige magische KoalaTree in voller Groesse, goldenes Abendlicht",
                          beach: "Australischer Strand bei Sonnenuntergang, sanfte Wellen, Eukalyptusbaeume im Hintergrund",
                          stream: "Sanfter Waldbach neben den Wurzeln des KoalaTree, kristallklares Wasser",
                          meadow: "Offene Wiese nahe dem KoalaTree, goldenes Gras, Wildblumen",
                          night_forest: "KoalaTree bei Nacht, Sternenhimmel, Vollmond, Gluehwuermchen",
                          forest_floor: "Waldboden unter dem KoalaTree, Wurzeln, Moos, Sonnenstrahlen",
                        };
                        const desc = presets[e.target.value] || "";
                        const u = [...scenes];
                        u[selectedScene] = { ...u[selectedScene], sceneDescription: desc };
                        setScenes(u);
                      }}
                    >
                      <option value="">Landschaft waehlen...</option>
                      <option value="koalatree_full">🌳 KoalaTree (gross)</option>
                      <option value="beach">🏖️ Strand</option>
                      <option value="stream">💧 Waldbach</option>
                      <option value="meadow">🌾 Wiese</option>
                      <option value="night_forest">🌙 Nacht-Wald</option>
                      <option value="forest_floor">🍂 Waldboden</option>
                    </select>
                  )}
                </div>

                {sceneProgress && <p className="text-[9px] text-[#a8d5b8]">{sceneProgress}</p>}

                <button
                  onClick={generateSceneClip}
                  disabled={generatingScene}
                  className={`w-full text-[10px] py-2 rounded-xl font-medium ${currentScene.videoUrl ? "bg-white/5 text-white/40 hover:bg-white/10" : "btn-primary"} disabled:opacity-50`}
                >
                  {generatingScene ? "Generiert..." : currentScene.videoUrl ? "🔄 Neu generieren" : `▶ Clip generieren (~${estimateCredits(currentScene)} Cr)`}
                </button>

                <div className="flex justify-between">
                  <button onClick={() => setSelectedScene(Math.max(0, selectedScene - 1))} disabled={selectedScene === 0} className="text-[9px] text-white/25 hover:text-white/50 disabled:opacity-30">← Vorherige</button>
                  <button onClick={() => setSelectedScene(Math.min(scenes.length - 1, selectedScene + 1))} disabled={selectedScene === scenes.length - 1} className="text-[9px] text-white/25 hover:text-white/50 disabled:opacity-30">Nächste →</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-white/40 text-sm mb-3">Noch kein Storyboard. Generiere eins um loszulegen.</p>
          <button onClick={generateStoryboard} disabled={generatingStoryboard} className="btn-primary text-sm px-6 py-2 disabled:opacity-50">
            {generatingStoryboard ? "Wird erstellt..." : "Storyboard generieren"}
          </button>
        </div>
      )}
    </div>
  );
}

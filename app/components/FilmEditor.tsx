"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import FilmTimeline from "./FilmTimeline";
import FilmPlayer from "./FilmPlayer";
import MasteringPanel, { type MasteringSettings, DEFAULT_MASTERING_SETTINGS } from "./MasteringPanel";
import PromptVersions, { type PromptVersion } from "./PromptVersions";

interface StoryboardScene {
  type: "dialog" | "landscape" | "transition" | "intro" | "outro";
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
  clipName?: string;
  clipBlobUrl?: string;
  clipSize?: number;
  landscapePreset?: string;
  transitionTo?: "cut" | "flow" | "zoom-to-character";
  clipMetadata?: {
    provider?: string;
    estimatedCostUsd?: string;
    generatedAt?: string;
    audioSegmentBytes?: number;
    audioDurationSec?: string;
  };
  promptVersions?: PromptVersion[];
  selectedPromptId?: string;
  sceneImageUrl?: string;
}

const CHAR_INFO: Record<string, { name: string; emoji: string; color: string }> = {
  koda: { name: "Koda", emoji: "\u{1F428}", color: "#a8d5b8" },
  kiki: { name: "Kiki", emoji: "\u{1F426}", color: "#e8c547" },
  luna: { name: "Luna", emoji: "\u{1F989}", color: "#b8a9d4" },
  mika: { name: "Mika", emoji: "\u{1F415}", color: "#d4884a" },
  pip: { name: "Pip", emoji: "\u{1F9AB}", color: "#6bb5c9" },
  sage: { name: "Sage", emoji: "\u{1F43B}", color: "#8a9e7a" },
  nuki: { name: "Nuki", emoji: "\u2600\uFE0F", color: "#f0b85a" },
};

const TYPE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  dialog: { label: "Dialog", bg: "bg-[#4a7c59]/20", text: "text-[#a8d5b8]" },
  landscape: { label: "Szene", bg: "bg-[#4a6fa5]/20", text: "text-[#6bb5c9]" },
  transition: { label: "\u00dcbergang", bg: "bg-[#7c4a7c]/20", text: "text-[#c9a0d4]" },
  intro: { label: "Vorspann", bg: "bg-[#d4a853]/20", text: "text-[#d4a853]" },
  outro: { label: "Abspann", bg: "bg-[#d4a853]/20", text: "text-[#d4a853]" },
};

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Estimated cost in cents (USD) per scene based on provider
/**
 * Extract the last frame from a video and upload it as PNG.
 * Uses a hidden video element + canvas to capture the frame client-side.
 * This frame is used as the start image for the NEXT clip generation.
 */
async function extractAndUploadLastFrame(videoUrl: string, geschichteId: string, sceneIndex: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";

    video.onloadedmetadata = () => {
      // Seek to last frame (0.1s before end)
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    video.onseeked = async () => {
      try {
        // Draw frame to canvas
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No canvas context")); return; }
        ctx.drawImage(video, 0, 0);

        // Convert to PNG blob
        const blob = await new Promise<Blob>((res, rej) => {
          canvas.toBlob((b) => b ? res(b) : rej(new Error("Canvas toBlob failed")), "image/png");
        });

        // Upload as frame for next clip
        const formData = new FormData();
        formData.append("frame", blob, "frame.png");
        formData.append("geschichteId", geschichteId);
        formData.append("sceneIndex", String(sceneIndex));

        await fetch("/api/admin/upload-frame", {
          method: "POST",
          body: formData,
        });

        resolve();
      } catch (err) {
        reject(err);
      } finally {
        video.remove();
      }
    };

    video.onerror = () => { video.remove(); reject(new Error("Video load failed")); };
    video.src = videoUrl;
  });
}

function estimateCostCents(scene: StoryboardScene): number {
  const dur = Math.max(1, (scene.audioEndMs - scene.audioStartMs) / 1000);
  const isPremium = scene.quality === "premium";

  if (scene.type === "dialog" || scene.type === "intro" || scene.type === "outro") {
    if (isPremium) {
      return Math.ceil(Math.max(5, dur) * 16.4); // Veo 3.1 + LipSync
    }
    return 33; // Seedance + LipSync ~$0.33 per clip (fixed ~5s)
  }
  // Landscape: Premium = Kling Pro, Standard = Seedance
  if (isPremium) return 100; // Kling 3.0 Pro ~$1.00/clip
  return 26; // Seedance 1.5 ~$0.26/clip
}

function formatCost(cents: number): string {
  if (cents < 100) return `~${cents}ct`;
  return `~$${(cents / 100).toFixed(2)}`;
}

interface Props {
  projectId: string | null;
  onBack: () => void;
}

export default function FilmEditor({ projectId, onBack }: Props) {
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [selectedScene, setSelectedScene] = useState(0);
  const [projectTitle, setProjectTitle] = useState("");
  const [renderedFilmUrl, setRenderedFilmUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingScene, setGeneratingScene] = useState(false);
  const [sceneProgress, setSceneProgress] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [mastering, setMastering] = useState<MasteringSettings>(DEFAULT_MASTERING_SETTINGS);
  const [error, setError] = useState("");
  const [filmMode, setFilmMode] = useState(false);

  // New state
  const [audioUrl, setAudioUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingSegment, setPlayingSegment] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingSceneIndex, setGeneratingSceneIndex] = useState<number | null>(null);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [videoModal, setVideoModal] = useState<string | null>(null);
  const [masteringOpen, setMasteringOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState("");

  const [regeneratingAudio, setRegeneratingAudio] = useState(false);

  // Per-scene AI prompts (so each card has its own input)
  const [aiPrompts, setAiPrompts] = useState<Record<number, string>>({});
  // Per-scene AI loading states
  const [aiLoadingMap, setAiLoadingMap] = useState<Record<number, boolean>>({});

  // Load project
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError("");

    fetch(`/api/admin/film-project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setProjectTitle(data.geschichte?.titel || "Unbenannt");
        if (data.geschichte?.audioUrl) {
          setAudioUrl(data.geschichte.audioUrl);
        }
        if (data.geschichte?.videoUrl) {
          setRenderedFilmUrl(`${data.geschichte.videoUrl}?t=${Date.now()}`);
        }
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

  // Stop audio when segment ends
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || playingSegment === null) return;
    const scene = scenes[playingSegment];
    if (!scene) return;

    const endTimeSec = scene.audioEndMs / 1000;
    const onTimeUpdate = () => {
      if (audio.currentTime >= endTimeSec) {
        audio.pause();
        setPlayingSegment(null);
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [playingSegment, scenes]);

  const completedScenes = scenes.filter((s) => s.videoUrl || s.status === "done").length;
  const totalCostCents = scenes.reduce((sum, s) => sum + estimateCostCents(s), 0);
  const pendingCount = scenes.filter((s) => !s.videoUrl && s.status !== "done").length;

  // Audio segment player — waits for audio to be seekable before setting currentTime
  const playSegment = (sceneIndex: number) => {
    const audio = audioRef.current;
    const scene = scenes[sceneIndex];
    if (!audio || !scene || !audioUrl) return;

    if (playingSegment === sceneIndex) {
      audio.pause();
      setPlayingSegment(null);
      return;
    }

    const startSec = scene.audioStartMs / 1000;
    setPlayingSegment(sceneIndex);

    const seekAndPlay = () => {
      audio.currentTime = startSec;
      audio.play().catch(() => {});
    };

    // If audio metadata is loaded and we can seek, do it immediately
    if (audio.readyState >= 1) {
      seekAndPlay();
    } else {
      // Wait for metadata to load, then seek
      const onLoaded = () => {
        seekAndPlay();
        audio.removeEventListener("loadedmetadata", onLoaded);
      };
      audio.addEventListener("loadedmetadata", onLoaded);
      audio.load(); // Force metadata load
    }
  };

  // Full audio play/pause
  const [audioPlaying, setAudioPlaying] = useState(false);
  const toggleFullAudio = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
      setPlayingSegment(null);
    } else {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      setAudioPlaying(true);
      setPlayingSegment(null);
    }
  };

  // Regenerate audio (creates fresh audio with timeline data)
  const regenerateAudio = async () => {
    if (!projectId) return;
    setRegeneratingAudio(true);
    setError("");
    try {
      // Fetch story text
      const storyRes = await fetch(`/api/geschichten/${projectId}`);
      const storyData = await storyRes.json();
      if (!storyData.text) throw new Error("Kein Story-Text gefunden");

      // Queue audio generation
      const res = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: storyData.text, geschichteId: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audio-Fehler");

      if (data.status === "COMPLETED") {
        // Already done (immediate)
        setAudioUrl(`/api/audio/${projectId}`);
        setError("");
        setSceneProgress("Audio neu generiert! Timeline gespeichert.");
      } else {
        // Queued — poll for completion
        const jobId = data.jobId;
        setSceneProgress("Audio wird generiert...");
        let attempts = 0;
        while (attempts < 60) { // max 2 minutes
          await new Promise((r) => setTimeout(r, 2000));
          const statusRes = await fetch(`/api/generation-queue/${jobId}/status`);
          const status = await statusRes.json();
          if (status.status === "COMPLETED") {
            setAudioUrl(`/api/audio/${projectId}`);
            setSceneProgress("Audio neu generiert! Jetzt Storyboard neu generieren.");
            break;
          }
          if (status.status === "FAILED") throw new Error(status.error || "Audio fehlgeschlagen");
          attempts++;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio-Fehler");
      setSceneProgress("");
    } finally {
      setRegeneratingAudio(false);
    }
  };

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

      // Handle both JSON (cached) and SSE (generation) responses
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Storyboard-Fehler");
        setScenes(data.scenes.map((s: StoryboardScene) => ({ ...s, quality: "standard", status: "pending" })));
      } else {
        // SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("Keine Antwort");
        const decoder = new TextDecoder();
        let buf = "";
        let result: Record<string, unknown> = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const msgs = buf.split("\n\n");
          buf = msgs.pop() || "";
          for (const msg of msgs) {
            for (const line of msg.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.progress) setSceneProgress(parsed.progress);
                if (parsed.done) result = parsed;
              } catch { /* incomplete */ }
            }
          }
        }

        if (result.error) throw new Error(result.error as string);
        const newScenes = (result.scenes as StoryboardScene[]) || [];
        setScenes(newScenes.map((s) => ({ ...s, quality: "standard", status: "pending" })));
      }
      setSelectedScene(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  // Generate ONE scene clip + save prompt version
  const generateSceneClip = async (index?: number) => {
    const targetIndex = index ?? selectedScene;
    const targetScene = scenes[targetIndex];
    if (!projectId || !targetScene) return;
    setGeneratingScene(true);
    setGeneratingSceneIndex(targetIndex);
    setSceneProgress("Clip wird generiert (~2 Min)...");
    setError("");

    const updated = [...scenes];
    updated[targetIndex] = { ...updated[targetIndex], status: "generating" };
    setScenes(updated);

    try {
      const res = await fetch("/api/generate-scene-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geschichteId: projectId,
          sceneIndex: targetIndex,
          scene: {
            ...targetScene,
            // Pass next scene's character for zoom-to-character transitions
            nextCharacterId: targetIndex < scenes.length - 1 ? scenes[targetIndex + 1]?.characterId : undefined,
          },
        }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("json")) {
          const errData = await res.json();
          throw new Error(errData.error || `Server-Fehler (${res.status})`);
        }
        throw new Error(`Server-Fehler (${res.status})`);
      }

      // Read SSE stream for progress updates
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Keine Antwort vom Server");

      let data: Record<string, unknown> = {};
      let streamError = "";
      const decoder = new TextDecoder();
      let buffer = ""; // Buffer for incomplete SSE lines

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by \n\n)
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || ""; // Keep incomplete last chunk

        for (const msg of messages) {
          for (const line of msg.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.progress) setSceneProgress(parsed.progress);
              if (parsed.done) data = parsed;
              if (parsed.error) streamError = parsed.error;
            } catch {
              // Incomplete JSON chunk, ignore
            }
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (data.error) throw new Error(data.error as string);
      if (!data.videoUrl) {
        // Show what we DID receive for debugging
        const lastProgress = data.progress || "kein Progress empfangen";
        const keys = Object.keys(data).join(", ") || "leer";
        throw new Error(`Kein Video generiert. Letzter Status: "${lastProgress}". Stream-Daten: [${keys}]`);
      }

      const freshUrl = data.videoUrl as string;

      const newVersion: PromptVersion = {
        id: `v-${Date.now()}`,
        prompt: targetScene.sceneDescription,
        createdAt: new Date().toISOString(),
        videoUrl: freshUrl,
        isSelected: true,
      };

      const existingVersions = (targetScene.promptVersions || []).map((v) => ({ ...v, isSelected: false }));

      const updatedAfter = [...scenes];
      updatedAfter[targetIndex] = {
        ...updatedAfter[targetIndex],
        videoUrl: freshUrl,
        status: "done",
        promptVersions: [...existingVersions, newVersion],
        selectedPromptId: newVersion.id,
      };
      setScenes(updatedAfter);
      setSceneProgress("Clip fertig!");

      await fetch("/api/admin/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschichteId: projectId, scenes: updatedAfter }),
      });
    } catch (err) {
      const updatedErr = [...scenes];
      updatedErr[targetIndex] = { ...updatedErr[targetIndex], status: "error" };
      setScenes(updatedErr);
      setError(err instanceof Error ? err.message : "Fehler");
      setSceneProgress("");
    } finally {
      setGeneratingScene(false);
      setGeneratingSceneIndex(null);
    }
  };

  // AI prompt edit for a specific scene
  const handleAiEdit = async (sceneIndex: number) => {
    const prompt = aiPrompts[sceneIndex]?.trim();
    const scene = scenes[sceneIndex];
    if (!prompt || !scene) return;
    setAiLoadingMap((m) => ({ ...m, [sceneIndex]: true }));
    try {
      const res = await fetch("/api/admin/edit-scene-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDescription: scene.sceneDescription,
          userInstruction: prompt,
          characterId: scene.characterId,
          sceneType: scene.type,
        }),
      });
      if (!res.ok) throw new Error("Fehler");
      const data = await res.json();
      const updated = [...scenes];
      updated[sceneIndex] = { ...updated[sceneIndex], sceneDescription: data.newDescription };
      setScenes(updated);
      setAiPrompts((p) => ({ ...p, [sceneIndex]: "" }));
    } catch {
      setError("KI-Bearbeitung fehlgeschlagen");
    } finally {
      setAiLoadingMap((m) => ({ ...m, [sceneIndex]: false }));
    }
  };

  // Generate All
  const generateAll = async () => {
    if (!projectId) return;
    setGeneratingAll(true);
    const pending = scenes
      .map((s, i) => ({ scene: s, index: i }))
      .filter(({ scene }) => !scene.videoUrl && scene.status !== "done");

    for (const { scene, index } of pending) {
      setSelectedScene(index);
      setGeneratingSceneIndex(index);
      const u = [...scenes];
      u[index] = { ...u[index], status: "generating" };
      setScenes(u);

      try {
        const res = await fetch("/api/generate-scene-clip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geschichteId: projectId, sceneIndex: index, scene }),
        });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("json")) throw new Error("Session abgelaufen — bitte Seite neu laden");
        const data = await res.json();
        if (res.ok) {
          const newVersion: PromptVersion = {
            id: `v-${Date.now()}`,
            prompt: scene.sceneDescription,
            createdAt: new Date().toISOString(),
            videoUrl: data.videoUrl,
            isSelected: true,
          };
          const existingVersions = (scene.promptVersions || []).map((v) => ({ ...v, isSelected: false }));
          const u2 = [...scenes];
          u2[index] = {
            ...u2[index],
            videoUrl: data.videoUrl,
            status: "done",
            promptVersions: [...existingVersions, newVersion],
            selectedPromptId: newVersion.id,
          };
          setScenes(u2);
        }
      } catch {
        /* continue to next */
      }
    }
    setGeneratingAll(false);
    setGeneratingSceneIndex(null);
  };

  // Insert scene
  const insertScene = (afterIndex: number) => {
    const prevScene = scenes[afterIndex];
    const nextScene = scenes[afterIndex + 1];
    const newScene: StoryboardScene = {
      type: "transition",
      sceneDescription: "",
      location: prevScene?.location || "",
      mood: prevScene?.mood || "",
      camera: "slow-pan",
      durationHint: 3,
      audioStartMs: prevScene?.audioEndMs || 0,
      audioEndMs: nextScene?.audioStartMs || prevScene?.audioEndMs || 0,
      quality: "standard",
      status: "pending",
    };
    const updated = [...scenes];
    updated.splice(afterIndex + 1, 0, newScene);
    setScenes(updated);
    setExpandedCard(afterIndex + 1);
  };

  // Add intro
  const addIntro = () => {
    const first = scenes[0];
    const intro: StoryboardScene = {
      type: "intro",
      sceneDescription: "Sanfter Kameraschwenk durch den magischen Wald zum KoalaTree. Goldenes Morgenlicht filtert durch die Blaetter. Titel blendet ein.",
      location: "KoalaTree Wald",
      mood: "magical",
      camera: "slow-zoom-in",
      durationHint: 5,
      audioStartMs: 0,
      audioEndMs: first?.audioStartMs || 5000,
      quality: "standard",
      status: "pending",
    };
    setScenes([intro, ...scenes]);
    setExpandedCard(0);
  };

  // Add outro
  const addOutro = () => {
    const last = scenes[scenes.length - 1];
    const outro: StoryboardScene = {
      type: "outro",
      sceneDescription: "Kamera zieht sich langsam vom KoalaTree zurueck. Sterne erscheinen am Himmel. Abspann mit Credits blendet ein.",
      location: "KoalaTree Wald",
      mood: "peaceful",
      camera: "slow-zoom-out",
      durationHint: 5,
      audioStartMs: last?.audioEndMs || 0,
      audioEndMs: (last?.audioEndMs || 0) + 5000,
      quality: "standard",
      status: "pending",
    };
    setScenes([...scenes, outro]);
    setExpandedCard(scenes.length);
  };

  const hasIntro = scenes.length > 0 && scenes[0].type === "intro";
  const hasOutro = scenes.length > 0 && scenes[scenes.length - 1].type === "outro";

  // --- Render ---

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
    <div className="flex flex-col min-h-0">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onEnded={() => { setPlayingSegment(null); setAudioPlaying(false); }}
        />
      )}

      {/* Video lightbox modal */}
      {videoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setVideoModal(null)}
        >
          <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <video src={videoModal} controls autoPlay className="w-full rounded-xl aspect-[9/16] object-contain bg-black" />
            <button
              onClick={() => setVideoModal(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white/60 hover:text-white flex items-center justify-center text-sm"
            >
              X
            </button>
          </div>
        </div>
      )}

      {/* Film Player modal */}
      {filmMode && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <FilmPlayer
              clips={scenes.map((s, i) => ({
                index: i,
                videoUrl: s.videoUrl || "",
                characterId: s.characterId,
              }))}
              onClose={() => setFilmMode(false)}
            />
          </div>
        </div>
      )}

      {/* ===== TOP BAR ===== */}
      <div className="card p-3 mb-3 space-y-2">
        {/* Row 1: Nav + title + regenerate */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-white/30 hover:text-white/60 text-xs shrink-0">
            ← Zurueck
          </button>
          <h2 className="text-sm font-medium text-[#f5eed6] truncate flex-1">{projectTitle}</h2>
          <button
            onClick={regenerateAudio}
            disabled={regeneratingAudio}
            className={`text-[10px] px-2 py-1 rounded shrink-0 transition-all ${
              regeneratingAudio
                ? "bg-[#6bb5c9]/20 text-[#6bb5c9] animate-pulse cursor-wait"
                : "bg-white/5 text-white/30 hover:text-white/60"
            }`}
          >
            {regeneratingAudio ? "Audio wird generiert..." : "🔊 Audio neu"}
          </button>
          <button
            onClick={generateStoryboard}
            disabled={generatingStoryboard}
            className={`text-[10px] px-3 py-1.5 rounded shrink-0 transition-all flex items-center gap-1.5 ${
              generatingStoryboard
                ? "bg-[#d4a853]/20 text-[#d4a853] border border-[#d4a853]/30 animate-pulse"
                : "bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10"
            } disabled:cursor-wait`}
          >
            {generatingStoryboard ? (
              <><span className="animate-spin">⏳</span> AI Director analysiert (~15s)...</>
            ) : scenes.length > 0 ? (
              <>🔄 Storyboard neu generieren</>
            ) : (
              <>🎬 Storyboard generieren</>
            )}
          </button>
        </div>

        {/* Row 2: Stats + Audio + Timeline */}
        {scenes.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-white/30">
                {completedScenes}/{scenes.length} Clips
              </span>
              <span className="text-white/20">{formatCost(totalCostCents)}</span>

              {audioUrl && (
                <button
                  onClick={toggleFullAudio}
                  className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] transition-all ${
                    audioPlaying
                      ? "bg-[#d4a853]/20 text-[#d4a853]"
                      : "bg-white/5 text-white/40 hover:text-white/60"
                  }`}
                >
                  {audioPlaying ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                  Geschichte
                </button>
              )}

              <div className="flex gap-0.5 text-[9px] ml-auto">
                <button
                  onClick={() => setScenes(scenes.map((s) => ({ ...s, quality: "standard" })))}
                  className={`px-2 py-0.5 rounded-l-lg transition-all ${
                    scenes.every((s) => s.quality !== "premium")
                      ? "bg-[#4a7c59]/30 text-[#a8d5b8]"
                      : "bg-white/5 text-white/25 hover:text-white/50"
                  }`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setScenes(scenes.map((s) => ({ ...s, quality: "premium" })))}
                  className={`px-2 py-0.5 rounded-r-lg transition-all ${
                    scenes.every((s) => s.quality === "premium")
                      ? "bg-[#d4a853]/30 text-[#d4a853]"
                      : "bg-white/5 text-white/25 hover:text-white/50"
                  }`}
                >
                  Premium
                </button>
              </div>
            </div>

            <FilmTimeline scenes={scenes} selectedIndex={selectedScene} onSelect={(i) => { setSelectedScene(i); setExpandedCard(i); }} />
          </>
        )}
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400/60">X</button>
        </div>
      )}

      {sceneProgress && (
        <div className="mb-3 text-[9px] text-[#a8d5b8] px-1">{sceneProgress}</div>
      )}

      {/* ===== MAIN AREA: Scene Cards ===== */}
      {scenes.length > 0 ? (
        <div className="space-y-2 pb-28">
          {/* Intro button if missing */}
          {!hasIntro && (
            <button
              onClick={addIntro}
              className="w-full text-[9px] py-1.5 text-white/20 hover:text-white/40 border border-dashed border-white/10 hover:border-white/20 rounded-lg transition-all"
            >
              + Vorspann hinzufuegen
            </button>
          )}

          {scenes.map((scene, i) => {
            const charInfo = scene.characterId ? CHAR_INFO[scene.characterId] : null;
            const badge = TYPE_BADGE[scene.type] || TYPE_BADGE.landscape;
            const isExpanded = expandedCard === i;
            const isPlaying = playingSegment === i;
            const isGeneratingThis = (generatingScene && generatingSceneIndex === i) || scene.status === "generating";
            const isDone = !!scene.videoUrl || scene.status === "done";
            const isSpecial = scene.type === "intro" || scene.type === "outro";

            return (
              <div key={i}>
                {/* Scene Card */}
                <div
                  className={`card p-3 transition-all cursor-pointer ${
                    isPlaying ? "ring-1 ring-[#d4a853]/50" : ""
                  } ${isSpecial ? "border-l-2 border-l-[#d4a853]/40" : ""}`}
                  onClick={() => {
                    setSelectedScene(i);
                    setExpandedCard(isExpanded ? null : i);
                  }}
                >
                  {/* Card header row */}
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Left: scene number + character + type */}
                    <span className="text-[9px] font-mono text-white/20 bg-white/5 rounded px-1 py-0.5 shrink-0">
                      {i + 1}
                    </span>
                    {charInfo && (
                      <span className="text-[10px]" style={{ color: charInfo.color }}>
                        {charInfo.emoji} {charInfo.name}
                      </span>
                    )}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                    {isDone && (
                      <span className="text-[8px] text-[#a8d5b8]/60">OK</span>
                    )}
                    {isGeneratingThis && (
                      <span className="text-[8px] text-[#d4a853] animate-pulse">Generiert...</span>
                    )}

                    {/* Right: time + audio play */}
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] text-white/20">
                        {formatTime(scene.audioStartMs)} - {formatTime(scene.audioEndMs)}
                      </span>
                      {audioUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); playSegment(i); }}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] transition-all ${
                            isPlaying
                              ? "bg-[#d4a853]/20 text-[#d4a853]"
                              : "bg-white/5 text-white/30 hover:text-white/60"
                          }`}
                          title="Audio abspielen"
                        >
                          {isPlaying ? "\u25A0" : "\u25B6"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Spoken text */}
                  {scene.spokenText && (
                    <div className="flex items-start gap-1 mb-1.5">
                      <p className="text-[9px] text-white/25 italic line-clamp-2 flex-1">
                        &quot;{scene.spokenText.substring(0, 150)}&quot;
                      </p>
                      {audioUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); playSegment(i); }}
                          className="text-[8px] text-white/20 hover:text-white/40 shrink-0 mt-0.5"
                        >
                          {isPlaying ? "\u25A0" : "\u25B6"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Collapsed preview: short description */}
                  {!isExpanded && (
                    <p className="text-[9px] text-white/30 line-clamp-1">{scene.sceneDescription.substring(0, 100)}</p>
                  )}

                  {/* Video preview thumbnail (always visible if exists) */}
                  {!isExpanded && scene.videoUrl && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setVideoModal(scene.videoUrl!); }}
                        className="w-12 h-16 rounded bg-black overflow-hidden shrink-0 relative group"
                      >
                        <video src={scene.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedCard(i); setSelectedScene(i); }}
                        className="text-[8px] text-white/20 hover:text-white/40"
                      >
                        Bearbeiten
                      </button>
                    </div>
                  )}

                  {/* ===== EXPANDED CARD CONTENT ===== */}
                  {isExpanded && (
                    <div className="mt-2 space-y-2 border-t border-white/5 pt-2" onClick={(e) => e.stopPropagation()}>
                      {/* Regie section */}
                      <div>
                        <label className="text-[8px] text-white/20 block mb-0.5">Regie</label>
                        <textarea
                          value={scene.sceneDescription}
                          onChange={(e) => {
                            const u = [...scenes];
                            u[i] = { ...u[i], sceneDescription: e.target.value };
                            setScenes(u);
                          }}
                          className="w-full text-[10px] bg-white/5 border border-white/10 rounded-lg p-2 text-white resize-none"
                          rows={3}
                        />

                        {/* Reset + inline controls */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <button
                            onClick={() => {
                              // Reset to latest prompt version
                              const ver = scene.promptVersions?.find((v) => v.isSelected);
                              if (ver) {
                                const u = [...scenes];
                                u[i] = { ...u[i], sceneDescription: ver.prompt };
                                setScenes(u);
                              }
                            }}
                            className="text-[8px] px-1.5 py-0.5 text-white/20 hover:text-white/40 bg-white/5 rounded"
                          >
                            ↺ Reset
                          </button>

                          {/* Character selector */}
                          <select
                            value={scene.characterId || ""}
                            onChange={(e) => {
                              const u = [...scenes];
                              u[i] = { ...u[i], characterId: e.target.value || undefined };
                              setScenes(u);
                            }}
                            className="text-[8px] py-0.5 px-1 bg-white/5 border border-white/10 rounded text-white/60"
                          >
                            <option value="">Kein Char.</option>
                            {Object.entries(CHAR_INFO).map(([id, c]) => (
                              <option key={id} value={id}>{c.emoji} {c.name}</option>
                            ))}
                          </select>

                          {/* Quality selector */}
                          <select
                            value={scene.quality || "standard"}
                            onChange={(e) => {
                              const u = [...scenes];
                              u[i] = { ...u[i], quality: e.target.value as "standard" | "premium" };
                              setScenes(u);
                            }}
                            className="text-[8px] py-0.5 px-1 bg-white/5 border border-white/10 rounded text-white/60"
                          >
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                          </select>

                          {/* Type selector */}
                          <div className="flex gap-0.5">
                            {(["dialog", "landscape", "transition"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => {
                                  const u = [...scenes];
                                  u[i] = { ...u[i], type: t };
                                  setScenes(u);
                                }}
                                className={`text-[7px] px-1 py-0.5 rounded ${
                                  scene.type === t
                                    ? "bg-[#4a7c59]/30 text-[#a8d5b8]"
                                    : "bg-white/5 text-white/25"
                                }`}
                              >
                                {t === "dialog" ? "Dialog" : t === "landscape" ? "Szene" : "\u00dcberg."}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Transition to next scene */}
                        <div>
                          <label className="text-[8px] text-white/30 block mb-0.5">Uebergang zur naechsten Szene</label>
                          <div className="flex gap-1">
                            {(["flow", "zoom-to-character", "cut"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => {
                                  const u = [...scenes];
                                  u[i] = { ...u[i], transitionTo: t };
                                  setScenes(u);
                                }}
                                className={`text-[7px] px-1.5 py-0.5 rounded ${
                                  (scene.transitionTo || "flow") === t
                                    ? "bg-[#d4a853]/30 text-[#d4a853]"
                                    : "bg-white/5 text-white/25"
                                }`}
                              >
                                {t === "flow" ? "Fliessend" : t === "zoom-to-character" ? "Zoom zu Charakter" : "Harter Schnitt"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* AI edit input */}
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={aiPrompts[i] || ""}
                          onChange={(e) => setAiPrompts((p) => ({ ...p, [i]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleAiEdit(i)}
                          placeholder="KI-Anweisung..."
                          className="flex-1 text-[10px] px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/15"
                          disabled={aiLoadingMap[i]}
                        />
                        <button
                          onClick={() => handleAiEdit(i)}
                          disabled={aiLoadingMap[i] || !(aiPrompts[i]?.trim())}
                          className="text-[9px] px-2 py-1.5 bg-[#4a7c59]/30 text-[#a8d5b8] rounded-lg disabled:opacity-40"
                        >
                          {aiLoadingMap[i] ? "..." : "OK"}
                        </button>
                      </div>

                      {/* Clip Versions — horizontal scrollable cards */}
                      {scene.promptVersions && scene.promptVersions.length > 1 && (
                        <div>
                          <p className="text-[9px] text-white/50 mb-2 font-medium">{scene.promptVersions.length} Versionen</p>
                          <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
                            {scene.promptVersions.map((ver, vi) => {
                              const isActive = ver.isSelected || ver.id === scene.selectedPromptId;
                              const meta = (ver as unknown as { provider?: string; estimatedCostUsd?: string }).provider;
                              return (
                                <div
                                  key={ver.id}
                                  className={`shrink-0 rounded-xl overflow-hidden cursor-pointer transition-all ${
                                    isActive
                                      ? "ring-2 ring-[#d4a853] shadow-[0_0_12px_rgba(212,168,83,0.2)]"
                                      : "ring-1 ring-white/15 opacity-70 hover:opacity-100 hover:ring-white/30"
                                  }`}
                                  style={{ width: 110 }}
                                  onClick={() => {
                                    const u = [...scenes];
                                    u[i] = {
                                      ...u[i],
                                      sceneDescription: ver.prompt,
                                      videoUrl: ver.videoUrl,
                                      selectedPromptId: ver.id,
                                      promptVersions: (u[i].promptVersions || []).map((v) => ({ ...v, isSelected: v.id === ver.id })),
                                    };
                                    setScenes(u);
                                    if (ver.videoUrl && projectId) {
                                      fetch("/api/admin/extract-frame", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ geschichteId: projectId, sceneIndex: i, videoUrl: ver.videoUrl }),
                                      }).catch(() => {});
                                    }
                                  }}
                                >
                                  {/* Video thumbnail */}
                                  <div className="w-[110px] h-16 bg-[#0a1a0a] relative">
                                    {ver.videoUrl ? (
                                      <video src={ver.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[9px] text-white/30">kein Video</div>
                                    )}
                                    {isActive && (
                                      <div className="absolute top-1 left-1 bg-[#d4a853] text-black text-[7px] px-1.5 py-0.5 rounded-md font-bold shadow">Aktiv</div>
                                    )}
                                  </div>
                                  {/* Info */}
                                  <div className="p-1.5 bg-white/[0.03]">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[9px] text-white/70 font-medium">v{vi + 1}</span>
                                      <span className="text-[8px] text-white/40">{ver.createdAt?.substring(11, 16) || ""}</span>
                                    </div>
                                    {meta && (
                                      <p className="text-[7px] text-[#a8d5b8]/60 truncate mt-0.5">{meta.replace("fal.ai/", "")}</p>
                                    )}
                                    <p className="text-[7px] text-white/30 truncate mt-0.5">{ver.prompt?.substring(0, 30)}...</p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!confirm("Version loeschen?")) return;
                                        const u = [...scenes];
                                        u[i] = { ...u[i], promptVersions: (u[i].promptVersions || []).filter((v) => v.id !== ver.id) };
                                        setScenes(u);
                                      }}
                                      className="text-[8px] text-red-400/40 hover:text-red-400/80 mt-1"
                                    >
                                      Loeschen
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Scene image generators */}
                      <div className="border-t border-white/5 pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[8px] text-white/20">Szenen-Bild</label>
                          <div className="flex gap-1">
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
                                      customPrompt: scene.sceneDescription,
                                      landscapeId: "koalatree_full",
                                      sceneBackground: "golden",
                                      size: "1792x1024",
                                      geschichteId: projectId,
                                      sceneIndex: i,
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
                            >
                              Gruppe
                            </button>
                            <button
                              onClick={async () => {
                                setSceneProgress("Szenen-Bild wird generiert...");
                                try {
                                  const res = await fetch("/api/admin/generate-scene-image", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      type: scene.type === "dialog" ? "character" : "landscape",
                                      characterId: scene.characterId,
                                      customPrompt: scene.sceneDescription,
                                      sceneBackground: scene.mood?.includes("nacht") ? "night" : scene.mood?.includes("morgen") ? "dawn" : "golden",
                                      size: "1792x1024",
                                      geschichteId: projectId,
                                      sceneIndex: i,
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
                              className="text-[7px] px-1.5 py-0.5 bg-[#d4a853]/20 text-[#d4a853] rounded hover:bg-[#d4a853]/30"
                            >
                              Bild (~$0.08)
                            </button>
                          </div>
                        </div>

                        {/* Landscape presets */}
                        {scene.type !== "dialog" && (<>
                          <select
                            className="w-full text-[8px] py-0.5 mb-1 bg-white/5 border border-white/10 rounded text-white/60"
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const u = [...scenes];
                              u[i] = { ...u[i], landscapePreset: e.target.value };
                              setScenes(u);
                            }}
                          >
                            <option value="">Referenz-Hintergrund waehlen...</option>
                            <option value="koalatree_full">KoalaTree (gross)</option>
                            <option value="beach">Strand</option>
                            <option value="stream">Waldbach</option>
                            <option value="meadow">Wiese</option>
                            <option value="night_forest">Nacht-Wald</option>
                            <option value="forest_floor">Waldboden</option>
                          </select>
                          <p className="text-[7px] text-white/20 mt-0.5">Nur Hintergrund-Bild, Regie bleibt erhalten</p>
                        </>)}
                      </div>

                      {/* Video preview + Generate */}
                      <div className="border-t border-white/5 pt-2">
                        {scene.videoUrl ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setVideoModal(scene.videoUrl!)}
                              className="w-16 h-24 rounded-lg bg-black overflow-hidden shrink-0 relative group"
                            >
                              <video src={scene.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                              </div>
                            </button>
                            <div className="flex-1 min-w-0">
                              {scene.clipMetadata && (
                                <div className="text-[8px] text-white/40 mb-1.5 space-y-0.5">
                                  <p className="text-[#a8d5b8]/60">{scene.clipMetadata.provider?.replace("fal.ai/", "")} · {scene.clipMetadata.audioDurationSec}s · ~${scene.clipMetadata.estimatedCostUsd}</p>
                                  <p>{scene.clipMetadata.generatedAt?.substring(0, 16)?.replace("T", " ")}</p>
                                </div>
                              )}
                              <button
                                onClick={() => generateSceneClip(i)}
                                disabled={generatingScene}
                                className="text-[9px] px-3 py-1.5 bg-white/5 text-white/40 hover:bg-white/10 rounded-lg disabled:opacity-50"
                              >
                                {isGeneratingThis ? "Generiert..." : "Nochmal generieren"}
                              </button>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm("Clip wirklich loeschen?")) return;
                                const u = [...scenes];
                                u[i] = { ...u[i], videoUrl: undefined, status: "pending", clipName: undefined, clipBlobUrl: undefined };
                                setScenes(u);
                              }}
                              className="text-[8px] px-2 py-1.5 text-red-400/30 hover:text-red-400/70"
                            >
                              Loeschen
                            </button>
                          </div>
                        ) : (
                          <div>
                            {/* Frame continuity hint */}
                            {i > 0 && !scene.videoUrl && (
                              <p className={`text-[8px] mb-1 ${
                                scenes[i - 1]?.videoUrl
                                  ? "text-[#a8d5b8]/50"
                                  : "text-[#d4a853]/50"
                              }`}>
                                {scenes[i - 1]?.videoUrl
                                  ? `Startet mit letztem Frame von Szene ${i}`
                                  : `Szene ${i} hat noch keinen Clip — Uebergang evtl. nicht nahtlos`}
                              </p>
                            )}
                            <button
                              onClick={() => generateSceneClip(i)}
                              disabled={generatingScene}
                              className="w-full text-[10px] py-2 rounded-xl font-medium btn-primary disabled:opacity-50"
                            >
                              {isGeneratingThis
                                ? "Generiert..."
                                : `Clip generieren (${formatCost(estimateCostCents(scene))})`}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Insert scene "+" button between cards */}
                {i < scenes.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <button
                      onClick={() => insertScene(i)}
                      className="text-[10px] text-white/10 hover:text-white/30 px-3 py-0.5 hover:bg-white/5 rounded-full transition-all"
                      title="Szene einfuegen"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Outro button if missing */}
          {!hasOutro && scenes.length > 0 && (
            <button
              onClick={addOutro}
              className="w-full text-[9px] py-1.5 text-white/20 hover:text-white/40 border border-dashed border-white/10 hover:border-white/20 rounded-lg transition-all"
            >
              + Abspann hinzufuegen
            </button>
          )}

          {/* Mastering Panel (collapsed by default) */}
          <div className="mt-4">
            <button
              onClick={() => setMasteringOpen(!masteringOpen)}
              className="w-full text-[9px] py-1.5 text-white/20 hover:text-white/40 flex items-center justify-center gap-1"
            >
              {masteringOpen ? "Mastering ausblenden" : "Mastering anzeigen"}
              <span className="text-[8px]">{masteringOpen ? "\u25B2" : "\u25BC"}</span>
            </button>
            {masteringOpen && (<>
              <MasteringPanel
                settings={mastering}
                onChange={setMastering}
                onRender={async () => {
                  if (!projectId || rendering) return;
                  setRendering(true);
                  setRenderResult("Clips werden nach S3 hochgeladen...");
                  try {
                    const clipBlobUrls: Record<string, string> = {};
                    for (const s of scenes) {
                      if (s.clipBlobUrl && s.clipName) clipBlobUrls[s.clipName] = s.clipBlobUrl;
                    }
                    const res = await fetch("/api/admin/render-film", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ geschichteId: projectId, format: "portrait", clipBlobUrls }),
                    });

                    if (!res.ok) {
                      const ct = res.headers.get("content-type") || "";
                      if (ct.includes("json")) { const d = await res.json(); throw new Error(d.error || "Fehler"); }
                      throw new Error(`Server-Fehler (${res.status})`);
                    }

                    // Read SSE stream for live progress
                    const reader = res.body?.getReader();
                    if (!reader) throw new Error("Keine Antwort");
                    const decoder = new TextDecoder();
                    let buf = "";
                    let result: Record<string, unknown> = {};

                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buf += decoder.decode(value, { stream: true });
                      const msgs = buf.split("\n\n");
                      buf = msgs.pop() || "";
                      for (const msg of msgs) {
                        for (const line of msg.split("\n")) {
                          if (!line.startsWith("data: ")) continue;
                          try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.message) setRenderResult(parsed.message);
                            if (parsed.done) result = parsed;
                          } catch { /* incomplete */ }
                        }
                      }
                    }

                    if (result.error) throw new Error(result.error as string);
                    if (result.status === "completed") {
                      setRenderResult(`Film fertig! ${result.scenes} Szenen zusammengefuegt.`);
                      if (result.videoUrl) {
                        const url = result.videoUrl as string;
                        setRenderedFilmUrl(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`);
                      }
                    } else {
                      setRenderResult(result.message as string || "Fertig");
                    }
                  } catch (err) {
                    setRenderResult(`Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`);
                  } finally {
                    setRendering(false);
                  }
                }}
                rendering={rendering}
                completedScenes={completedScenes}
                geschichteId={projectId || undefined}
              />
              {/* Quick test: render only clips around selected scene */}
              {completedScenes >= 2 && (
                <button
                  onClick={async () => {
                    if (!projectId || rendering) return;
                    // Find range of consecutive completed clips around selected scene
                    let from = selectedScene;
                    let to = selectedScene;
                    while (from > 0 && (scenes[from - 1]?.videoUrl || scenes[from - 1]?.status === "done")) from--;
                    while (to < scenes.length - 1 && (scenes[to + 1]?.videoUrl || scenes[to + 1]?.status === "done")) to++;
                    if (to - from < 1) { setRenderResult("Mindestens 2 aufeinanderfolgende Clips noetig"); return; }

                    setRendering(true);
                    setRenderResult(`Teste Uebergang: Szenen ${from + 1}-${to + 1}...`);
                    try {
                      const res = await fetch("/api/admin/render-film", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          geschichteId: projectId,
                          format: "portrait",
                          sceneRange: { from, to },
                          clipBlobUrls: Object.fromEntries(
                            scenes.filter((s) => s.clipBlobUrl && s.clipName).map((s) => [s.clipName!, s.clipBlobUrl!])
                          ),
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || data.message);
                      setRenderResult(data.status === "completed" ? `Test fertig! Szenen ${from + 1}-${to + 1} zusammengefuegt.` : data.message || "Bereit");
                    } catch (err) {
                      setRenderResult(`Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`);
                    } finally {
                      setRendering(false);
                    }
                  }}
                  disabled={rendering}
                  className="w-full mt-2 text-[9px] py-1.5 text-white/30 hover:text-white/50 bg-white/5 rounded-lg disabled:opacity-30"
                >
                  Uebergang testen (Szenen um #{selectedScene + 1})
                </button>
              )}

              {renderResult && (
                <p className={`text-[10px] mt-2 ${renderResult.startsWith("Fehler") ? "text-red-400/70" : "text-[#a8d5b8]/70"}`}>
                  {renderResult}
                </p>
              )}
            </>)}
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-white/40 text-sm mb-3">Noch kein Storyboard. Generiere eins um loszulegen.</p>
          <button
            onClick={generateStoryboard}
            disabled={generatingStoryboard}
            className={`text-sm px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 mx-auto ${
              generatingStoryboard
                ? "bg-[#d4a853]/20 text-[#d4a853] border border-[#d4a853]/30 animate-pulse cursor-wait"
                : "btn-primary"
            }`}
          >
            {generatingStoryboard ? (
              <><span className="animate-spin">⏳</span> AI Director analysiert die Geschichte (~15s)...</>
            ) : (
              <>🎬 Storyboard generieren</>
            )}
          </button>
        </div>
      )}

      {/* ===== STICKY BOTTOM BAR ===== */}
      {scenes.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#1a2e1a]/95 backdrop-blur-sm border-t border-white/5 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={generateAll}
                disabled={generatingAll || generatingScene}
                className="flex-1 text-[10px] py-2.5 rounded-xl font-medium bg-[#4a7c59] text-white hover:bg-[#5a8c69] disabled:opacity-50 transition-all"
              >
                {generatingAll
                  ? `Generiert... (${generatingSceneIndex !== null ? generatingSceneIndex + 1 : ""}/${pendingCount})`
                  : `Alle offenen Clips generieren (${pendingCount} Szenen · ${formatCost(scenes.filter(s => !s.videoUrl && s.status !== "done").reduce((sum, s) => sum + estimateCostCents(s), 0))})`}
              </button>
            )}
            <button
              onClick={() => setFilmMode(true)}
              disabled={completedScenes < 2}
              className={`${pendingCount > 0 ? "" : "flex-1"} text-[10px] py-2.5 px-4 rounded-xl font-medium transition-all ${
                completedScenes >= 2
                  ? "bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30"
                  : "bg-white/5 text-white/20"
              } disabled:opacity-40`}
            >
              Film abspielen ({completedScenes} Clips)
            </button>
            {renderedFilmUrl && (
              <button
                onClick={() => setVideoModal(renderedFilmUrl)}
                className="text-[10px] py-2.5 px-4 rounded-xl font-medium bg-[#a8d5b8]/20 text-[#a8d5b8] hover:bg-[#a8d5b8]/30 transition-all"
              >
                Fertiger Film
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

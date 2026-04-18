"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import LibraryPicker from "@/app/components/LibraryPicker";
import TaskStatusBar from "@/app/components/TaskStatusBar";
import AudioTimelinePlayer from "@/app/components/AudioTimelinePlayer";
import { ToastProvider, useToast } from "@/app/components/Toasts";
import ImageLightbox from "@/app/components/ImageLightbox";
import { VISUAL_STYLES } from "@/lib/studio/visual-styles";
import {
  DIRECTING_STYLES,
  ATMOSPHERE_PRESETS,
  DEFAULT_DIRECTING_STYLE,
  DEFAULT_ATMOSPHERE,
} from "@/lib/directing-styles";

// ── Types ──────────────────────────────────────────────────────────

interface Character {
  id: string;
  name: string;
  emoji?: string;
  role?: string;
  markerId?: string;
  description?: string;
  personality?: string;
  species?: string;
  portraitUrl?: string;
  voiceId?: string;
  actorId?: string | null;
  castSnapshot?: { voiceId?: string; voiceSettings?: Record<string, number>; portraitUrl?: string; syncedAt?: string } | null;
  castHistory?: Array<{ voiceId?: string; voiceSettings?: Record<string, number>; portraitUrl?: string; syncedAt?: string }> | null;
  actorOutfit?: string;
}

interface Sequence {
  id: string;
  name: string;
  status: string;
  orderIndex: number;
  location?: string;
  sceneCount?: number;
  audioUrl?: string;
  audioDauerSek?: number;
  videoUrl?: string;
  landscapeRefUrl?: string;
  costumes?: Record<string, { description: string; imageUrl?: string }>;
  scenes?: Array<{
    id: string;
    index: number;
    type: string;
    sceneDescription: string;
    characterId?: string;
    spokenText?: string;
    dialogAudioUrl?: string;
    sfxAudioUrl?: string;
    sfx?: string;
    ambience?: string;
    camera?: string;
    cameraMotion?: string;
    clipTransition?: string;
    startImageOverride?: { type: "location" | "portrait" | "custom"; url?: string };
    emotion?: string;
    mood?: string;
    durationHint?: number;
    audioStartMs: number;
    audioEndMs: number;
    dialogDurationMs?: number;
    storyboardImageUrl?: string;
    storyboardApproved?: boolean;
    storyboardPrompt?: string;
    sceneAnchorImageUrl?: string;
    sceneAnchorCandidates?: string[];
    sceneAnchorRefinement?: string;
    videoUrl?: string;
    status: string;
    quality?: string;
    versions?: Array<{
      videoUrl: string;
      provider: string;
      quality: string;
      cost: number;
      durationSec: number;
      createdAt: string;
    }>;
    activeVersionIdx?: number;
  }>;
}

interface Project {
  id: string;
  name: string;
  status: string;
  storyText?: string;
  directingStyle?: string;
  atmosphere?: string;
  stylePrompt?: string;
  format?: string;
  targetDurationSec?: number;
  language?: string;
  videoUrl?: string;
  selectedAssets?: { locationIds?: string[]; propIds?: string[]; musicId?: string | null };
  characters: Character[];
  sequences: Sequence[];
  createdAt: string;
}

// ── Main Component ─────────────────────────────────────────────────

export default function StudioV2Page() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<"story" | "screenplay" | "characters" | "production">("story");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(() => {
    fetch("/api/studio/projects")
      .then((r) => r.json())
      .then((d) => { setProjects(d.projects || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const createProject = async () => {
    setCreating(true);
    const res = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const data = await res.json();
    if (data.project) {
      setProjects((prev) => [data.project, ...prev]);
      setSelectedProject(data.project);
    }
    setCreating(false);
  };

  const refreshProject = async (projectId: string) => {
    const res = await fetch(`/api/studio/projects/${projectId}`);
    const data = await res.json();
    if (data.project) {
      setSelectedProject(data.project);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? data.project : p)));
    }
  };

  const TABS = [
    { id: "story" as const, label: "Geschichte", emoji: "\uD83D\uDCD6" },
    { id: "characters" as const, label: "Charaktere", emoji: "\uD83C\uDFAD" },
    { id: "screenplay" as const, label: "Drehbuch", emoji: "\uD83C\uDFAC" },
    { id: "production" as const, label: "Produktion", emoji: "\uD83C\uDFA5" },
  ];

  if (loading) return <div className="text-white/30 text-sm p-8">Lade Studio...</div>;

  return (
    <ToastProvider>
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 sm:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">KoalaTree Studio</h1>
          <p className="text-sm text-white/40">Story-to-Film Engine</p>
        </div>
        <button
          onClick={createProject}
          disabled={creating}
          className="px-4 py-2 rounded-xl bg-[#4a7c59] text-white text-sm font-medium hover:bg-[#5a8c69] disabled:opacity-50"
        >
          {creating ? "..." : "+ Neues Projekt"}
        </button>
      </div>

      {/* Project List */}
      {!selectedProject ? (
        <div className="space-y-3">
          {projects.length === 0 && (
            <div className="card p-8 text-center text-white/40">
              <p className="mb-3">Noch keine Projekte. Erstelle dein erstes!</p>
              <button onClick={createProject} className="btn-primary px-6 py-2">
                + Neues Projekt
              </button>
            </div>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedProject(p); setActiveTab("story"); refreshProject(p.id); }}
              className="w-full card p-4 text-left hover:border-[#4a7c59]/30 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-[#f5eed6] group-hover:text-[#a8d5b8]">
                    {p.name}
                  </h3>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {p.characters.length} Charaktere · {p.sequences.length} Sequenzen · {statusLabel(p.status)}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor(p.status)}`}>
                  {statusLabel(p.status)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          {/* Project Header */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setSelectedProject(null)}
              className="text-white/30 hover:text-white/60 text-xs"
            >
              ← Zurueck
            </button>
            <h2 className="text-sm font-medium text-[#f5eed6]">{selectedProject.name}</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor(selectedProject.status)}`}>
              {statusLabel(selectedProject.status)}
            </span>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 mb-4 bg-white/5 rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] transition-all ${
                  activeTab === tab.id
                    ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                <span>{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {/* Active Tasks */}
          <TaskStatusBar projectId={selectedProject.id} />

          <div className="card p-5">
            {activeTab === "story" && (
              <StoryTab project={selectedProject} onUpdate={refreshProject} />
            )}
            {activeTab === "screenplay" && (
              <ScreenplayTab project={selectedProject} onUpdate={refreshProject} />
            )}
            {activeTab === "characters" && (
              <CharactersTab project={selectedProject} onUpdate={refreshProject} />
            )}
            {/* Storyboard tab removed — not used */}
            {activeTab === "production" && (
              <ProductionTab project={selectedProject} onUpdate={refreshProject} />
            )}
          </div>
        </div>
      )}
    </div>
    </ToastProvider>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

import { blobProxyOpt as portraitSrc, blobProxy } from "@/lib/studio/blob-proxy";
import { TRANSITIONS, getTransitionLabel } from "@/lib/studio/transitions";

// ── Visual Style Presets ───────────────────────────────────────────

function statusLabel(s: string) {
  return s === "draft" ? "Entwurf" :
    s === "screenplay" ? "Drehbuch" :
    s === "characters" ? "Charaktere" :
    s === "production" ? "Produktion" :
    s === "completed" ? "Fertig" : s;
}

function statusColor(s: string) {
  return s === "completed" ? "bg-[#a8d5b8]/20 text-[#a8d5b8]" :
    s === "production" ? "bg-[#d4a853]/20 text-[#d4a853]" :
    s === "screenplay" ? "bg-blue-500/20 text-blue-300" :
    "bg-white/5 text-white/30";
}

// ── Story Tab ──────────────────────────────────────────────────────

type StoryInputMode = "text" | "ai" | "upload";

const INPUT_MODES: { id: StoryInputMode; label: string; icon: string }[] = [
  { id: "text", label: "Text", icon: "✏️" },
  { id: "ai", label: "AI generieren", icon: "🤖" },
  { id: "upload", label: "Upload", icon: "📄" },
];

const TONE_OPTIONS = [
  { id: "warm", label: "Warm & Geborgen" },
  { id: "adventurous", label: "Abenteuerlich" },
  { id: "calming", label: "Beruhigend" },
  { id: "funny", label: "Lustig" },
  { id: "dramatic", label: "Dramatisch" },
  { id: "educational", label: "Lehrreich" },
  { id: "reflective", label: "Nachdenklich" },
];

// Length derived from targetDuration for story generator
function durationToLength(sec: number): "short" | "medium" | "long" {
  if (sec <= 60) return "short";
  if (sec <= 300) return "medium";
  return "long";
}

function StoryTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const [mode, setMode] = useState<StoryInputMode>(project.storyText ? "text" : "ai");
  const [text, setText] = useState(project.storyText || "");
  const [name, setName] = useState(project.name);
  const [format, setFormat] = useState(project.format || "portrait");
  const [targetDuration, setTargetDuration] = useState(project.targetDurationSec || 60);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // AI generation state
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState("warm");
  const [setting, setSetting] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [goal, setGoal] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [genError, setGenError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const toast = useToast();

  useEffect(() => {
    setText(project.storyText || "");
    setName(project.name);
    if (project.storyText) setMode("text");
  }, [project.id, project.storyText, project.name]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/studio/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, storyText: text, storySource: mode === "ai" ? "ai" : "typed", format, targetDurationSec: targetDuration }),
    });
    onUpdate(project.id);
    setSaving(false);
    setSaved(true);
    toast.info("Gespeichert");
    setTimeout(() => setSaved(false), 2000);
  };

  const generateStory = async () => {
    if (!theme.trim()) return;
    setGenerating(true);
    setGenProgress("Starte...");
    setGenError("");
    setText("");
    const tid = toast.loading("Geschichte wird generiert...");

    const controller = new AbortController();
    abortRef.current = controller;

    // Use project characters if available, otherwise let AI create characters from the story
    const projectChars = project.characters.length > 0
      ? project.characters.map((c) => ({
          id: c.id,
          name: c.name,
          markerId: c.markerId || `[${c.name.toUpperCase()}]`,
          role: (c.role || "supporting") as "lead" | "supporting" | "narrator" | "minor",
          personality: c.personality || undefined,
          species: c.species || undefined,
          speakingStyle: undefined as string | undefined,
        }))
      : []; // Empty = AI creates characters from the story theme

    const brief = {
      theme,
      tone,
      length: durationToLength(targetDuration),
      targetDurationSec: targetDuration,
      setting: setting || undefined,
      pedagogicalGoal: goal || undefined,
      language: "de",
      audience: {
        name: childName || undefined,
        age: childAge ? parseInt(childAge) : undefined,
      },
      characters: projectChars,
    };

    try {
      const res = await fetch("/api/studio/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, projectId: project.id }),
        signal: controller.signal,
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errMsg = errData.error || `Fehler ${res.status}`;
        setGenError(errMsg);
        toast.error(errMsg, tid);
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setGenError("Kein Stream"); setGenerating(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              fullText += data.chunk;
              setText(fullText);
              toast.update(tid, "Schreibt Geschichte...");
            }
            if (data.progress) setGenProgress(data.progress);
            if (data.error) {
              setGenError(data.error);
              toast.error(data.error || "Generierung fehlgeschlagen", tid);
            }
            if (data.done && !data.error) {
              if (data.title) setName(data.title);
              if (data.text) setText(data.text);
              toast.success("Geschichte generiert!", tid);
            }
          } catch (parseErr) {
            console.warn("[Story] SSE parse error:", parseErr, line.slice(0, 100));
          }
        }
      }

      // Stream ended — check if we got text but no done signal (connection dropped)
      if (fullText && !genError) {
        setText(fullText);
        onUpdate(project.id);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = (err as Error).message || "Verbindung fehlgeschlagen";
        console.error("[Story] Stream error:", err);
        setGenError(msg);
        toast.error(msg, tid);

        // Recovery: check if story was saved despite stream failure
        try {
          const checkRes = await fetch(`/api/studio/projects/${project.id}`);
          const checkData = await checkRes.json();
          if (checkData.project?.storyText) {
            setText(checkData.project.storyText);
            if (checkData.project.name) setName(checkData.project.name);
            setGenError(""); // Clear error — story was saved
          }
        } catch (e) { console.warn("[Studio]", e); }
      }
    }

    setGenerating(false);
    setGenProgress("");
    abortRef.current = null;
    onUpdate(project.id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const content = await file.text();
      setText(content);
      setName(file.name.replace(/\.txt$/, ""));
    } else {
      setGenError("Nur .txt Dateien werden unterstuetzt. PDF/DOCX kommt spaeter.");
    }
  };

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Project Name */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
          Projektname
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Projektname eingeben..."
          className="w-full text-sm bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80"
        />
      </div>

      {/* Format Selector */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
          Format
        </label>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {[
            { id: "portrait", label: "9:16 Portrait", desc: "TikTok / Reels" },
            { id: "wide", label: "16:9 Wide", desc: "YouTube / Desktop" },
            { id: "cinema", label: "2.39:1 Kino", desc: "Cinemascope" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`flex-1 text-center py-1.5 rounded-md text-[10px] transition-all ${
                format === f.id
                  ? "bg-[#d4a853]/20 text-[#d4a853]"
                  : "text-white/30 hover:text-white/50"
              }`}
              title={f.desc}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration Selector */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
          Filmlaenge
        </label>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {[
            { sec: 20, label: "~20s Reel" },
            { sec: 60, label: "~1min Short" },
            { sec: 180, label: "~3min" },
            { sec: 300, label: "~5min" },
            { sec: 600, label: "~10min" },
            { sec: 1200, label: "~20min" },
          ].map((d) => (
            <button
              key={d.sec}
              onClick={() => setTargetDuration(d.sec)}
              className={`flex-1 text-center py-1.5 rounded-md text-[10px] transition-all ${
                targetDuration === d.sec
                  ? "bg-[#d4a853]/20 text-[#d4a853]"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Mode Selector */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
        {INPUT_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 py-1.5 rounded-md text-[10px] transition-all ${
              mode === m.id
                ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                : "text-white/30 hover:text-white/50"
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* TEXT MODE */}
      {mode === "text" && (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste oder schreibe deine Geschichte hier...\n\nVerwende Charakter-Marker wie [KODA], [KIKI] etc."}
            rows={12}
            className="w-full text-sm bg-white/5 border border-white/10 rounded-xl p-3 text-white/80 placeholder-white/20 resize-y"
          />
          <p className="text-[9px] text-white/35 mt-1">
            {wordCount} Woerter · ~{Math.ceil(wordCount / 2.5)}s Audio
          </p>
        </div>
      )}

      {/* AI MODE */}
      {mode === "ai" && (
        <div className="space-y-3">
          {/* Theme */}
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Thema / Idee</label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="z.B. Koda erklaert warum Mut nicht heisst keine Angst zu haben..."
              rows={2}
              className="w-full text-xs bg-white/5 border border-white/10 rounded-xl p-2.5 text-white/70 placeholder-white/20"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Stimmung</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70">
              {TONE_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {/* Optional: Setting + Goal */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Setting (optional)</label>
              <input value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="z.B. Magischer Wald" className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70 placeholder-white/20" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Paed. Ziel (optional)</label>
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="z.B. Mut, Selbstbewusstsein" className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70 placeholder-white/20" />
            </div>
          </div>

          {/* Optional: Personalization */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Kind Name (optional)</label>
              <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Fuer Personalisierung" className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70 placeholder-white/20" />
            </div>
            <div className="w-20">
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Alter</label>
              <input value={childAge} onChange={(e) => setChildAge(e.target.value)} type="number" min="2" max="99" placeholder="5" className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70 placeholder-white/20" />
            </div>
          </div>

          {/* Generate Button */}
          {!generating ? (
            <button
              onClick={generateStory}
              disabled={!theme.trim()}
              className="w-full py-2.5 rounded-xl bg-[#d4a853] text-black text-sm font-medium hover:bg-[#e4b863] disabled:opacity-50"
            >
              🤖 Geschichte generieren
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 border-2 border-[#a8d5b8] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-white/50">{genProgress}</span>
              </div>
              <button onClick={() => abortRef.current?.abort()} className="text-[10px] px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg">
                Abbrechen
              </button>
            </div>
          )}

          {/* Generated text preview */}
          {text && !generating && (
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Generierte Geschichte</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                className="w-full text-sm bg-white/5 border border-white/10 rounded-xl p-3 text-white/80 resize-y"
              />
              <p className="text-[9px] text-white/35 mt-1">
                {wordCount} Woerter · ~{Math.ceil(wordCount / 2.5)}s Audio · Kannst du noch bearbeiten
              </p>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD MODE */}
      {mode === "upload" && (
        <div className="space-y-3">
          <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center">
            <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" id="story-upload" />
            <label htmlFor="story-upload" className="cursor-pointer">
              <p className="text-2xl mb-2">📄</p>
              <p className="text-xs text-white/40">Klicke oder ziehe eine .txt Datei</p>
              <p className="text-[9px] text-white/35 mt-1">PDF und DOCX Support kommt spaeter</p>
            </label>
          </div>
          {text && (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                className="w-full text-sm bg-white/5 border border-white/10 rounded-xl p-3 text-white/80 resize-y"
              />
              <p className="text-[9px] text-white/35 mt-1">
                {wordCount} Woerter · ~{Math.ceil(wordCount / 2.5)}s Audio
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="text-[10px] text-red-300 bg-red-500/10 rounded-lg px-2.5 py-1.5">{genError}</div>
      )}

      {/* Save Button (all modes) */}
      {text.trim() && (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[#4a7c59] text-white text-xs font-medium hover:bg-[#5a8c69] disabled:opacity-50"
          >
            {saving ? "Speichert..." : "Speichern"}
          </button>
          {saved && <span className="text-[10px] text-[#a8d5b8]">Gespeichert!</span>}
        </div>
      )}
    </div>
  );
}

// ── Screenplay Tab ─────────────────────────────────────────────────

function ScreenplayTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const toast = useToast();
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ sequences: number; scenes: number } | null>(null);
  const [directingStyle, setDirectingStyle] = useState(project.directingStyle || DEFAULT_DIRECTING_STYLE);
  const savedAtmo = project.atmosphere || DEFAULT_ATMOSPHERE;
  const isCustomAtmo = savedAtmo.startsWith("custom:");
  const [atmosphere, setAtmosphere] = useState(isCustomAtmo ? "custom" : savedAtmo);
  const [customAtmo, setCustomAtmo] = useState(isCustomAtmo ? savedAtmo.replace("custom:", "") : "");
  const [screenplayMode, setScreenplayMode] = useState<"film" | "hoerspiel" | "audiobook">("film");
  const [visualStyle, setVisualStyle] = useState(project.stylePrompt ? (VISUAL_STYLES.find((s) => s.prompt === project.stylePrompt)?.id || "custom") : "realistic");
  const [customStylePrompt, setCustomStylePrompt] = useState(project.stylePrompt || "");
  const resolvedStylePrompt = visualStyle === "custom"
    ? customStylePrompt
    : VISUAL_STYLES.find((s) => s.id === visualStyle)?.prompt || "";
  const abortRef = useRef<AbortController | null>(null);

  // Locations + Props from Library
  const [availableLocations, setAvailableLocations] = useState<Array<{ id: string; name: string; blobUrl: string }>>([]);
  const [availableProps, setAvailableProps] = useState<Array<{ id: string; name: string; blobUrl: string }>>([]);
  // Restore previous selection from project
  const savedAssets = project.selectedAssets;
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set(savedAssets?.locationIds || []));
  const [selectedPropIds, setSelectedPropIds] = useState<Set<string>>(new Set(savedAssets?.propIds || []));
  const [availableMusic, setAvailableMusic] = useState<Array<{ id: string; name: string; blobUrl: string; durationSec?: number }>>([]);
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(savedAssets?.musicId || null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showPropPicker, setShowPropPicker] = useState(false);

  const blobProxy = (url: string) =>
    url.includes(".blob.vercel-storage.com")
      ? `/api/studio/blob?url=${encodeURIComponent(url)}`
      : url;

  useEffect(() => {
    if (assetsLoaded) return;
    Promise.all([
      fetch("/api/studio/assets?type=landscape").then((r) => r.json()),
      fetch("/api/studio/assets?type=reference&category=prop").then((r) => r.json()),
      fetch("/api/studio/assets?type=sound").then((r) => r.json()),
    ]).then(([locData, propData, musicData]) => {
      setAvailableLocations((locData.assets || []).map((a: any) => ({ id: a.id, name: a.name || "Location", blobUrl: a.blobUrl })));
      setAvailableProps((propData.assets || []).map((a: any) => ({ id: a.id, name: a.name || "Prop", blobUrl: a.blobUrl })));
      setAvailableMusic((musicData.assets || []).map((a: any) => ({ id: a.id, name: a.name || "Musik", blobUrl: a.blobUrl, durationSec: a.durationSec })));
      // Start empty — user picks what they need
      setAssetsLoaded(true);
    }).catch(() => setAssetsLoaded(true));
  }, [assetsLoaded]);

  const generate = async (force: boolean, sequenceMode: "full" | "next" = "full") => {
    if (!project.storyText) return;
    setGenerating(true);
    setProgress(sequenceMode === "next" ? "Generiere naechste Sequenz..." : "Starte...");
    setError("");
    setResult(null);
    const tid = toast.loading(sequenceMode === "next" ? "Naechste Sequenz wird generiert..." : "Drehbuch wird erstellt...");

    // Save style settings + selected assets
    await fetch(`/api/studio/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directingStyle,
        atmosphere: atmosphere === "custom" ? `custom:${customAtmo}` : atmosphere,
        stylePrompt: resolvedStylePrompt,
        selectedAssets: {
          locationIds: Array.from(selectedLocationIds),
          propIds: Array.from(selectedPropIds),
          musicId: selectedMusicId,
        },
      }),
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/studio/projects/${project.id}/screenplay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directingStyle,
          atmosphere: atmosphere === "custom" ? customAtmo : undefined,
          atmospherePreset: atmosphere !== "custom" ? atmosphere : undefined,
          mode: screenplayMode,
          visualStyle,
          force: true,
          selectedLocationIds: Array.from(selectedLocationIds),
          selectedPropIds: Array.from(selectedPropIds),
          sequenceMode,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errMsg = errData.error || `Fehler ${res.status}`;
        setError(errMsg);
        toast.error(errMsg, tid);
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setError("Kein Stream"); toast.error("Kein Stream", tid); setGenerating(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress) {
              setProgress(data.progress);
              toast.update(tid, data.progress);
            }
            if (data.error) {
              setError(data.error);
              toast.error(data.error, tid);
            }
            if (data.done) {
              gotDone = true;
              if (!data.error) {
                setResult({ sequences: data.sequences || 0, scenes: data.scenes || 0 });
                toast.success(`Drehbuch: ${data.sequences || 0} Sequenzen, ${data.scenes || 0} Szenen`, tid);
              }
            }
          } catch (e) { console.warn("[Studio] SSE parse:", e); }
        }
      }

      if (!gotDone) {
        // Check if screenplay was actually generated despite connection loss
        try {
          const checkRes = await fetch(`/api/studio/projects/${project.id}`);
          const checkData = await checkRes.json();
          if (checkData.project?.screenplay && checkData.project?.sequences?.length > 0) {
            // Screenplay WAS generated — connection just dropped
            setResult({ sequences: checkData.project.sequences.length, scenes: 0 });
            toast.success(`Drehbuch: ${checkData.project.sequences.length} Sequenzen`, tid);
            onUpdate(project.id);
          } else {
            setError("Verbindung unterbrochen. Bitte nochmal versuchen.");
            toast.error("Verbindung unterbrochen", tid);
          }
        } catch {
          setError("Verbindung unterbrochen. Bitte nochmal versuchen.");
          toast.error("Verbindung unterbrochen", tid);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const errMsg = (err as Error).message;
        setError(errMsg);
        toast.error(errMsg, tid);
      }
    }

    setGenerating(false);
    setProgress("");
    abortRef.current = null;
    onUpdate(project.id);
  };

  const stopGeneration = () => { abortRef.current?.abort(); };

  if (!project.storyText) {
    return (
      <div className="text-center py-8 text-white/40 text-sm">
        Zuerst eine Geschichte eingeben (Tab &apos;Geschichte&apos;).
      </div>
    );
  }

  const uncastCharacters = project.characters.filter((c) => !c.actorId);
  const hasCharacters = project.characters.length > 0;

  return (
    <div className="space-y-5">
      {/* Workflow hint: cast actors before generating screenplay */}
      {hasCharacters && uncastCharacters.length > 0 && (
        <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/15">
          <p className="text-[10px] text-amber-400/80">
            <strong>{uncastCharacters.length} {uncastCharacters.length === 1 ? "Charakter" : "Charaktere"} ohne Actor:</strong>{" "}
            {uncastCharacters.map((c) => c.name).join(", ")}
          </p>
          <p className="text-[9px] text-amber-400/50 mt-0.5">
            Tipp: Actors zuerst im Tab &quot;Charaktere&quot; casten — dann fliessen Outfit, Traits und Aussehen ins Drehbuch ein.
          </p>
        </div>
      )}
      {!hasCharacters && (
        <div className="px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/15">
          <p className="text-[10px] text-blue-300/70">
            Noch keine Charaktere extrahiert. Gehe zum Tab &quot;Charaktere&quot; und extrahiere sie zuerst aus der Geschichte.
          </p>
        </div>
      )}

      {/* Mode Selector */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
          Modus
        </label>
        <div className="flex gap-1.5">
          {([
            { id: "film" as const, icon: "🎬", label: "Film", desc: "Dialog, Lip-Sync, SFX" },
            { id: "hoerspiel" as const, icon: "🎧", label: "Hoerspiel", desc: "Multi-Voice, SFX, kein Lip-Sync" },
            { id: "audiobook" as const, icon: "📖", label: "Hoerbuch", desc: "1 Erzaehler, vorgelesen" },
          ]).map((m) => (
            <button
              key={m.id}
              onClick={() => setScreenplayMode(m.id)}
              disabled={generating}
              className={`flex-1 py-2 px-2 rounded-lg text-center transition-all ${
                screenplayMode === m.id
                  ? "bg-[#C8A97E]/20 text-[#C8A97E] font-medium border border-[#C8A97E]/30"
                  : "bg-white/5 text-white/30 border border-transparent hover:text-white/50"
              }`}
            >
              <span className="text-[12px] block">{m.icon} {m.label}</span>
              <span className="text-[10px] block mt-0.5 opacity-60">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Visual Style Selector */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
          Visueller Style
        </label>
        <div className="flex flex-wrap gap-1.5">
          {VISUAL_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setVisualStyle(s.id)}
              disabled={generating}
              className={`py-1.5 px-2.5 rounded-lg text-[10px] transition-all ${
                visualStyle === s.id
                  ? "bg-[#C8A97E]/20 text-[#C8A97E] font-medium border border-[#C8A97E]/30"
                  : "bg-white/5 text-white/30 border border-transparent hover:text-white/50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {visualStyle === "custom" && (
          <textarea
            value={customStylePrompt}
            onChange={(e) => setCustomStylePrompt(e.target.value)}
            placeholder="Beschreibe deinen visuellen Style..."
            rows={2}
            disabled={generating}
            className="w-full mt-2 text-xs bg-white/5 border border-white/10 rounded-xl p-3 text-white/70 placeholder-white/20"
          />
        )}
      </div>

      {/* Settings Row */}
      <div className="flex flex-wrap gap-3">
        {/* Directing Style */}
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
            Regie-Stil
          </label>
          <select
            value={directingStyle}
            onChange={(e) => setDirectingStyle(e.target.value)}
            disabled={generating}
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70"
          >
            {Object.values(DIRECTING_STYLES).map((s) => (
              <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
            ))}
          </select>
        </div>

        {/* Atmosphere */}
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
            Atmosphaere
          </label>
          <select
            value={atmosphere}
            onChange={(e) => setAtmosphere(e.target.value)}
            disabled={generating}
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70"
          >
            {Object.values(ATMOSPHERE_PRESETS).map((a) => (
              <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom atmosphere text */}
      {atmosphere === "custom" && (
        <textarea
          value={customAtmo}
          onChange={(e) => setCustomAtmo(e.target.value)}
          placeholder="Beschreibe die Lichtstimmung, Farben, Atmosphaere..."
          rows={3}
          className="w-full text-xs bg-white/5 border border-white/10 rounded-xl p-3 text-white/70 placeholder-white/20"
        />
      )}

      {/* Style Description */}
      <p className="text-[10px] text-white/25 italic">
        {DIRECTING_STYLES[directingStyle]?.description || ""}
      </p>

      {/* Film-Assets: Locations, Props, Musik — compact buttons */}
      <div className="flex flex-wrap gap-3 pt-3 border-t border-white/5">
        {/* Locations */}
        <button
          onClick={() => setShowLocationPicker(true)}
          disabled={generating || availableLocations.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs transition-all border ${
            selectedLocationIds.size > 0
              ? "bg-[#3d6b4a]/15 text-[#a8d5b8] border-[#3d6b4a]/30"
              : "bg-white/5 text-white/40 border-white/10 hover:border-white/20"
          } disabled:opacity-30`}
        >
          <span>📍</span>
          <span>{selectedLocationIds.size > 0 ? `${selectedLocationIds.size} Location${selectedLocationIds.size > 1 ? "s" : ""}` : "Locations waehlen"}</span>
        </button>

        {/* Props */}
        <button
          onClick={() => setShowPropPicker(true)}
          disabled={generating || availableProps.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs transition-all border ${
            selectedPropIds.size > 0
              ? "bg-[#d4a853]/15 text-[#d4a853] border-[#d4a853]/30"
              : "bg-white/5 text-white/40 border-white/10 hover:border-white/20"
          } disabled:opacity-30`}
        >
          <span>🎪</span>
          <span>{selectedPropIds.size > 0 ? `${selectedPropIds.size} Prop${selectedPropIds.size > 1 ? "s" : ""}` : "Props waehlen"}</span>
        </button>

        {/* Music — compact select */}
        <div className="flex items-center gap-2">
          <span className="text-white/30">🎵</span>
          <select
            value={selectedMusicId || ""}
            onChange={(e) => setSelectedMusicId(e.target.value || null)}
            disabled={generating || availableMusic.length === 0}
            className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/50 focus:outline-none focus:border-purple-500/30 appearance-none cursor-pointer disabled:opacity-30"
          >
            <option value="">Keine Musik</option>
            {availableMusic.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.durationSec ? ` (${Math.round(m.durationSec)}s)` : ""}</option>
            ))}
          </select>
        </div>

        {/* Library link */}
        {availableLocations.length === 0 && availableProps.length === 0 && (
          <a href="/studio/library" className="text-xs text-[#d4a853]/50 hover:text-[#d4a853] self-center">
            + In Library erstellen
          </a>
        )}
      </div>

      {/* Music preview */}
      {selectedMusicId && (
        <audio
          src={blobProxy(availableMusic.find((m) => m.id === selectedMusicId)?.blobUrl || "")}
          controls
          className="w-full h-8 opacity-40 mt-1"
        />
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowLocationPicker(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#f5eed6]">📍 Locations fuer diesen Film</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/30">{selectedLocationIds.size} ausgewaehlt</span>
                <button onClick={() => setShowLocationPicker(false)} className="text-white/30 hover:text-white/60 text-lg">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableLocations.map((loc) => {
                  const sel = selectedLocationIds.has(loc.id);
                  return (
                    <button
                      key={loc.id}
                      onClick={() => {
                        const next = new Set(selectedLocationIds);
                        if (sel) next.delete(loc.id); else next.add(loc.id);
                        setSelectedLocationIds(next);
                      }}
                      className={`rounded-xl overflow-hidden border-2 transition-all ${sel ? "border-[#a8d5b8]" : "border-transparent hover:border-white/15"}`}
                    >
                      <img src={blobProxy(loc.blobUrl)} alt="" className="w-full h-24 object-cover" />
                      <div className="px-2 py-1.5 bg-white/[0.03] flex items-center justify-between">
                        <span className="text-xs text-white/60 truncate">{loc.name}</span>
                        {sel && <span className="text-[#a8d5b8] text-sm">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex justify-between">
              <button onClick={() => setSelectedLocationIds(new Set())} className="text-xs text-white/30 hover:text-white/50">Alle abwaehlen</button>
              <button onClick={() => setShowLocationPicker(false)} className="px-4 py-2 rounded-xl bg-[#3d6b4a]/30 text-[#a8d5b8] text-xs font-medium">Fertig</button>
            </div>
          </div>
        </div>
      )}

      {/* Props Picker Modal */}
      {showPropPicker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowPropPicker(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#f5eed6]">🎪 Props fuer diesen Film</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/30">{selectedPropIds.size} ausgewaehlt</span>
                <button onClick={() => setShowPropPicker(false)} className="text-white/30 hover:text-white/60 text-lg">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {availableProps.map((prop) => {
                  const sel = selectedPropIds.has(prop.id);
                  return (
                    <button
                      key={prop.id}
                      onClick={() => {
                        const next = new Set(selectedPropIds);
                        if (sel) next.delete(prop.id); else next.add(prop.id);
                        setSelectedPropIds(next);
                      }}
                      className={`rounded-xl overflow-hidden border-2 transition-all ${sel ? "border-[#d4a853]" : "border-transparent hover:border-white/15"}`}
                    >
                      <img src={blobProxy(prop.blobUrl)} alt="" className="w-full aspect-square object-cover" />
                      <div className="px-2 py-1.5 bg-white/[0.03] flex items-center justify-between">
                        <span className="text-xs text-white/60 truncate">{prop.name}</span>
                        {sel && <span className="text-[#d4a853] text-sm">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex justify-between">
              <button onClick={() => setSelectedPropIds(new Set())} className="text-xs text-white/30 hover:text-white/50">Alle abwaehlen</button>
              <button onClick={() => setShowPropPicker(false)} className="px-4 py-2 rounded-xl bg-[#d4a853]/20 text-[#d4a853] text-xs font-medium">Fertig</button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <div className="flex items-center gap-3">
        {!generating ? (
          <>
            <button
              onClick={() => generate(true)}
              className="px-5 py-2 rounded-xl bg-[#d4a853] text-black text-sm font-medium hover:bg-[#e4b863]"
            >
              {project.sequences.length > 0 ? "Drehbuch neu generieren" : "Drehbuch generieren"}
            </button>
          </>
        ) : (
          <button
            onClick={stopGeneration}
            className="px-5 py-2 rounded-xl bg-red-500/20 text-red-300 text-sm font-medium hover:bg-red-500/30"
          >
            Abbrechen
          </button>
        )}
      </div>

      {/* Progress */}
      {generating && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-[#a8d5b8] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-white/50">{progress}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-[#a8d5b8]/10 border border-[#a8d5b8]/20 rounded-xl p-4">
          <p className="text-sm font-medium text-[#a8d5b8] mb-1">Drehbuch erstellt!</p>
          <p className="text-[10px] text-white/40">
            {result.sequences} Sequenzen · {result.scenes} Szenen
          </p>
        </div>
      )}

      {/* Existing sequences with scenes */}
      {project.sequences.length > 0 && !generating && (
        <div>
          <h4 className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
            Drehbuch — {project.sequences.length} Sequenzen
          </h4>
          <div className="space-y-3">
            {project.sequences
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((seq, i) => (
                <SequencePreview key={seq.id} sequence={seq} index={i} characters={project.characters} projectId={project.id} onUpdate={() => onUpdate(project.id)} isFirst={i === 0} isLast={i === project.sequences.length - 1} />
              ))}
          </div>

          {/* Add next sequence */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => generate(true, "next")}
                disabled={generating}
                className="px-4 py-2 rounded-xl bg-[#3d6b4a]/30 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 disabled:opacity-50"
              >
                + Naechste Sequenz hinzufuegen
              </button>
              <span className="text-[10px] text-white/30">
                Generiert die naechste Sequenz basierend auf der bisherigen Geschichte
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Character Card (with portrait upload) ──────────────────────────

import type { DigitalActor } from "@/lib/studio/ui-types";

function CharacterCard({ character, projectId, onUpdate, visualStyle }: { character: Character; projectId: string; onUpdate: () => void; visualStyle?: string }) {
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(character.name);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fullscreenPortrait, setFullscreenPortrait] = useState(false);
  const [showCastMenu, setShowCastMenu] = useState(false);
  const [actors, setActors] = useState<DigitalActor[]>([]);
  const [loadingActors, setLoadingActors] = useState(false);
  const toast = useToast();

  const generatePortrait = async () => {
    setGenerating(true);
    const tid = toast.loading("Portrait wird generiert...");
    try {
      const res = await fetch("/api/studio/portraits/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          projectId,
          description: character.description,
          style: visualStyle || "realistic",
        }),
      });
      if (res.ok) {
        toast.success("Portrait fertig!", tid);
        onUpdate();
      } else {
        toast.error("Portrait fehlgeschlagen", tid);
      }
    } catch {
      toast.error("Portrait fehlgeschlagen", tid);
    }
    setGenerating(false);
  };

  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("characterId", character.id);
    formData.append("projectId", projectId);

    try {
      const res = await fetch("/api/studio/portraits/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.portraitUrl) {
        // Update character with new portrait
        await fetch(`/api/studio/projects/${projectId}/characters`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character.id, updates: { portraitUrl: data.portraitUrl } }),
        });
        onUpdate();
      }
    } catch (err) {
      console.error("Portrait upload failed:", err);
    }
    setUploading(false);
  };

  const loadActors = async () => {
    setLoadingActors(true);
    try {
      const res = await fetch("/api/studio/actors");
      const data = await res.json();
      setActors(data.actors || []);
    } catch (e) { console.warn("[Studio]", e); }
    setLoadingActors(false);
  };

  const castActor = async (actor: DigitalActor) => {
    try {
      await fetch(`/api/studio/projects/${projectId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, updates: { actorId: actor.id } }),
      });
      setShowCastMenu(false);
      toast.info("Actor zugewiesen");
      onUpdate();
    } catch (e) { console.warn("[Studio]", e); }
  };

  const uncastActor = async () => {
    try {
      await fetch(`/api/studio/projects/${projectId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, updates: { actorId: null } }),
      });
      setShowCastMenu(false);
      toast.info("Actor entfernt");
      onUpdate();
    } catch (e) { console.warn("[Studio]", e); }
  };

  const resyncActor = async () => {
    if (!character.actorId) return;
    try {
      // Re-cast the same actor to create a new snapshot
      await fetch(`/api/studio/projects/${projectId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, updates: { actorId: character.actorId } }),
      });
      toast.info("Actor synchronisiert");
      onUpdate();
    } catch (e) { console.warn("[Studio]", e); }
  };

  const [showVersions, setShowVersions] = useState(false);

  const switchVersion = async (idx: number) => {
    try {
      await fetch(`/api/studio/projects/${projectId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, updates: { switchToSnapshot: idx } }),
      });
      setShowVersions(false);
      onUpdate();
    } catch (e) { console.warn("[Studio]", e); }
  };

  const inputId = `portrait-${character.id}`;

  return (
    <div className="card p-3 text-center group relative">
      {/* Portrait with upload overlay */}
      <div className="relative mx-auto w-20 h-20">
        {character.portraitUrl ? (
          <img
            src={portraitSrc(character.portraitUrl)}
            alt={character.name}
            className="w-20 h-20 rounded-full object-cover cursor-pointer"
            onClick={() => setFullscreenPortrait(true)}
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
            <span className="text-2xl">{character.emoji || "🎭"}</span>
          </div>
        )}
        {/* Upload overlay */}
        <label
          htmlFor={inputId}
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
        >
          {uploading || generating ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-white text-[10px]">📷</span>
          )}
        </label>
        {/* AI generate button on hover */}
        {!uploading && !generating && (
          <button
            onClick={(e) => { e.stopPropagation(); generatePortrait(); }}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#d4a853] text-black text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-[#e4b863]"
            title="AI Portrait generieren"
          >
            AI
          </button>
        )}
        <input id={inputId} type="file" accept="image/*" onChange={handlePortraitUpload} className="hidden" />
      </div>

      {/* Editable character name */}
      {editingName ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={async () => {
            if (editName.trim() && editName.trim() !== character.name) {
              await fetch(`/api/studio/projects/${projectId}/characters`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ characterId: character.id, updates: { name: editName.trim() } }),
              });
              onUpdate();
            }
            setEditingName(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setEditName(character.name); setEditingName(false); }
          }}
          className="w-full text-center text-xs font-medium text-[#f5eed6] mt-1.5 bg-white/10 border border-[#d4a853]/30 rounded px-1 py-0.5 focus:outline-none focus:border-[#d4a853]"
        />
      ) : (
        <p
          className="text-sm font-semibold text-[#f5eed6] mt-2 cursor-pointer hover:text-[#d4a853] transition-colors"
          onClick={() => { setEditName(character.name); setEditingName(true); }}
          title="Klicke zum Umbenennen"
        >
          {character.name}
        </p>
      )}
      <p className="text-[11px] text-white/40">
        {character.role === "lead" ? "Hauptrolle" :
         character.role === "narrator" ? "Erzaehler" :
         character.role === "minor" ? "Statistin" : "Nebenrolle"}
      </p>
      {character.markerId && (
        <p className="text-[10px] text-white/35 mt-0.5 font-mono">{character.markerId}</p>
      )}
      {!character.portraitUrl && !character.actorId && (
        <div className="flex gap-2 mt-2 justify-center">
          <p className="text-[10px] text-white/35">Actor casten fuer Portrait</p>
        </div>
      )}
      {/* Cast Actor button + status */}
      {character.actorId ? (
        <>
          <div className="mt-2 flex items-center gap-1.5 justify-center">
            <span className="text-[11px] text-purple-300/70">
              {actors.find(a => a.id === character.actorId)?.name || "Actor"}
            </span>
            <button onClick={resyncActor} className="text-[11px] text-[#d4a853]/50 hover:text-[#d4a853]" title="Vom Actor aktualisieren">&#x21BB;</button>
            {character.castHistory && (character.castHistory as Array<Record<string, unknown>>).length > 0 && (
              <button onClick={() => setShowVersions(!showVersions)} className="text-[11px] text-white/30 hover:text-white/50" title="Versionen">&#x23F3;</button>
            )}
            <button onClick={() => { setShowCastMenu(!showCastMenu); if (!showCastMenu && actors.length === 0) loadActors(); }} className="text-[11px] text-white/30 hover:text-white/50" title="Anderen Actor waehlen">&#x270E;</button>
            <button
              onClick={async () => {
                if (!character.actorId) return;
                const style = prompt("Style fuer Duplikat? (z.B. pixar-3d, realistic, anime) oder leer fuer Kopie:");
                const t = toast.loading("Actor wird dupliziert...");
                try {
                  const res = await fetch("/api/studio/actors/duplicate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ actorId: character.actorId, newStyle: style || undefined }),
                  });
                  const data = await res.json();
                  toast.success(data.message || "Dupliziert!", t);
                } catch { toast.error("Fehler", t); }
              }}
              className="text-[11px] text-white/30 hover:text-white/50"
              title="Actor duplizieren (neuer Stil)"
            >&#x2398;</button>
          </div>
          {showVersions && character.castHistory && (
            <div className="mt-1 bg-[#1a2e1a] border border-white/10 rounded-lg p-1.5 text-left">
              <p className="text-[9px] text-white/25 px-1 mb-1">Versionen (aktuell: {character.castSnapshot ? new Date((character.castSnapshot as Record<string, string>).syncedAt).toLocaleString("de", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?"})</p>
              {(character.castHistory as Array<Record<string, string>>).map((snap, idx) => (
                <button
                  key={idx}
                  onClick={() => switchVersion(idx)}
                  className="w-full text-left px-2 py-0.5 rounded text-[10px] text-white/40 hover:bg-white/5 hover:text-white/60"
                >
                  {new Date(snap.syncedAt).toLocaleString("de", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <button
          onClick={() => setShowCastMenu(true)}
          className="mt-2 text-[9px] px-2 py-1 rounded-md bg-purple-500/15 text-purple-300/70 hover:text-purple-300 hover:bg-purple-500/25 transition-colors"
        >
          {"\uD83C\uDFAD"} Actor casten
        </button>
      )}
      {character.voiceId && !character.actorId && (
        <p className="text-[10px] text-green-400/50 mt-0.5">Stimme zugewiesen</p>
      )}
      {/* Cast Actor — Library Picker */}
      {showCastMenu && (
        <LibraryPicker
          type="actor"
          blobProxy={(url) => url.includes(".blob.vercel-storage.com") ? `/api/studio/blob?url=${encodeURIComponent(url)}` : url}
          onSelect={async (item) => {
            // Cast the selected actor
            await fetch(`/api/studio/projects/${projectId}/characters`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ characterId: character.id, updates: { actorId: item.id } }),
            });
            setShowCastMenu(false);
            onUpdate();
          }}
          onClose={() => setShowCastMenu(false)}
        />
      )}
      {/* Fullscreen portrait — via Portal (no flicker) */}
      {fullscreenPortrait && character.portraitUrl && (
        <ImageLightbox src={portraitSrc(character.portraitUrl!)!} alt={character.name} onClose={() => setFullscreenPortrait(false)} />
      )}
    </div>
  );
}

// ── Sequence Preview (Screenplay Tab) ──────────────────────────────

function SequencePreview({ sequence, index, characters, projectId, onUpdate, isFirst, isLast }: { sequence: Sequence; index: number; characters: Character[]; projectId?: string; onUpdate?: () => void; isFirst?: boolean; isLast?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showCostumes, setShowCostumes] = useState(false);
  const [costumeEdits, setCostumeEdits] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const moveSequence = async (direction: "up" | "down") => {
    if (!projectId) return;
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      toast.info(`Sequenz ${direction === "up" ? "nach oben" : "nach unten"} verschoben`);
      onUpdate?.();
    } catch { toast.error("Verschieben fehlgeschlagen"); }
  };

  const deleteSequence = async () => {
    if (!projectId) return;
    const tid = toast.loading("Sequenz wird geloescht...");
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Loeschen fehlgeschlagen", tid); return; }
      toast.success(`Sequenz "${sequence.name}" geloescht`, tid);
      setConfirmDelete(false);
      onUpdate?.();
    } catch { toast.error("Netzwerkfehler", tid); }
  };
  const [savingCostumes, setSavingCostumes] = useState(false);
  const toast = useToast();
  const charMap = new Map(characters.map((c) => [c.id, c]));

  // Characters in this sequence
  const seqCharacters = (sequence.scenes || [])
    .filter((s) => s.characterId)
    .map((s) => s.characterId!)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map((id) => charMap.get(id))
    .filter(Boolean) as Character[];

  const saveCostumes = async () => {
    if (!projectId) return;
    setSavingCostumes(true);
    const costumes: Record<string, { description: string }> = {};
    for (const [charId, desc] of Object.entries(costumeEdits)) {
      if (desc.trim()) costumes[charId] = { description: desc.trim() };
    }
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costumes: Object.keys(costumes).length > 0 ? costumes : null }),
      });
      toast.info("Costumes gespeichert");
      onUpdate?.();
    } catch {
      toast.error("Costumes speichern fehlgeschlagen");
    }
    setSavingCostumes(false);
    setShowCostumes(false);
  };

  return (
    <div className="bg-white/3 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/35 w-4 text-right">{index + 1}</span>
          <div>
            <span className="text-xs text-white/60">{sequence.name}</span>
            {sequence.location && (
              <span className="text-[9px] text-white/25 ml-2">{sequence.location}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Move up/down + delete */}
          {projectId && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); moveSequence("up"); }}
                disabled={isFirst}
                className={`text-[10px] px-1 py-0.5 rounded ${isFirst ? "text-white/10 cursor-not-allowed" : "text-white/30 hover:text-white/60 hover:bg-white/5"}`}
                title="Nach oben"
              >↑</button>
              <button
                onClick={(e) => { e.stopPropagation(); moveSequence("down"); }}
                disabled={isLast}
                className={`text-[10px] px-1 py-0.5 rounded ${isLast ? "text-white/10 cursor-not-allowed" : "text-white/30 hover:text-white/60 hover:bg-white/5"}`}
                title="Nach unten"
              >↓</button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="text-[10px] px-1 py-0.5 rounded text-red-400/30 hover:text-red-400 hover:bg-red-500/10"
                title="Sequenz loeschen"
              >✕</button>
            </>
          )}
          {sequence.costumes && Object.keys(sequence.costumes).length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300/50">Costumes</span>
          )}
          <span className="text-[9px] text-white/25">{sequence.sceneCount || 0} Szenen</span>
          <span className="text-white/30 text-[10px]">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <p className="text-[10px] text-red-300/70 flex-1">
            Sequenz &ldquo;{sequence.name}&rdquo; mit {sequence.sceneCount || 0} Szenen loeschen?
          </p>
          <button onClick={() => setConfirmDelete(false)} className="text-[9px] text-white/30 px-2 py-1 rounded hover:bg-white/5">Abbrechen</button>
          <button onClick={deleteSequence} className="text-[9px] text-red-300 px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 font-medium">Loeschen</button>
        </div>
      )}
      {open && (
        <div className="px-3 pb-2 space-y-2 border-t border-white/5 pt-2">
          {/* Costume editor toggle */}
          {seqCharacters.length > 0 && (
            <div>
              <button
                onClick={() => {
                  setShowCostumes(!showCostumes);
                  if (!showCostumes) {
                    // Pre-fill with existing costumes
                    const edits: Record<string, string> = {};
                    for (const c of seqCharacters) {
                      edits[c.id] = sequence.costumes?.[c.id]?.description || "";
                    }
                    setCostumeEdits(edits);
                  }
                }}
                className="text-[9px] text-purple-300/40 hover:text-purple-300/60 transition-all"
              >
                {showCostumes ? "Costumes ausblenden" : "Costumes bearbeiten"}
              </button>

              {showCostumes && (
                <div className="mt-2 space-y-2 bg-white/[0.02] rounded-lg p-2.5">
                  <p className="text-[10px] text-white/35">Outfit-Override pro Character fuer diese Sequenz (leer = Standard-Outfit)</p>
                  {seqCharacters.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="text-[9px] text-white/40 w-20 shrink-0 truncate">{c.emoji} {c.name}</span>
                      <input
                        value={costumeEdits[c.id] || ""}
                        onChange={(e) => setCostumeEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder={c.actorOutfit || "Standard-Outfit"}
                        className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] text-white/60 placeholder:text-white/30 focus:outline-none focus:border-purple-500/30"
                      />
                    </div>
                  ))}
                  <button
                    onClick={saveCostumes}
                    disabled={savingCostumes}
                    className="text-[9px] px-3 py-1 rounded bg-purple-500/20 text-purple-300/60 hover:text-purple-300 disabled:opacity-30"
                  >
                    {savingCostumes ? "Speichert..." : "Costumes speichern"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Scene list */}
          {sequence.scenes && sequence.scenes.map((scene, si) => (
            <SceneDetailRow
              key={scene.id || si}
              scene={scene}
              index={si}
              sequenceId={sequence.id}
              projectId={projectId || ""}
              character={scene.characterId ? charMap.get(scene.characterId) : undefined}
              onSceneUpdate={projectId ? async (sceneIndex, updates) => {
                // Update scene in sequence's scenes JSON via API
                try {
                  const updatedScenes = [...(sequence.scenes || [])];
                  updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], ...updates };
                  await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scenes: updatedScenes }),
                  });
                  onUpdate?.();
                } catch (e) { console.warn("[Studio]", e); }
              } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scene Detail Row (expandable) ─────────────────────────────────

// ── Scene Description Editor (manual + AI correction) ────────

function SceneDescriptionEditor({ description, sceneIndex, sequenceId, projectId, onSave }: {
  description: string;
  sceneIndex: number;
  sequenceId: string;
  projectId: string;
  onSave: (newDesc: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "ai">("view");
  const [editText, setEditText] = useState(description);
  const [correction, setCorrection] = useState("");
  const [aiResult, setAiResult] = useState<{ description: string; changes: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleAiCorrection = async () => {
    if (!correction.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/enhance-scene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIndex, correction: correction.trim() }),
      });
      if (!res.ok) { toast.error("AI-Korrektur fehlgeschlagen"); setLoading(false); return; }
      const data = await res.json();
      setAiResult(data);
    } catch { toast.error("Netzwerkfehler"); }
    setLoading(false);
  };

  if (mode === "view") {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/35 uppercase">Szenen-Beschreibung:</span>
          <div className="flex gap-1">
            <button onClick={() => { setEditText(description); setMode("edit"); }} className="text-[9px] text-white/25 hover:text-white/50 px-1.5 py-0.5 rounded hover:bg-white/5">
              Bearbeiten
            </button>
            <button onClick={() => setMode("ai")} className="text-[9px] text-[#d4a853]/50 hover:text-[#d4a853] px-1.5 py-0.5 rounded hover:bg-[#d4a853]/10">
              AI-Korrektur
            </button>
          </div>
        </div>
        <p className="text-[10px] text-white/40">{description}</p>
        <p className="text-[8px] text-white/15 mt-0.5">{description.length} Zeichen</p>
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div>
        <span className="text-[10px] text-white/35 uppercase block mb-1">Szenen-Beschreibung bearbeiten:</span>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={4}
          className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/60 resize-none font-mono"
        />
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[8px] ${editText.length > 700 ? "text-red-400" : "text-white/20"}`}>{editText.length}/700 Zeichen</span>
          <div className="flex gap-1">
            <button onClick={() => setMode("view")} className="text-[9px] text-white/30 px-2 py-1 rounded hover:bg-white/5">Abbrechen</button>
            <button onClick={() => { onSave(editText); setMode("view"); toast.success("Beschreibung gespeichert"); }} className="text-[9px] text-[#a8d5b8] px-2 py-1 rounded bg-[#a8d5b8]/10 hover:bg-[#a8d5b8]/20">Speichern</button>
          </div>
        </div>
      </div>
    );
  }

  // AI correction mode
  return (
    <div>
      <span className="text-[10px] text-white/35 uppercase block mb-1">AI-Korrektur:</span>
      <p className="text-[10px] text-white/30 mb-2">{description}</p>
      {!aiResult ? (
        <>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="z.B. Der Fahrer muss im VW Bus sichtbar sein, mit Haenden am Lenkrad..."
            rows={2}
            className="w-full px-2.5 py-2 rounded-lg bg-[#d4a853]/5 border border-[#d4a853]/15 text-[10px] text-white/60 placeholder:text-white/20 resize-none"
          />
          <div className="flex items-center justify-between mt-1">
            <button onClick={() => { setMode("view"); setCorrection(""); }} className="text-[9px] text-white/30 px-2 py-1 rounded hover:bg-white/5">Abbrechen</button>
            <button
              onClick={handleAiCorrection}
              disabled={loading || !correction.trim()}
              className="text-[9px] text-[#d4a853] px-3 py-1 rounded bg-[#d4a853]/10 hover:bg-[#d4a853]/20 disabled:opacity-30"
            >
              {loading ? "Generiert..." : "Vorschau generieren"}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="px-3 py-2 rounded-lg bg-[#a8d5b8]/5 border border-[#a8d5b8]/15">
            <p className="text-[9px] text-[#a8d5b8]/50 mb-1">Neue Beschreibung:</p>
            <p className="text-[10px] text-white/50">{aiResult.description}</p>
            <p className="text-[8px] text-white/20 mt-1">{aiResult.changes} · {aiResult.description.length} Zeichen</p>
          </div>
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => { setAiResult(null); }} className="text-[9px] text-white/30 px-2 py-1 rounded hover:bg-white/5">Nochmal</button>
            <button onClick={() => { setAiResult(null); setCorrection(""); setMode("view"); }} className="text-[9px] text-white/30 px-2 py-1 rounded hover:bg-white/5">Verwerfen</button>
            <button
              onClick={() => { onSave(aiResult.description); setAiResult(null); setCorrection(""); setMode("view"); toast.success("Beschreibung aktualisiert"); }}
              className="text-[9px] text-[#a8d5b8] px-3 py-1 rounded bg-[#a8d5b8]/10 hover:bg-[#a8d5b8]/20 font-medium"
            >
              Uebernehmen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CAMERA_MOTIONS = [
  { value: "", label: "Auto (AI entscheidet)" },
  { value: "static", label: "Statisch" },
  { value: "pan-left", label: "Pan Links" },
  { value: "pan-right", label: "Pan Rechts" },
  { value: "tilt-up", label: "Tilt Hoch" },
  { value: "tilt-down", label: "Tilt Runter" },
  { value: "zoom-in", label: "Zoom Rein" },
  { value: "zoom-out", label: "Zoom Raus" },
  { value: "dolly-forward", label: "Dolly Vorwaerts" },
  { value: "dolly-back", label: "Dolly Zurueck" },
  { value: "tracking", label: "Tracking (folgt Character)" },
  { value: "rotation", label: "Rotation" },
];

function SceneDetailRow({ scene, index, character, onSceneUpdate, sequenceId, projectId }: {
  scene: NonNullable<Sequence["scenes"]>[number];
  index: number;
  character?: Character;
  onSceneUpdate?: (sceneIndex: number, updates: Record<string, unknown>) => void;
  sequenceId: string;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Compact row — click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 text-[10px] px-1 py-1 hover:bg-white/5 rounded transition-all text-left"
      >
        <span className="text-white/30 w-4 text-right shrink-0 mt-0.5">{index + 1}</span>
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] mt-0.5 ${
          scene.type === "dialog" ? "bg-blue-500/15 text-blue-300" :
          scene.type === "landscape" ? "bg-green-500/15 text-green-300" :
          "bg-white/5 text-white/35"
        }`}>{scene.type}</span>
        {character && (
          <span className="text-[9px] text-white/30 shrink-0 mt-0.5">{character.emoji || ""} {character.name}</span>
        )}
        <span className="text-white/35 flex-1 truncate">{scene.sceneDescription?.slice(0, 80)}</span>
        {scene.clipTransition && scene.clipTransition !== "hard-cut" && (
          <span className="text-[9px] text-purple-400/40 shrink-0 mt-0.5">{scene.clipTransition}</span>
        )}
        {scene.cameraMotion && (
          <span className="text-[9px] text-[#C8A97E]/40 shrink-0 mt-0.5">{scene.cameraMotion}</span>
        )}
        <span className="text-white/10 text-[10px] shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-6 pl-2 border-l border-white/5 pb-2 space-y-1.5 mt-1">
          {/* Dialog text */}
          {scene.spokenText && (
            <div>
              <span className="text-[10px] text-white/35 uppercase">Dialog:</span>
              <p className="text-[11px] text-blue-300/70 italic mt-0.5">&quot;{scene.spokenText}&quot;</p>
            </div>
          )}

          {/* Scene description (editable + AI correction) */}
          <SceneDescriptionEditor
            description={scene.sceneDescription}
            sceneIndex={index}
            sequenceId={sequenceId}
            projectId={projectId}
            onSave={(newDesc) => onSceneUpdate?.(index, { sceneDescription: newDesc })}
          />

          {/* Technical details + Camera Motion */}
          <div className="flex flex-wrap gap-3 text-[9px] items-center">
            {scene.camera && (
              <span className="text-white/25">Kamera: <span className="text-white/40">{scene.camera}</span></span>
            )}
            {/* Camera Motion Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-white/25">Bewegung:</span>
              <select
                value={scene.cameraMotion || ""}
                onChange={(e) => onSceneUpdate?.(index, { cameraMotion: e.target.value || undefined })}
                className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-white/50 focus:outline-none focus:border-[#C8A97E]/30 appearance-none cursor-pointer"
              >
                {CAMERA_MOTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            {/* Clip Transition Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-white/25">Uebergang:</span>
              <select
                value={scene.clipTransition || ""}
                onChange={(e) => onSceneUpdate?.(index, { clipTransition: e.target.value || undefined })}
                className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-white/50 focus:outline-none focus:border-[#C8A97E]/30 appearance-none cursor-pointer"
              >
                <option value="">Auto</option>
                <option value="seamless">Seamless</option>
                <option value="hard-cut">Hard-Cut</option>
                <option value="fade-to-black">Fade</option>
                <option value="match-cut">Match-Cut</option>
              </select>
            </div>
            {scene.emotion && scene.emotion !== "neutral" && (
              <span className="text-white/25">Emotion: <span className="text-white/40">{scene.emotion}</span></span>
            )}
            {scene.mood && (
              <span className="text-white/25">Stimmung: <span className="text-white/40">{scene.mood?.slice(0, 40)}</span></span>
            )}
            {scene.durationHint && (
              <span className="text-white/25">Dauer: <span className="text-white/40">{scene.durationHint}s</span></span>
            )}
            {scene.audioStartMs !== undefined && scene.audioEndMs !== undefined && scene.audioEndMs > 0 && (
              <span className="text-white/25">Audio: <span className="text-white/40">{((scene.audioEndMs - scene.audioStartMs) / 1000).toFixed(1)}s</span></span>
            )}
          </div>

          {/* SFX + Ambience */}
          {scene.sfx && (
            <span className="text-[9px] text-orange-400/40">SFX: {scene.sfx}</span>
          )}
          {scene.ambience && (
            <span className="text-[9px] text-green-400/40">Ambience: {scene.ambience}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Characters Tab ─────────────────────────────────────────────────

function CharactersTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const toast = useToast();
  const [extracting, setExtracting] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addMarker, setAddMarker] = useState("");
  const [addRole, setAddRole] = useState("supporting");
  const [addEmoji, setAddEmoji] = useState("🎭");
  const [adding, setAdding] = useState(false);

  const extractCharacters = async () => {
    setExtracting(true);
    await fetch(`/api/studio/projects/${project.id}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract" }),
    });
    onUpdate(project.id);
    setExtracting(false);
  };

  const addCharacter = async () => {
    if (!addName.trim() || !addMarker.trim()) return;
    setAdding(true);
    await fetch(`/api/studio/projects/${project.id}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        character: {
          name: addName,
          markerId: `[${addMarker.toUpperCase().replace(/[\[\]]/g, "")}]`,
          role: addRole,
          emoji: addEmoji,
        },
      }),
    });
    onUpdate(project.id);
    setAdding(false);
    setShowAddForm(false);
    setAddName("");
    setAddMarker("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6]">
          Charaktere ({project.characters.length})
        </h3>
        <div className="flex gap-2">
          {project.storyText && project.characters.length === 0 && (
            <button
              onClick={extractCharacters}
              disabled={extracting}
              className="text-[10px] px-3 py-1.5 bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30 rounded-lg disabled:opacity-50"
            >
              {extracting ? "Extrahiere..." : "🔍 Aus Geschichte extrahieren"}
            </button>
          )}
          <button
            onClick={async () => {
              setSeedingDefaults(true);
              const t = toast.loading("KoalaTree-Familie wird erstellt...");
              try {
                const res = await fetch("/api/studio/actors/seed-defaults", { method: "POST" });
                const data = await res.json();
                toast.success(data.message || "Fertig!", t);
                onUpdate(project.id);
              } catch { toast.error("Fehler", t); }
              setSeedingDefaults(false);
            }}
            disabled={seedingDefaults}
            className="text-[10px] px-3 py-1.5 bg-[#a8d5b8]/15 text-[#a8d5b8] hover:bg-[#a8d5b8]/25 rounded-lg disabled:opacity-50"
          >
            {seedingDefaults ? "Erstelle..." : "🐨 KoalaTree-Familie"}
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-[10px] px-3 py-1.5 bg-white/5 text-white/40 hover:text-white/70 rounded-lg"
          >
            + Manuell
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white/5 rounded-xl p-3 mb-4 space-y-2">
          <div className="flex gap-2">
            <input
              value={addEmoji}
              onChange={(e) => setAddEmoji(e.target.value)}
              className="w-12 text-center text-lg bg-white/5 border border-white/10 rounded-lg px-1 py-1"
            />
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Name"
              className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/70 placeholder-white/20"
            />
            <input
              value={addMarker}
              onChange={(e) => setAddMarker(e.target.value)}
              placeholder="Marker (z.B. KODA)"
              className="w-32 text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/70 placeholder-white/20"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/70"
            >
              <option value="lead">Hauptrolle</option>
              <option value="supporting">Nebenrolle</option>
              <option value="narrator">Erzaehler</option>
              <option value="minor">Statistin</option>
            </select>
            <button
              onClick={addCharacter}
              disabled={adding || !addName.trim() || !addMarker.trim()}
              className="text-[10px] px-3 py-1.5 bg-[#4a7c59] text-white rounded-lg disabled:opacity-50"
            >
              {adding ? "..." : "Hinzufuegen"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-[10px] px-3 py-1.5 text-white/30 hover:text-white/50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Character Grid */}
      {project.characters.length === 0 ? (
        <div className="text-center py-6 text-white/30 text-sm">
          <p className="mb-2">Noch keine Charaktere.</p>
          <p className="text-[10px] text-white/35">
            Charaktere werden automatisch beim Drehbuch-Generieren extrahiert,
            oder du kannst sie manuell hinzufuegen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {project.characters.map((c) => (
            <CharacterCard key={c.id} character={c} projectId={project.id} onUpdate={() => onUpdate(project.id)} visualStyle={project.stylePrompt ? (VISUAL_STYLES.find((s) => s.prompt === project.stylePrompt)?.id || "realistic") : "realistic"} />
          ))}
        </div>
      )}

      {/* Workflow hint */}
      {project.characters.length > 0 && project.characters.some((c) => !c.actorId) && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/15">
          <p className="text-[10px] text-purple-300/70">
            Naechster Schritt: Actors aus der Library casten, dann Drehbuch generieren.
            Actor-Outfit und Traits fliessen automatisch in die Szenen-Beschreibungen ein.
          </p>
        </div>
      )}
      {project.characters.length > 0 && project.characters.every((c) => c.actorId) && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/15">
          <p className="text-[10px] text-green-400/70">
            Alle Charaktere gecastet. Weiter zum Tab &quot;Drehbuch&quot; um das Drehbuch zu generieren.
          </p>
        </div>
      )}

      {/* Re-extract option */}
      {project.characters.length > 0 && project.storyText && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            onClick={extractCharacters}
            disabled={extracting}
            className="text-[10px] text-white/35 hover:text-white/40 disabled:opacity-50"
          >
            {extracting ? "Extrahiere..." : "Alle Charaktere neu extrahieren"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Storyboard Tab ────────────────────────────────────────────────

function StoryboardTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const [generatingScene, setGeneratingScene] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const toast = useToast();

  const blobProxy = (url: string) =>
    url.includes(".blob.vercel-storage.com")
      ? `/api/studio/blob?url=${encodeURIComponent(url)}`
      : url;

  const allScenes = project.sequences.flatMap((seq) =>
    (seq.scenes || []).map((scene, i) => ({ seq, scene, sceneIndex: i })),
  );

  const totalFrames = allScenes.length;
  const generatedFrames = allScenes.filter((s) => s.scene.storyboardImageUrl).length;
  const approvedFrames = allScenes.filter((s) => s.scene.storyboardApproved).length;

  const generateFrame = async (seqId: string, sceneIndex: number, prompt?: string) => {
    const key = `${seqId}-${sceneIndex}`;
    setGeneratingScene(key);
    const tid = toast.loading(`Storyboard Frame ${sceneIndex + 1}...`);
    try {
      const res = await fetch(`/api/studio/projects/${project.id}/sequences/${seqId}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIndex, prompt: prompt || undefined }),
      });
      if (res.ok) {
        toast.success(`Frame ${sceneIndex + 1} generiert`, tid);
        onUpdate(project.id);
      } else {
        toast.error(`Frame ${sceneIndex + 1} fehlgeschlagen`, tid);
      }
    } catch { toast.error("Netzwerkfehler", tid); }
    setGeneratingScene(null);
    setEditingPrompt(null);
    setCustomPrompt("");
  };

  const generateAllFrames = async () => {
    setGeneratingAll(true);
    // Generate ONE frame at a time with chain (each frame knows the previous)
    const allFrames = project.sequences.flatMap((seq) =>
      (seq.scenes || []).map((scene, i) => ({ seqId: seq.id, seqName: seq.name, sceneIndex: i, approved: scene.storyboardApproved })),
    );
    const unapproved = allFrames.filter((f) => !f.approved);
    const total = allFrames.length;
    const skipped = allFrames.length - unapproved.length;
    const tid = toast.loading(`Storyboard: 0/${total} Frames${skipped > 0 ? ` (${skipped} genehmigt, uebersprungen)` : ""}...`);
    let done = 0;
    let failed = 0;

    for (const { seqId, seqName, sceneIndex, approved } of allFrames) {
      // Skip approved frames (but API still loads them for chain continuity)
      if (approved) {
        done++;
        toast.update(tid, `Storyboard: ${done}/${total} — ${seqName} Szene ${sceneIndex + 1} (genehmigt)`);
        continue;
      }
      toast.update(tid, `Storyboard: ${done}/${total} — ${seqName}, Szene ${sceneIndex + 1}...`);
      try {
        const res = await fetch(`/api/studio/projects/${project.id}/sequences/${seqId}/storyboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneIndex, generateAll: true }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.imageUrl) {
            done++;
            // Refresh UI to show the new frame immediately
            onUpdate(project.id);
          } else {
            failed++;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`[Storyboard] Frame failed (${seqName} scene ${sceneIndex}):`, errData);
          failed++;
        }
      } catch (err) {
        console.error(`[Storyboard] Network error:`, err);
        failed++;
      }
    }

    if (done > 0 && failed === 0) {
      toast.success(`${done} Storyboard-Frames generiert!`, tid);
    } else if (done > 0) {
      toast.success(`${done}/${total} Frames generiert, ${failed} fehlgeschlagen`, tid);
    } else {
      toast.error(`Keine Frames generiert (${failed} fehlgeschlagen)`, tid);
    }
    onUpdate(project.id);
    setGeneratingAll(false);
  };

  const approveFrame = async (seqId: string, sceneIndex: number, approved: boolean) => {
    try {
      await fetch(`/api/studio/projects/${project.id}/sequences/${seqId}/storyboard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIndex, approved }),
      });
      toast.info(approved ? "Frame genehmigt" : "Genehmigung zurueckgenommen");
      onUpdate(project.id);
    } catch (e) { console.warn("[Studio]", e); }
  };

  if (project.sequences.length === 0 || allScenes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-white/30 text-sm">Erst Drehbuch generieren, dann Storyboard erstellen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#f5eed6]">Visuelles Storyboard</h3>
          <p className="text-[10px] text-white/30 mt-0.5">
            {generatedFrames}/{totalFrames} Frames generiert, {approvedFrames} genehmigt
          </p>
        </div>
        <button
          onClick={generateAllFrames}
          disabled={generatingAll || generatingScene !== null}
          className="px-4 py-2 rounded-lg bg-[#3d6b4a]/30 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 disabled:opacity-30 transition-all"
        >
          {generatingAll ? "Generiert alle..." : "Alle Frames generieren"}
        </button>
        {generatedFrames > 0 && approvedFrames < generatedFrames && (
          <button
            onClick={async () => {
              for (const seq of project.sequences) {
                const scenes = seq.scenes || [];
                for (let i = 0; i < scenes.length; i++) {
                  if (scenes[i].storyboardImageUrl && !scenes[i].storyboardApproved) {
                    await fetch(`/api/studio/projects/${project.id}/sequences/${seq.id}/storyboard`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sceneIndex: i, approved: true }),
                    });
                  }
                }
              }
              toast.info(`${generatedFrames - approvedFrames} Frames genehmigt`);
              onUpdate(project.id);
            }}
            className="px-4 py-2 rounded-lg bg-green-500/15 text-green-300/70 text-xs font-medium hover:bg-green-500/25 transition-all"
          >
            Alle genehmigen
          </button>
        )}
      </div>

      <p className="text-[10px] text-white/35">
        Generiere Storyboard-Frames um jede Szene VOR der Clip-Generierung zu sehen. ~$0.02 pro Frame.
      </p>

      {/* Sequence groups */}
      {project.sequences.map((seq) => {
        const scenes = seq.scenes || [];
        if (scenes.length === 0) return null;

        return (
          <div key={seq.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-medium text-[#d4a853]">{seq.name}</h4>
              {seq.location && <span className="text-[10px] text-white/35">{seq.location}</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {scenes.map((scene, i) => {
                const key = `${seq.id}-${i}`;
                const isGenerating = generatingScene === key || generatingAll;
                const isEditing = editingPrompt === key;

                return (
                  <div
                    key={key}
                    className={`bg-white/[0.03] border rounded-xl overflow-hidden transition-all ${
                      scene.storyboardApproved
                        ? "border-green-500/30"
                        : scene.storyboardImageUrl
                        ? "border-[#d4a853]/20"
                        : "border-white/5"
                    }`}
                  >
                    {/* Image or placeholder */}
                    {scene.storyboardImageUrl ? (
                      <div className="relative cursor-pointer" onClick={() => setFullscreenImage(blobProxy(scene.storyboardImageUrl!))}>
                        <img
                          src={blobProxy(scene.storyboardImageUrl)}
                          alt={`Szene ${i + 1}`}
                          className="w-full h-32 object-cover hover:opacity-90 transition-opacity"
                          loading="lazy"
                        />
                        {scene.storyboardApproved && (
                          <div className="absolute top-1 right-1 bg-green-500/80 text-white text-[10px] px-1.5 py-0.5 rounded">
                            OK
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-32 bg-white/[0.02] flex items-center justify-center">
                        {isGenerating ? (
                          <div className="w-5 h-5 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="text-white/10 text-2xl">🖼️</span>
                        )}
                      </div>
                    )}

                    {/* Info */}
                    <div className="p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-white/40 font-medium">Szene {i + 1}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          scene.type === "dialog" ? "bg-blue-500/10 text-blue-300/50" : "bg-green-500/10 text-green-300/50"
                        }`}>
                          {scene.type === "dialog" ? "Dialog" : "Szene"}
                        </span>
                      </div>

                      <p className="text-[10px] text-white/35 line-clamp-2">
                        {scene.sceneDescription?.slice(0, 80) || scene.spokenText?.slice(0, 60)}
                      </p>

                      {scene.camera && (
                        <span className="text-[9px] text-purple-300/30">{scene.camera}</span>
                      )}

                      {/* Custom prompt editing */}
                      {isEditing && (
                        <div className="space-y-1">
                          <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Eigener Prompt fuer diesen Frame..."
                            rows={2}
                            className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] text-white/60 placeholder:text-white/30 resize-none focus:outline-none focus:border-[#d4a853]/30"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => generateFrame(seq.id, i, customPrompt || undefined)}
                              disabled={isGenerating}
                              className="text-[10px] px-2 py-1 rounded bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30 disabled:opacity-30"
                            >
                              Generieren
                            </button>
                            <button
                              onClick={() => { setEditingPrompt(null); setCustomPrompt(""); }}
                              className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/30"
                            >
                              X
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {!isEditing && (
                        <div className="flex gap-1 pt-1">
                          {!scene.storyboardImageUrl ? (
                            <button
                              onClick={() => generateFrame(seq.id, i)}
                              disabled={isGenerating}
                              className="flex-1 text-[10px] py-1 rounded bg-[#3d6b4a]/20 text-[#a8d5b8]/60 hover:text-[#a8d5b8] hover:bg-[#3d6b4a]/30 disabled:opacity-30 transition-all"
                            >
                              {isGenerating ? "..." : "Generieren"}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => approveFrame(seq.id, i, !scene.storyboardApproved)}
                                className={`flex-1 text-[10px] py-1 rounded transition-all ${
                                  scene.storyboardApproved
                                    ? "bg-green-500/20 text-green-300/60 hover:bg-red-500/10 hover:text-red-300/50"
                                    : "bg-green-500/10 text-green-300/40 hover:bg-green-500/20 hover:text-green-300/60"
                                }`}
                              >
                                {scene.storyboardApproved ? "OK" : "Genehmigen"}
                              </button>
                              <button
                                onClick={() => { setEditingPrompt(key); setCustomPrompt(scene.storyboardPrompt || ""); }}
                                className="text-[10px] py-1 px-2 rounded bg-white/5 text-white/25 hover:text-white/40 transition-all"
                              >
                                Neu generieren
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Fullscreen Image Viewer — via Portal (no flicker) */}
      {fullscreenImage && (
        <ImageLightbox src={fullscreenImage} alt="Storyboard" onClose={() => setFullscreenImage(null)} />
      )}
    </div>
  );
}

// ── Production Tab ─────────────────────────────────────────────────

function ProductionTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const [assembling, setAssembling] = useState(false);
  const [assembleProgress, setAssembleProgress] = useState("");
  const [assembleError, setAssembleError] = useState("");
  const [filmUrl, setFilmUrl] = useState("");
  const toast = useToast();

  // Music state
  const [musicAssets, setMusicAssets] = useState<Array<{ id: string; name?: string; blobUrl: string; durationSec?: number }>>([]);
  const [selectedMusicUrl, setSelectedMusicUrl] = useState<string>("");
  const [musicVolume, setMusicVolume] = useState(8); // 0-100 (default 8%)
  const [musicLoaded, setMusicLoaded] = useState(false);

  // Credits state
  const [showCreditsEditor, setShowCreditsEditor] = useState(false);
  const [creditsText, setCreditsText] = useState(`Regie\n${project.name}\nGeschichte\nKoalaTree Studio\nMusik\nKoalaTree AI`);

  // Export format override
  const [exportFormat, setExportFormat] = useState<string>(project.format || "portrait");

  // Single task poll for ALL sequences (instead of per-sequence polling)
  const [allTasks, setAllTasks] = useState<Record<string, Record<number, { status: string; progress?: string }>>>({});
  const prevTaskCountRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/studio/tasks?projectId=${project.id}&type=clip&status=pending,running&limit=50`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const bySeq: Record<string, Record<number, { status: string; progress?: string }>> = {};
        for (const t of data.tasks || []) {
          const inp = t.input as { sequenceId?: string; sceneIndex?: number };
          if (inp.sequenceId && inp.sceneIndex !== undefined) {
            if (!bySeq[inp.sequenceId]) bySeq[inp.sequenceId] = {};
            bySeq[inp.sequenceId][inp.sceneIndex] = { status: t.status, progress: t.progress || undefined };
          }
        }
        const totalTasks = Object.values(bySeq).reduce((sum, m) => sum + Object.keys(m).length, 0);
        if (prevTaskCountRef.current > 0 && totalTasks < prevTaskCountRef.current) {
          onUpdate(project.id); // Tasks completed — refresh
        }
        prevTaskCountRef.current = totalTasks;
        if (!cancelled) setAllTasks(bySeq);
      } catch (e) { console.warn("[Studio] Task poll:", e); }
    };
    poll();
    const iv = setInterval(poll, 8000); // 8s instead of 4s — less pressure
    return () => { cancelled = true; clearInterval(iv); };
  }, [project.id, onUpdate]);

  // Load music assets from Library
  useEffect(() => {
    if (musicLoaded) return;
    fetch("/api/studio/assets?type=sound&category=music")
      .then((r) => r.json())
      .then((d) => {
        const assets = (d.assets || []).map((a: any) => ({
          id: a.id,
          name: a.name || a.category || "Musik",
          blobUrl: a.blobUrl,
          durationSec: a.durationSec,
        }));
        setMusicAssets(assets);
        setMusicLoaded(true);
      })
      .catch(() => setMusicLoaded(true));
  }, [musicLoaded]);

  const blobProxy = (url: string) =>
    url.includes(".blob.vercel-storage.com")
      ? `/api/studio/blob?url=${encodeURIComponent(url)}`
      : url;

  const totalSequences = project.sequences.length;
  const audioCount = project.sequences.filter((s) => ["audio", "clips", "mastered"].includes(s.status)).length;
  const clipsCount = project.sequences.filter((s) => ["clips", "mastered"].includes(s.status)).length;
  const allClipsDone = clipsCount === totalSequences && totalSequences > 0;

  const assembleFilm = async () => {
    setAssembling(true);
    setAssembleProgress("Starte Assembly...");
    setAssembleError("");
    setFilmUrl("");
    const tid = toast.loading("Film wird gerendert...");

    try {
      const res = await fetch(`/api/studio/projects/${project.id}/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: exportFormat || project.format || "portrait",
          force: true,
          musicUrl: selectedMusicUrl || undefined,
          musicVolume: selectedMusicUrl ? musicVolume / 100 : undefined,
          credits: showCreditsEditor ? creditsText.split("\n").filter((l) => l.trim()) : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setAssembleError(errData.error || `Fehler ${res.status}`);
        toast.error(errData.error || "Render fehlgeschlagen", tid);
        setAssembling(false);
        return;
      }

      // Check if it returned a cached result (JSON, not SSE)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.videoUrl) {
          setFilmUrl(data.videoUrl);
          onUpdate(project.id);
          setAssembling(false);
          return;
        }
      }

      await consumeSSE(res, {
        onProgress: (msg) => { setAssembleProgress(msg); toast.update(tid, msg); },
        onError: (err) => { setAssembleError(err); toast.error(err, tid); },
        onDone: () => { toast.success("Film gerendert!", tid); onUpdate(project.id); },
      });

      // Check if film was generated even if connection dropped
      try {
        const checkRes = await fetch(`/api/studio/projects/${project.id}`);
        const checkData = await checkRes.json();
        if (checkData.project?.videoUrl) {
          setFilmUrl(checkData.project.videoUrl);
          onUpdate(project.id);
        }
      } catch (e) { console.warn("[Studio]", e); }
    } catch (err) {
      const msg = (err as Error).message || "Render fehlgeschlagen";
      setAssembleError(msg);
      toast.error(msg, tid);
    }

    setAssembling(false);
    setAssembleProgress("");
  };

  if (totalSequences === 0) {
    return (
      <div className="text-center py-6 text-white/30 text-sm">
        <p>Zuerst ein Drehbuch generieren (Tab &apos;Drehbuch&apos;).</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6]">Produktion</h3>
        <div className="text-[10px] text-white/30">
          Audio: {audioCount}/{totalSequences} · Clips: {clipsCount}/{totalSequences}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#a8d5b8] rounded-full transition-all"
            style={{ width: `${(clipsCount / totalSequences) * 100}%` }}
          />
        </div>
      </div>

      {/* Film Preview — play all clips across all sequences */}
      <FilmPreviewPlayer sequences={project.sequences} />

      {/* Film-Timeline Overview */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4">
        {project.sequences
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((seq, i) => {
            const totalDur = (seq.scenes || []).reduce((sum, s) => sum + (s.durationHint || 5), 0);
            const status = seq.status;
            const isDone = status === "clips" || status === "mastered";
            return (
              <div key={seq.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-white/15 text-[10px]">{"\u2192"}</span>}
                <div className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] cursor-pointer border transition-all ${
                  isDone ? "bg-green-500/10 border-green-500/20 text-green-300/70"
                  : status === "audio" ? "bg-blue-500/10 border-blue-500/20 text-blue-300/70"
                  : "bg-white/5 border-white/10 text-white/30"
                }`}>
                  <div className="font-medium truncate max-w-[120px]">{seq.name}</div>
                  <div className="text-[8px] opacity-60">{totalDur}s</div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Sequence Cards with Transitions */}
      <div className="space-y-0">
        {project.sequences
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((seq, i, sortedSeqs) => (
            <div key={seq.id}>
              {/* Transition between sequences */}
              {i > 0 && (
                <div className="py-1">
                  <TransitionConnector
                    transition={seq.scenes?.[0]?.clipTransition || "hard-cut"}
                    startImageOverride={seq.scenes?.[0]?.startImageOverride}
                    onChange={async (transition) => {
                      // Update the FIRST scene of this sequence
                      const updatedScenes = [...(seq.scenes || [])];
                      if (updatedScenes.length > 0) {
                        updatedScenes[0] = { ...updatedScenes[0], clipTransition: transition };
                        await fetch(`/api/studio/projects/${project.id}/sequences/${seq.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ scenes: updatedScenes }),
                        });
                        const labels: Record<string, string> = { seamless: "Nahtlos", "hard-cut": "Harter Schnitt", "fade-to-black": "Schwarzblende", "match-cut": "Kamera-Schnitt" };
                        toast.info(`Sequenz-Übergang: ${labels[transition] || transition}`);
                        onUpdate(project.id);
                      }
                    }}
                    onStartImageChange={async (override) => {
                      const updatedScenes = [...(seq.scenes || [])];
                      if (updatedScenes.length > 0) {
                        updatedScenes[0] = { ...updatedScenes[0], startImageOverride: override };
                        await fetch(`/api/studio/projects/${project.id}/sequences/${seq.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ scenes: updatedScenes }),
                        });
                        toast.info(`Startbild: ${override.type === "portrait" ? "Actor Portrait" : "Location"}`);
                        onUpdate(project.id);
                      }
                    }}
                  />
                </div>
              )}
              <SequenceCard
                sequence={seq}
                index={i}
                projectId={project.id}
                projectStyle={project.stylePrompt}
                hasActorsCast={project.characters?.some((c: Character) => c.actorId) || false}
                onUpdate={() => onUpdate(project.id)}
                musicUrl={selectedMusicUrl || undefined}
                musicVolume={selectedMusicUrl ? musicVolume / 100 : undefined}
                isFirstSequence={i === 0}
                isLastSequence={i === sortedSeqs.length - 1}
                tasksByScene={allTasks[seq.id] || {}}
              />
            </div>
          ))}
      </div>

      {/* Film Assembly */}
      {allClipsDone && (
        <div className="mt-5 pt-4 border-t border-[#a8d5b8]/20 bg-[#a8d5b8]/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-[#a8d5b8]">{"\uD83C\uDFAC"} Film zusammenfuegen</h4>
            {project.status === "completed" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#a8d5b8]/20 text-[#a8d5b8]">
                Fertig
              </span>
            )}
          </div>

          {/* Export Format Presets */}
          <div className="mb-3">
            <span className="text-[10px] text-white/30 block mb-1.5">Format / Export:</span>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: "portrait", label: "Portrait 9:16", desc: "TikTok, Reels, Shorts" },
                { id: "wide", label: "Wide 16:9", desc: "YouTube, Desktop" },
                { id: "cinema", label: "Cinema 2.39:1", desc: "Kino-Look" },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setExportFormat(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] transition-all ${
                    exportFormat === f.id
                      ? "bg-[#a8d5b8]/20 text-[#a8d5b8] border border-[#a8d5b8]/30"
                      : "bg-white/5 text-white/30 border border-transparent hover:text-white/50"
                  }`}
                >
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-[9px] opacity-50 mt-0.5">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Music Selection */}
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30">Hintergrundmusik:</span>
              <select
                value={selectedMusicUrl}
                onChange={(e) => setSelectedMusicUrl(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/60 focus:outline-none focus:border-[#a8d5b8]/30 appearance-none cursor-pointer"
              >
                <option value="">Keine Musik</option>
                {musicAssets.map((m) => (
                  <option key={m.id} value={m.blobUrl}>
                    {m.name}{m.durationSec ? ` (${Math.round(m.durationSec)}s)` : ""}
                  </option>
                ))}
              </select>
              {musicAssets.length === 0 && musicLoaded && (
                <a href="/studio/library" className="text-[9px] text-[#d4a853]/60 hover:text-[#d4a853] whitespace-nowrap">
                  + In Library hochladen
                </a>
              )}
            </div>

            {/* Music preview + volume */}
            {selectedMusicUrl && (
              <div className="flex items-center gap-3">
                <audio
                  src={blobProxy(selectedMusicUrl)}
                  controls
                  className="h-7 flex-1 opacity-60"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] text-white/25">Vol:</span>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="w-20 h-1 accent-[#a8d5b8]"
                  />
                  <span className="text-[9px] text-white/30 w-8">{musicVolume}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Credits Editor */}
          <div className="mb-3">
            <button
              onClick={() => setShowCreditsEditor(!showCreditsEditor)}
              className="text-[10px] text-white/30 hover:text-white/50 transition-all"
            >
              {showCreditsEditor ? "Credits ausblenden" : "+ Credits / Abspann hinzufuegen"}
            </button>
            {showCreditsEditor && (
              <div className="mt-2">
                <p className="text-[10px] text-white/35 mb-1">Jede Zeile abwechselnd: Rolle (klein) → Name (gross)</p>
                <textarea
                  value={creditsText}
                  onChange={(e) => setCreditsText(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/60 placeholder:text-white/30 focus:outline-none focus:border-[#a8d5b8]/30 resize-none font-mono"
                  placeholder={"Regie\nDein Name\nMusik\nAI Generated"}
                />
              </div>
            )}
          </div>

          {!assembling ? (
            <div className="flex gap-2">
              <button
                onClick={assembleFilm}
                className="px-4 py-2 rounded-xl bg-[#a8d5b8] text-black text-xs font-medium hover:bg-[#b8e5c8]"
              >
                Film rendern{selectedMusicUrl ? " (mit Musik)" : ""}{showCreditsEditor ? " + Credits" : ""}
              </button>
              {project.status === "completed" && (
                <button
                  onClick={assembleFilm}
                  className="px-4 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:text-white/60"
                >
                  Neu rendern
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-[#a8d5b8] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-white/50">{assembleProgress}</span>
            </div>
          )}

          {assembleError && (
            <div className="mt-2 text-[10px] text-red-300 bg-red-500/10 rounded-lg px-2.5 py-1.5">
              {assembleError}
            </div>
          )}

          {(project.videoUrl || filmUrl) && (
            <div className="mt-3">
              <video src={project.videoUrl || filmUrl} controls playsInline className="w-full rounded-xl max-h-[400px]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Landscape Section (within SequenceCard) ────────────────────────

function LandscapeSection({ sequence, projectId, onUpdate }: { sequence: Sequence; projectId: string; onUpdate: () => void }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const toast = useToast();

  const selectFromLibrary = async (blobUrl: string) => {
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}/landscape`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landscapeRefUrl: blobUrl }),
      });
      setShowLibrary(false);
      toast.info("Location zugewiesen");
      onUpdate();
    } catch (e) { console.warn("[Studio]", e); }
  };

  return (
    <div>
      <p className="text-[9px] text-white/25 mb-1.5">Location / Hintergrund</p>
      {sequence.landscapeRefUrl ? (
        <>
          <div className="relative group cursor-pointer" onClick={() => setFullscreen(true)}>
            <img
              src={portraitSrc(sequence.landscapeRefUrl)}
              alt="Landscape"
              className="w-full h-28 object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); setShowLibrary(true); }} className="text-[10px] px-3 py-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30">
                Aendern
              </button>
            </div>
          </div>
          {/* Fullscreen — via Portal (no flicker) */}
          {fullscreen && (
            <ImageLightbox src={portraitSrc(sequence.landscapeRefUrl)!} alt="Location" onClose={() => setFullscreen(false)} />
          )}
        </>
      ) : (
        <button
          onClick={() => setShowLibrary(true)}
          className="text-[11px] px-4 py-2 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30 font-medium transition-all"
        >
          {"\uD83C\uDFDE\uFE0F"} Landscape waehlen
        </button>
      )}
      {/* Library Picker Modal */}
      {showLibrary && (
        <LibraryPicker
          type="landscape"
          blobProxy={(url) => url.includes(".blob.vercel-storage.com") ? `/api/studio/blob?url=${encodeURIComponent(url)}` : url}
          onSelect={async (item) => {
            if (item.blobUrl) {
              await selectFromLibrary(item.blobUrl);
            }
            setShowLibrary(false);
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}

    </div>
  );
}

// ── Sequence Preview Player ────────────────────────────────────────

function FilmPreviewPlayer({ sequences }: { sequences: Sequence[] }) {
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Collect all active clips from all sequences in order
  const allClips: { videoUrl: string; seqName: string; sceneIdx: number }[] = [];
  for (const seq of sequences.sort((a, b) => a.orderIndex - b.orderIndex)) {
    for (const [si, s] of (seq.scenes || []).entries()) {
      if (s.status === "done" && s.videoUrl) {
        allClips.push({ videoUrl: s.videoUrl, seqName: seq.name, sceneIdx: si });
      }
    }
  }

  if (allClips.length < 1) return null;

  const current = allClips[currentIdx];
  const clipUrl = current?.videoUrl
    ? `/api/studio/blob?url=${encodeURIComponent(current.videoUrl)}`
    : "";

  const handleEnded = () => {
    if (currentIdx < allClips.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setPlaying(false);
      setCurrentIdx(0);
    }
  };

  useEffect(() => {
    if (playing && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentIdx, playing]);

  if (!playing) {
    return (
      <button
        onClick={() => { setPlaying(true); setCurrentIdx(0); }}
        className="w-full text-center text-[10px] py-2 bg-[#d4a853]/10 text-[#d4a853]/60 rounded-lg hover:text-[#d4a853] hover:bg-[#d4a853]/20 transition-all mb-3 font-medium"
      >
        {"\u25B6"} Film-Vorschau ({allClips.length} Clips, ohne Ton)
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-xl overflow-hidden bg-black relative">
      <video
        ref={videoRef}
        key={currentIdx}
        src={clipUrl}
        autoPlay
        muted
        onEnded={handleEnded}
        className="w-full aspect-video"
        playsInline
      />
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
        <span className="text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded font-medium">
          {current?.seqName}
        </span>
        <span className="text-[9px] text-white/50 bg-black/60 px-1.5 py-0.5 rounded">
          Clip {currentIdx + 1}/{allClips.length}
        </span>
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#d4a853] transition-all"
            style={{ width: `${((currentIdx + 1) / allClips.length) * 100}%` }}
          />
        </div>
        <button
          onClick={() => { setPlaying(false); setCurrentIdx(0); }}
          className="text-[10px] text-white/40 bg-black/60 px-1.5 py-0.5 rounded hover:text-white/70"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Sequence Card (within Production Tab) ──────────────────────────

function SequenceCard({
  sequence,
  index,
  projectId,
  projectStyle,
  hasActorsCast,
  onUpdate,
  musicUrl,
  musicVolume,
  isFirstSequence,
  isLastSequence,
  tasksByScene,
}: {
  sequence: Sequence;
  index: number;
  projectId: string;
  projectStyle?: string;
  hasActorsCast: boolean;
  onUpdate: () => void;
  musicUrl?: string;
  musicVolume?: number;
  isFirstSequence?: boolean;
  isLastSequence?: boolean;
  tasksByScene: Record<number, { status: string; progress?: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clipGenerating = false; // Clips are now background tasks — never blocks UI
  const sceneTasks = tasksByScene; // From parent's single poll — no per-card polling!

  const moveSequence = async (direction: "up" | "down") => {
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      toast.info(`Sequenz ${direction === "up" ? "nach oben" : "nach unten"} verschoben`);
      onUpdate();
    } catch { toast.error("Verschieben fehlgeschlagen"); }
  };

  const deleteSequence = async () => {
    const tid = toast.loading("Sequenz wird geloescht...");
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Loeschen fehlgeschlagen", tid); return; }
      toast.success(`Sequenz "${sequence.name}" geloescht`, tid);
      setConfirmDelete(false);
      onUpdate();
    } catch { toast.error("Netzwerkfehler", tid); }
  };
  // clipQuality is fixed to "standard" — the premium tier used to map to
  // Kling Pro, but since 2026-04 dialog clips use Seedance 2.0 and landscape
  // clips use Kling O3 Standard regardless of this flag. Kept as a constant
  // because the POST body + task tracker still read it (priority hint only).
  const clipQuality: "standard" | "premium" = "standard";
  // 2026-04-18: videoProvider wird NICHT mehr im POST-Body gesetzt.
  // Vorher war es hardcoded auf "kling" und hat die serverseitige
  // CLIP_PROVIDER_DEFAULT-Logik (Wan 2.7) ueberschrieben. Jetzt entscheidet
  // der Cron ueber den Provider — manueller Override waere via neuem
  // UI-Toggle einzubauen falls benoetigt.
  // Use project style as default — no need to ask again
  const defaultStyleId = projectStyle ? (VISUAL_STYLES.find((s) => s.prompt === projectStyle)?.id || "custom") : "disney-2d";
  const [visualStyle, setVisualStyle] = useState(defaultStyleId);
  const [customStylePrompt, setCustomStylePrompt] = useState(projectStyle || "");
  const resolvedStyle = visualStyle === "custom"
    ? customStylePrompt
    : VISUAL_STYLES.find((s) => s.id === visualStyle)?.prompt || projectStyle || "";
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const toast = useToast();

  // Cost estimation — post-2026-04 provider split
  const sceneCount = sequence.sceneCount || sequence.scenes?.length || 0;
  const dialogScenes = sequence.scenes?.filter((s) => s.type === "dialog").length || Math.ceil(sceneCount * 0.6);
  const landscapeScenes = sceneCount - dialogScenes;
  // Dialog    → Seedance 2.0 Ref-to-Video (measured ~$0.102/s × ~5s = ~$0.51)
  // Landscape → Kling O3 Standard         ($0.084/s × ~5s = ~$0.42)
  // Real cost is very close to the old Kling+LipSync combo (~$0.50) —
  // fal.ai appears to price Seedance similar to Kling Standard internally.
  const estimatedCost = dialogScenes * 0.51 + landscapeScenes * 0.42;

  // Task tracking is now server-side (each route creates its own StudioTask)

  const generateAudio = async () => {
    setAudioGenerating(true);
    setProgress("Starte Audio...");
    setError("");
    const tid = toast.loading("Audio wird generiert...");

    const scenes = sequence.scenes || [];
    let totalDurationMs = 0;
    let dialogsDone = 0;
    const totalDialogs = scenes.filter((s) => s.spokenText && s.characterId).length;
    const hasSfx = scenes.some((s) => s.sfx);

    try {
      if (totalDialogs === 0 && !hasSfx) {
        // No dialogs and no SFX — just generate ambience and mark as done
        toast.update(tid, "Keine Dialoge — generiere nur Ambience...");
      }

      // Generate each scene individually (avoids Vercel timeout)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const needsDialog = !!scene.spokenText; // Any scene with text needs audio (characterId fallback in API)
        const needsSfx = scene.sfx;

        if (!needsDialog && !needsSfx) {
          console.log(`[Audio] Scene ${i + 1} skipped: type=${scene.type}, hasText=${!!scene.spokenText}, charId=${scene.characterId || "none"}`);
          continue;
        }
        console.log(`[Audio] Scene ${i + 1} processing: type=${scene.type}, charId=${scene.characterId || "fallback"}, text="${scene.spokenText?.slice(0, 40)}..."`);

        if (needsDialog) {
          dialogsDone++;
          setProgress(`Dialog ${dialogsDone}/${totalDialogs}: Szene ${i + 1}...`);
          toast.update(tid, `Dialog ${dialogsDone}/${totalDialogs}: Szene ${i + 1}...`);
        } else {
          setProgress(`SFX: Szene ${i + 1}...`);
          toast.update(tid, `SFX: Szene ${i + 1}...`);
        }

        const res = await fetch(
          `/api/studio/projects/${projectId}/sequences/${sequence.id}/audio-scene`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sceneIndex: i, totalDurationMs }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          const errMsg = data.error || `HTTP ${res.status}`;
          console.error(`[Audio] Scene ${i + 1} FAILED:`, errMsg, `text="${scene.spokenText?.slice(0, 50)}"`);
          toast.error(`Szene ${i + 1}: ${errMsg}`);
          setError(`Szene ${i + 1}: ${errMsg}`);
          // Don't stop — try remaining scenes
          continue;
        }

        if (data.dialogDurationMs) {
          totalDurationMs = data.newTotalDurationMs || (totalDurationMs + data.dialogDurationMs);
          setProgress(`Dialog ${dialogsDone}/${totalDialogs} OK`);
        }
      }

      // Generate ambience
      setProgress("Generiere Ambience...");
      try {
        const ambRes = await fetch(
          `/api/studio/projects/${projectId}/sequences/${sequence.id}/audio-ambience`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        if (!ambRes.ok) {
          const ambData = await ambRes.json();
          console.warn("[Audio] Ambience failed:", ambData.error);
        }
      } catch (e) { console.warn("[Studio] Ambience:", e); }

      // Update SEQUENCE status to "audio"
      try {
        await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "audio" }),
        });
      } catch (e) { console.warn("[Studio]", e); }

      // Validate: check if any dialog scenes were skipped
      const missedDialogs = scenes.filter((s, i) => s.spokenText && !s.dialogAudioUrl && s.type === "dialog");
      if (missedDialogs.length > 0) {
        console.warn(`[Audio] ${missedDialogs.length} dialog scenes have spokenText but no audio!`, missedDialogs.map((s) => ({ type: s.type, charId: s.characterId, text: s.spokenText?.slice(0, 50) })));
      }

      // Re-fetch to get updated scene data with audio URLs
      onUpdate();

      const msg = dialogsDone > 0
        ? `${dialogsDone} Dialoge + Ambience${missedDialogs.length > 0 ? ` (${missedDialogs.length} fehlen!)` : ""}`
        : "Ambience generiert (keine Dialoge)";
      setProgress(msg);
      if (missedDialogs.length > 0) toast.error(`${missedDialogs.length} Dialoge fehlen! Prüfe die Szenen.`, tid);
      else toast.success(msg, tid);
      onUpdate();
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message, tid);
    }

    setAudioGenerating(false);
    setProgress("");
  };

  // Check if previous clip used a different provider (continuity warning)
  const generateSingleClip = async (sceneIndex: number, opts?: { directorNote?: string; cameraOverride?: string; durationOverride?: number }) => {
    setError("");
    const tid = toast.loading(`Clip ${sceneIndex + 1} wird in Warteschlange gestellt...`);

    try {
      const res = await fetch(
        `/api/studio/projects/${projectId}/sequences/${sequence.id}/clips`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneIndex, quality: clipQuality, stylePrompt: resolvedStyle, force: true,
            directorNote: opts?.directorNote,
            cameraOverride: opts?.cameraOverride,
            durationOverride: opts?.durationOverride,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Fehler", tid); return; }
      if (data.cached) { toast.success("Clip bereits vorhanden", tid); return; }
      toast.success(opts?.directorNote ? "Clip mit Regie-Anweisung in Warteschlange" : "Clip in Warteschlange", tid);
    } catch (err) {
      toast.error(`Clip ${sceneIndex + 1}: ${(err as Error).message}`, tid);
    }
  };

  const hasExistingClips = sequence.scenes?.some((s) => s.status === "done" && s.videoUrl);
  const generateAllClipsTracked = async () => {
    setError("");
    const total = sceneCount;
    const tid = toast.loading(`${total} Clips werden in Warteschlange gestellt...`);
    let queued = 0;

    for (let i = 0; i < total; i++) {
      try {
        const res = await fetch(
          `/api/studio/projects/${projectId}/sequences/${sequence.id}/clips`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sceneIndex: i, quality: clipQuality, stylePrompt: resolvedStyle, force: true }),
          },
        );
        const data = await res.json();
        if (res.ok && !data.cached) queued++;
      } catch (err) {
        toast.error(`Clip ${i + 1}: ${(err as Error).message}`, tid);
        break;
      }
    }

    if (queued > 0) toast.success(`${queued} Clips in Warteschlange`, tid);
    else { toast.dismiss(tid); toast.info("Alle Clips bereits vorhanden"); }
  };

  const isGenerating = audioGenerating || clipGenerating;
  const canGenerateAudio = true; // Always allow re-generation
  const canGenerateClips = sequence.status !== "storyboard" && sequence.status !== "draft"; // Needs audio first

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-white/35 w-5 text-right">{index + 1}</span>
          <div>
            <p className="text-xs font-medium text-[#f5eed6]">{sequence.name}</p>
            <p className="text-[10px] text-white/25">
              {sequence.location && `${sequence.location} · `}
              {sequence.sceneCount ? `${sequence.sceneCount} Szenen` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Move up/down arrows */}
          <button
            onClick={(e) => { e.stopPropagation(); moveSequence("up"); }}
            disabled={isFirstSequence}
            className={`text-[10px] px-1 py-0.5 rounded ${isFirstSequence ? "text-white/10 cursor-not-allowed" : "text-white/30 hover:text-white/60 hover:bg-white/5"}`}
            title="Nach oben"
          >↑</button>
          <button
            onClick={(e) => { e.stopPropagation(); moveSequence("down"); }}
            disabled={isLastSequence}
            className={`text-[10px] px-1 py-0.5 rounded ${isLastSequence ? "text-white/10 cursor-not-allowed" : "text-white/30 hover:text-white/60 hover:bg-white/5"}`}
            title="Nach unten"
          >↓</button>
          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="text-[10px] px-1 py-0.5 rounded text-red-400/30 hover:text-red-400 hover:bg-red-500/10"
            title="Sequenz loeschen"
          >✕</button>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${seqStatusColor(sequence.status)}`}>
            {seqStatusLabel(sequence.status)}
          </span>
          <span className="text-white/35 text-[10px]">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <p className="text-[10px] text-red-300/70 flex-1">
            Sequenz &ldquo;{sequence.name}&rdquo; mit {sequence.sceneCount || 0} Szenen loeschen?
          </p>
          <button onClick={() => setConfirmDelete(false)} className="text-[9px] text-white/30 px-2 py-1 rounded hover:bg-white/5">Abbrechen</button>
          <button onClick={() => deleteSequence()} className="text-[9px] text-red-300 px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 font-medium">Loeschen</button>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-0 border-t border-white/5 pt-3">
          {/* Workflow Status — only show hints for incomplete steps */}
          {sequence.status === "storyboard" && !isGenerating && (
            <div className="px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/15 mb-3">
              <p className="text-[11px] text-blue-300/80 font-medium">Schritt 1: Audio generieren</p>
              <p className="text-[10px] text-blue-300/50 mt-0.5">
                Dialog-Stimmen + Soundeffekte + Hintergrund-Atmosphaere fuer {sceneCount} Szenen
              </p>
            </div>
          )}

          {/* ── Section: Workflow ── */}
          <div className="py-2">
            <p className="text-[8px] text-white/20 uppercase tracking-wider mb-2">Workflow</p>
            <div className="flex flex-wrap items-center gap-2">
              {!isGenerating && (
                <button
                  onClick={generateAudio}
                  className="text-[11px] px-4 py-2 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 font-medium"
                >
                  {sequence.audioUrl || sequence.scenes?.some((s) => s.dialogAudioUrl) ? "Audio neu generieren" : "Audio generieren"}
                </button>
              )}
              {canGenerateClips && !isGenerating && (
                <button
                  onClick={generateAllClipsTracked}
                  className="text-[11px] px-4 py-2 rounded-lg font-medium bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30"
                >
                  {sequence.scenes?.some((s) => s.status === "done") ? "Clips neu generieren" : "Clips generieren"}
                </button>
              )}
              {hasActorsCast && sequence.audioUrl && !isGenerating && (
                <span className="text-[9px] text-amber-400/60 px-2 py-1 bg-amber-500/10 rounded-lg">
                  Actors gecastet — Audio neu generieren fuer richtige Stimmen
                </span>
              )}
              {isGenerating && (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="text-[10px] px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg"
                >
                  Abbrechen
                </button>
              )}
            </div>
            {canGenerateClips && !isGenerating && (
              <p className="text-[9px] text-white/25 mt-1.5">
                {dialogScenes} Dialog (Seedance 2.0) · {landscapeScenes} Landscape (Kling O3) · ~${estimatedCost.toFixed(2)}
              </p>
            )}
          </div>

          {/* ── Section: Location ── */}
          <div className="py-2 border-t border-white/5">
            <p className="text-[8px] text-white/20 uppercase tracking-wider mb-2">Location</p>
            <LandscapeSection sequence={sequence} projectId={projectId} onUpdate={onUpdate} />
          </div>

          {/* ── Section: Audio ── */}
          {!isGenerating && (sequence.scenes?.some((s) => s.dialogAudioUrl) || sequence.audioUrl) && (
            <div className="py-2 border-t border-white/5">
              <p className="text-[8px] text-white/20 uppercase tracking-wider mb-2">Audio</p>
              {sequence.scenes?.some((s) => s.dialogAudioUrl) ? (
                <AudioTimelinePlayer
                  projectId={projectId}
                  sequenceId={sequence.id}
                  scenes={sequence.scenes!}
                  ambienceUrl={sequence.audioUrl}
                  musicUrl={musicUrl}
                  musicVolume={musicVolume}
                  blobProxy={(url) => url.includes(".blob.vercel-storage.com") ? `/api/studio/blob?url=${encodeURIComponent(url)}` : url}
                />
              ) : (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[10px] text-white/35 mb-2">Ambience (keine Dialoge)</p>
                  <audio
                    src={sequence.audioUrl!.includes(".blob.vercel-storage.com") ? `/api/studio/blob?url=${encodeURIComponent(sequence.audioUrl!)}` : sequence.audioUrl!}
                    controls
                    className="w-full h-8 opacity-60"
                  />
                </div>
              )}
            </div>
          )}

          {/* Info box: how transitions & regeneration work */}
          {canGenerateClips && !isGenerating && (
            <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <p className="text-[10px] text-blue-300/50">
                Clips werden sequentiell generiert — jeder Clip nutzt den letzten Frame des vorherigen als Startbild.
                Bei &quot;Nahtlos&quot; fliessen Szenen ineinander. Bei &quot;Harter Schnitt&quot; startet die Szene frisch.
                Du kannst einzelne Clips ueber &quot;Neu generieren&quot; neu erstellen — alle nachfolgenden nahtlosen Clips sollten dann auch neu generiert werden.
              </p>
            </div>
          )}

          {/* Per-sequence preview removed — use Film-Vorschau in ProductionTab instead */}

          {/* ── Section: Szenen ── */}
          {sequence.scenes && sequence.scenes.length > 0 && (
            <div className="py-2 border-t border-white/5">
              <p className="text-[8px] text-white/20 uppercase tracking-wider mb-1">
                Szenen ({sequence.scenes.length})
                {sequence.scenes.filter((s) => s.status === "done").length > 0 &&
                  ` · ${sequence.scenes.filter((s) => s.status === "done").length} Clips fertig`}
              </p>
              <div className="space-y-0">
                {sequence.scenes.map((scene, si) => (
                  <div key={scene.id || si}>
                    {si === 0 && isFirstSequence && (
                      <div className="mx-2 my-1 px-3 py-1.5 rounded-lg bg-blue-500/8 border border-blue-500/20 flex items-center gap-2">
                        <span className="text-sm text-blue-300/60">{"\uD83C\uDFAC"}</span>
                        <span className="text-[10px] text-blue-300/60 font-medium">Film-Start</span>
                      </div>
                    )}
                    {si > 0 && (
                      <TransitionConnector
                        transition={scene.clipTransition}
                        startImageOverride={scene.startImageOverride}
                        onChange={async (transition) => {
                          const updatedScenes = [...(sequence.scenes || [])];
                          updatedScenes[si] = { ...updatedScenes[si], clipTransition: transition };
                          await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scenes: updatedScenes }),
                          });
                            toast.info(`Uebergang geaendert: ${getTransitionLabel(transition)}`);
                          onUpdate();
                        }}
                        onStartImageChange={async (override) => {
                          const updatedScenes = [...(sequence.scenes || [])];
                          updatedScenes[si] = { ...updatedScenes[si], startImageOverride: override };
                          await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scenes: updatedScenes }),
                          });
                          toast.info(`Startbild: ${override.type === "portrait" ? "Actor Portrait" : "Location"}`);
                          onUpdate();
                        }}
                      />
                    )}
                    <SceneClipCard
                      scene={scene}
                      sceneIndex={si}
                      sequenceId={sequence.id}
                      projectId={projectId}
                      isGenerating={!!sceneTasks[si]}
                      taskStatus={sceneTasks[si]}
                      canGenerate={canGenerateClips && !isGenerating && !sceneTasks[si]}
                      onGenerate={(opts) => generateSingleClip(si, opts)}
                      onUpdate={onUpdate}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {isGenerating && progress && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 border-2 border-[#a8d5b8] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-white/40">{progress}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-[10px] text-red-300 bg-red-500/10 rounded-lg px-2.5 py-1.5">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Transition Connector (between scenes) ─────────────────────────

function TransitionConnector({ transition, onChange, onStartImageChange, startImageOverride }: {
  transition?: string;
  onChange: (transition: string) => void;
  onStartImageChange?: (override: { type: "location" | "portrait" | "custom" }) => void;
  startImageOverride?: { type: "location" | "portrait" | "custom"; url?: string };
}) {
  const t = transition || "seamless";
  const s = TRANSITIONS[t] || TRANSITIONS.seamless;
  const [justChanged, setJustChanged] = useState(false);

  const stripesBg = `repeating-linear-gradient(135deg, ${s.stripeA} 0px, ${s.stripeA} 6px, ${s.stripeB} 6px, ${s.stripeB} 12px)`;

  return (
    <div className="my-2">
      <div
        className={`mx-1 px-4 py-3 rounded-lg border ${s.border} flex items-center gap-3`}
        style={{ background: stripesBg }}
      >
        <span className={`text-base ${s.text}`}>{s.icon}</span>
        <span className={`text-[10px] ${s.text} font-medium flex-1`}>{s.label}</span>
        <select
          value={t}
          onChange={(e) => { onChange(e.target.value); setJustChanged(true); setTimeout(() => setJustChanged(false), 10000); }}
          className={`text-[9px] px-2 py-1 rounded bg-black/20 border ${s.border} ${s.text} cursor-pointer`}
        >
          {Object.values(TRANSITIONS).map((tr) => (
            <option key={tr.id} value={tr.id}>{tr.icon} {tr.label}</option>
          ))}
        </select>
        {justChanged && (
          <span className="text-[9px] text-amber-400/70 font-medium">{"\u26A0"} Clip neu generieren</span>
        )}
      </div>
      {(t === "hard-cut" || t === "fade-to-black") && onStartImageChange && (
        <div className="mx-1 mt-1 px-4 py-1.5 rounded-b-lg bg-white/[0.02] text-[9px] text-white/30 flex items-center gap-2 border-x border-b border-white/5">
          <span>Startbild:</span>
          <select
            value={startImageOverride?.type || "location"}
            onChange={(e) => onStartImageChange({ type: e.target.value as "location" | "portrait" | "custom" })}
            className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 text-[9px]"
          >
            <option value="location">{"\uD83D\uDCCD"} Location</option>
            <option value="portrait">{"\uD83D\uDC64"} Actor Portrait</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ── Scene Clip Card (with versions) ────────────────────────────────

function SceneClipCard({ scene, sceneIndex, sequenceId, projectId, isGenerating, taskStatus, canGenerate, onGenerate, onUpdate }: {
  scene: NonNullable<Sequence["scenes"]>[number];
  sceneIndex: number;
  sequenceId: string;
  projectId: string;
  isGenerating: boolean;
  taskStatus?: { status: string; progress?: string };
  canGenerate: boolean;
  onGenerate: (opts?: { directorNote?: string; cameraOverride?: string; durationOverride?: number }) => void;
  onUpdate: () => void;
}) {
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [showFineTune, setShowFineTune] = useState(false);
  const [directorNote, setDirectorNote] = useState("");
  const [cameraOvr, setCameraOvr] = useState("");
  const [durationOvr, setDurationOvr] = useState(0);
  const [showAnchor, setShowAnchor] = useState(false);
  const [anchorRefinement, setAnchorRefinement] = useState("");
  const [anchorBusy, setAnchorBusy] = useState(false);
  const toast = useToast();
  const isDone = scene.status === "done" && scene.videoUrl;
  const versions = scene.versions || [];
  const activeIdx = scene.activeVersionIdx ?? (versions.length - 1);
  const anchorCandidates = scene.sceneAnchorCandidates || [];
  const anchorPicked = scene.sceneAnchorImageUrl;

  const generateAnchor = async (refinement?: string) => {
    if (anchorBusy) return;
    setAnchorBusy(true);
    const tid = toast.loading(
      refinement ? "Setup-Bild mit Anmerkung..." : `Setup-Bild (Kandidat ${anchorCandidates.length + 1})...`,
    );
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/scene-anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIndex, refinementPrompt: refinement || undefined }),
      });
      if (res.ok) {
        toast.success("Setup-Bild generiert (~$0.15)", tid);
        setAnchorRefinement("");
        onUpdate();
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "Fehlgeschlagen", tid);
      }
    } catch (err) {
      toast.error((err as Error).message, tid);
    } finally {
      setAnchorBusy(false);
    }
  };

  const selectAnchor = async (candidateUrl: string) => {
    const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/scene-anchor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIndex, action: "select", candidateUrl }),
    });
    if (res.ok) { toast.success("Setup-Bild akzeptiert"); onUpdate(); }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || "Fehler"); }
  };

  const clearAnchor = async () => {
    const res = await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/scene-anchor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIndex, action: "clear" }),
    });
    if (res.ok) { toast.info("Setup-Bilder entfernt"); setAnchorRefinement(""); onUpdate(); }
  };

  const setActiveVersion = async (vIdx: number) => {
    await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/clips`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIndex, action: "setActive", versionIdx: vIdx }),
    });
    toast.info("Version aktiviert");
    onUpdate();
  };

  const deleteVersion = async (vIdx: number) => {
    await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/clips`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIndex, action: "deleteVersion", versionIdx: vIdx }),
    });
    toast.info("Version geloescht");
    onUpdate();
  };

  return (
    <div className="rounded-lg overflow-hidden bg-white/[0.02]">
      {/* Scene header */}
      <div className="flex items-center gap-2 text-[10px] px-2 py-1.5">
        <span className="text-white/30 w-4 text-right shrink-0">{sceneIndex + 1}</span>
        <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] ${
          scene.type === "dialog" ? "bg-blue-500/15 text-blue-300" :
          scene.type === "landscape" ? "bg-green-500/15 text-green-300" :
          "bg-white/5 text-white/25"
        }`}>{scene.type}</span>
        {scene.dialogAudioUrl && (
          <audio
            src={`/api/studio/blob?url=${encodeURIComponent(scene.dialogAudioUrl)}`}
            controls
            className="h-5 w-20 shrink-0 opacity-60"
          />
        )}
        <span className="text-white/35 flex-1 truncate min-w-0">
          {scene.sceneDescription?.slice(0, 45)}{(scene.sceneDescription?.length || 0) > 45 ? "..." : ""}
        </span>
        {isGenerating && taskStatus ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${taskStatus.status === "running" ? "border-2 border-[#d4a853] border-t-transparent animate-spin" : "bg-blue-400/60 animate-pulse"}`} />
            <span className={`text-[9px] ${taskStatus.status === "running" ? "text-[#d4a853]/70" : "text-blue-300/60"}`}>
              {taskStatus.status === "running" ? (taskStatus.progress || "Generiert...") : "Warteschlange"}
            </span>
          </div>
        ) : canGenerate ? (
          <button
            onClick={() => isDone ? setShowFineTune(!showFineTune) : onGenerate()}
            className="text-[10px] px-2 py-0.5 bg-[#d4a853]/15 text-[#d4a853] rounded hover:bg-[#d4a853]/25 shrink-0"
          >
            {isDone ? (showFineTune ? "Abbrechen" : "Neu generieren") : "Clip"}
          </button>
        ) : isDone ? (
          <span className="text-[#a8d5b8] text-[10px] shrink-0">✓</span>
        ) : null}
        {/* Setup-Bild toggle — Pre-Production Anchor-Image */}
        <button
          onClick={() => setShowAnchor(!showAnchor)}
          className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${
            anchorPicked
              ? "bg-[#a8d5b8]/15 text-[#a8d5b8] hover:bg-[#a8d5b8]/25"
              : anchorCandidates.length > 0
                ? "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25"
                : "bg-white/5 text-white/40 hover:bg-white/10"
          }`}
          title="Setup-Bild (Charakter in Location, Pre-Production)"
        >
          {anchorPicked ? "Setup ✓" : anchorCandidates.length > 0 ? `Setup ${anchorCandidates.length}` : "Setup"}
        </button>
      </div>

      {/* Setup-Bild Panel — Pre-Production Scene-Anchor-Image */}
      {showAnchor && (
        <div className="mx-2 mb-1 px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-purple-300/80">
              Setup-Bild (Charakter in Location)
            </p>
            <span className="text-[9px] text-white/30">Nano Banana Pro · ~$0.15/Versuch</span>
          </div>
          <p className="text-[9px] text-white/40 leading-relaxed">
            Einmalig generieren + akzeptieren. Clip-Cron nutzt dieses Bild als Anker statt
            Portrait/Flux-Rebake → konsistente Lip-Sync-Qualitaet.
          </p>

          {/* Candidate thumbnails */}
          {anchorCandidates.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {anchorCandidates.map((url, ci) => {
                const isPick = url === anchorPicked;
                return (
                  <div
                    key={ci}
                    className={`shrink-0 w-24 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                      isPick
                        ? "border-[#a8d5b8]/60 ring-1 ring-[#a8d5b8]/30"
                        : "border-white/10 hover:border-white/25"
                    }`}
                    onClick={() => !isPick && selectAnchor(url)}
                  >
                    <img
                      src={blobProxy(url)}
                      alt={`Kandidat ${ci + 1}`}
                      className="w-full h-28 object-cover bg-black/30"
                    />
                    <div className="px-1.5 py-1 flex items-center justify-between">
                      <span className="text-[9px] text-white/40">#{ci + 1}</span>
                      {isPick ? (
                        <span className="text-[9px] text-[#a8d5b8]">akzeptiert</span>
                      ) : (
                        <span className="text-[9px] text-purple-300/60">akzeptieren</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Refinement textfield */}
          <div>
            <label className="text-[9px] text-white/30 block mb-1">
              Anmerkung fuer Korrektur (optional)
            </label>
            <textarea
              value={anchorRefinement}
              onChange={(e) => setAnchorRefinement(e.target.value)}
              placeholder="z.B. Charakter mehr nach rechts, weniger Sonnenlicht, ernsterer Ausdruck..."
              rows={2}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/70 placeholder:text-white/20 resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => generateAnchor()}
              disabled={anchorBusy}
              className="text-[10px] px-3 py-1.5 bg-purple-500/20 text-purple-200 rounded-lg hover:bg-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {anchorBusy
                ? "Generiert..."
                : anchorCandidates.length === 0
                  ? "Generieren"
                  : "Nochmal (ohne Anmerkung)"}
            </button>
            {anchorRefinement.trim() && (
              <button
                onClick={() => generateAnchor(anchorRefinement.trim())}
                disabled={anchorBusy}
                className="text-[10px] px-3 py-1.5 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Mit Anmerkung ausbessern
              </button>
            )}
            <div className="flex-1" />
            {anchorCandidates.length > 0 && (
              <button
                onClick={clearAnchor}
                disabled={anchorBusy}
                className="text-[10px] px-2 py-1 text-red-400/50 hover:text-red-400 disabled:opacity-40"
              >
                Alle loeschen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fine-tuning panel */}
      {showFineTune && canGenerate && (
        <div className="mx-2 mb-1 px-3 py-2.5 rounded-lg bg-[#d4a853]/5 border border-[#d4a853]/15 space-y-2">
          <div>
            <label className="text-[9px] text-white/30 block mb-1">Regie-Anweisung (optional)</label>
            <textarea
              value={directorNote}
              onChange={(e) => setDirectorNote(e.target.value)}
              placeholder="z.B. Surfer soll am Ende schon im Wasser sein..."
              rows={2}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/70 placeholder:text-white/20 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-[9px] text-white/30 block mb-1">Kamera</label>
              <select
                value={cameraOvr}
                onChange={(e) => setCameraOvr(e.target.value)}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] text-white/50"
              >
                <option value="">Wie im Drehbuch</option>
                <option value="static">Statisch</option>
                <option value="pan-left">Pan Links</option>
                <option value="pan-right">Pan Rechts</option>
                <option value="zoom-in">Zoom In</option>
                <option value="zoom-out">Zoom Out</option>
                <option value="dolly-forward">Dolly Vorwaerts</option>
                <option value="dolly-back">Dolly Zurueck</option>
                <option value="tracking">Tracking</option>
                <option value="rotation">Rotation</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-white/30 block mb-1">Dauer</label>
              <select
                value={durationOvr}
                onChange={(e) => setDurationOvr(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] text-white/50"
              >
                <option value={0}>Standard</option>
                <option value={5}>5s</option>
                <option value={8}>8s</option>
                <option value={10}>10s</option>
                <option value={12}>12s</option>
                <option value={15}>15s</option>
              </select>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => {
                onGenerate({
                  directorNote: directorNote.trim() || undefined,
                  cameraOverride: cameraOvr || undefined,
                  durationOverride: durationOvr || undefined,
                });
                setShowFineTune(false);
              }}
              className="text-[10px] px-3 py-1.5 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30 font-medium"
            >
              Generieren
            </button>
          </div>
        </div>
      )}

      {/* Inline generation status bar */}
      {isGenerating && taskStatus && (
        <div className={`mx-2 mb-1 px-3 py-2 rounded-lg flex items-center gap-2 ${taskStatus.status === "running" ? "bg-[#d4a853]/5 border border-[#d4a853]/15" : "bg-blue-500/5 border border-blue-500/15"}`}>
          <div className={`w-3 h-3 shrink-0 ${taskStatus.status === "running" ? "border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" : "bg-blue-400/40 rounded-full animate-pulse"}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-medium ${taskStatus.status === "running" ? "text-[#d4a853]/80" : "text-blue-300/70"}`}>
              {taskStatus.status === "running" ? (taskStatus.progress || "Clip wird generiert...") : `Szene ${sceneIndex + 1} in Warteschlange`}
            </p>
            <p className="text-[9px] text-white/25 mt-0.5">
              {taskStatus.status === "running" ? "Bitte warten — Generierung laeuft" : "Wird automatisch gestartet wenn vorherige Szenen fertig sind"}
            </p>
          </div>
        </div>
      )}

      {/* Version cards — horizontal scroll */}
      {versions.length > 0 && (
        <div className="px-2 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            {versions.map((v, vi) => {
              const isActive = vi === activeIdx;
              return (
                <div
                  key={vi}
                  className={`shrink-0 w-28 rounded-lg overflow-hidden cursor-pointer border transition-all ${
                    isActive ? "border-[#a8d5b8]/50 ring-1 ring-[#a8d5b8]/20" : "border-white/5 hover:border-white/15"
                  }`}
                  onClick={() => setExpandedVideo(expandedVideo === v.videoUrl ? null : v.videoUrl)}
                >
                  {/* Thumbnail with overlay badges */}
                  <div className="relative">
                    <video
                      src={portraitSrc(v.videoUrl)}
                      preload="metadata"
                      muted
                      className="w-full h-16 object-cover bg-black/30"
                    />
                    <span className={`absolute top-1 left-1 text-[8px] font-medium px-1 py-0.5 rounded bg-black/50 ${
                      v.provider.includes("runway") ? "text-purple-300"
                      : v.provider.includes("wan") ? "text-[#a8d5b8]"
                      : v.provider.includes("seedance") ? "text-[#e8b4a8]"
                      : "text-[#d4a853]"
                    }`}>
                      {v.provider.includes("runway") ? "Runway"
                        : v.provider.includes("wan-fallback-seedance") ? "Wan→Sd"
                        : v.provider.includes("wan-fallback-kling-o3") ? "Wan→O3"
                        : v.provider.includes("wan-fallback") ? "Wan→Kl"
                        : v.provider.includes("wan") ? "Wan"
                        : v.provider.includes("seedance") ? "Seedance"
                        : v.provider.includes("o3") ? "O3"
                        : v.provider.includes("pro") ? "Pro"
                        : "Kling"}
                    </span>
                    <span className="absolute top-1 right-1 text-[8px] font-medium px-1 py-0.5 rounded bg-black/50 text-white/70">
                      ${v.cost.toFixed(2)}
                    </span>
                  </div>
                  {/* Compact meta */}
                  <div className="px-1.5 py-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/35">{v.durationSec.toFixed(0)}s · {v.quality}</span>
                      {!isActive ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveVersion(vi); }}
                          className="text-[9px] text-[#a8d5b8]/60 hover:text-[#a8d5b8]"
                        >
                          aktivieren
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteVersion(vi); }}
                          className="text-[9px] text-red-400/40 hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {(v as { directorNote?: string }).directorNote && (
                      <div
                        className="text-[8px] text-amber-300/50 truncate cursor-help"
                        title={(v as { directorNote?: string }).directorNote}
                      >
                        Regie: {(v as { directorNote?: string }).directorNote}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Expanded video player */}
          {expandedVideo && (() => {
            const expandedVersion = versions.find((v) => v.videoUrl === expandedVideo) as { directorNote?: string } | undefined;
            return (
              <div className="mt-2 space-y-2">
                <video
                  src={portraitSrc(expandedVideo)}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-h-[300px] rounded-lg bg-black/30"
                />
                {expandedVersion?.directorNote && (
                  <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-amber-300/50 mb-0.5">Regie-Anweisung:</p>
                      <p className="text-[10px] text-white/50">&ldquo;{expandedVersion.directorNote}&rdquo;</p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const updatedScenes = [...(await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}`).then((r) => r.json()).then((d) => (d.scenes || []) as Array<{ sceneDescription: string }>))];
                        if (updatedScenes[sceneIndex]) {
                          updatedScenes[sceneIndex].sceneDescription += ` [Regie: ${expandedVersion.directorNote}]`;
                          await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scenes: updatedScenes }),
                          });
                          toast.success("Regie-Anweisung ins Drehbuch uebernommen");
                          onUpdate();
                        }
                      }}
                      className="text-[9px] px-2 py-1 bg-amber-500/10 text-amber-300/60 rounded hover:bg-amber-500/20 shrink-0"
                    >
                      Ins Drehbuch
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Single video fallback for scenes with videoUrl but no versions array */}
      {isDone && scene.videoUrl && versions.length === 0 && (
        <div className="px-2 pb-2">
          <video
            src={portraitSrc(scene.videoUrl)}
            controls
            preload="metadata"
            className="w-full max-h-[200px] rounded-lg bg-black/30"
          />
        </div>
      )}
    </div>
  );
}

function seqStatusLabel(s: string) {
  return s === "mastered" ? "Fertig" :
    s === "clips" ? "Clips fertig" :
    s === "audio" ? "Audio fertig" :
    s === "storyboard" ? "Bereit" :
    "Entwurf";
}

function seqStatusColor(s: string) {
  return s === "mastered" ? "bg-[#a8d5b8]/20 text-[#a8d5b8]" :
    s === "clips" ? "bg-[#d4a853]/20 text-[#d4a853]" :
    s === "audio" ? "bg-blue-500/20 text-blue-300" :
    s === "storyboard" ? "bg-purple-500/20 text-purple-300" :
    "bg-white/5 text-white/30";
}

// ── SSE Consumer Helper ────────────────────────────────────────────

async function consumeSSE(
  res: Response,
  handlers: { onProgress: (p: string) => void; onError: (e: string) => void; onDone: () => void },
) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.progress) handlers.onProgress(data.progress);
        if (data.error) handlers.onError(data.error);
        if (data.done && !data.error) handlers.onDone();
      } catch (e) { console.warn("[Studio]", e); }
    }
  }
}

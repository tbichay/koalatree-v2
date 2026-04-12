"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import LibraryPicker from "@/app/components/LibraryPicker";
import TaskStatusBar from "@/app/components/TaskStatusBar";
import AudioTimelinePlayer from "@/app/components/AudioTimelinePlayer";
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
    emotion?: string;
    mood?: string;
    durationHint?: number;
    audioStartMs: number;
    audioEndMs: number;
    dialogDurationMs?: number;
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
                <span className={`text-[8px] px-2 py-0.5 rounded-full ${statusColor(p.status)}`}>
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
            <span className={`text-[8px] px-2 py-0.5 rounded-full ${statusColor(selectedProject.status)}`}>
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
            {activeTab === "production" && (
              <ProductionTab project={selectedProject} onUpdate={refreshProject} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

/** Resolve portrait URL — use blob proxy for private Vercel Blob URLs */
function portraitSrc(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes(".blob.vercel-storage.com")) {
    return `/api/studio/blob?url=${encodeURIComponent(url)}`;
  }
  return url; // Public URL (e.g. /koda-portrait.png)
}

// ── Visual Style Presets ───────────────────────────────────────────

const VISUAL_STYLES = [
  { id: "disney-2d", label: "2D Disney", prompt: "2D Disney animation style, hand-drawn feel, vibrant watercolor backgrounds, expressive characters, warm soft lighting, classic fairy tale aesthetic." },
  { id: "pixar-3d", label: "3D Pixar", prompt: "Pixar 3D animation style, smooth CGI rendering, subsurface scattering on skin, volumetric lighting, detailed textures, cinematic depth of field." },
  { id: "ghibli", label: "Studio Ghibli", prompt: "Studio Ghibli anime style, lush painted backgrounds, soft pastel colors, dreamy atmosphere, detailed nature, gentle watercolor textures." },
  { id: "storybook", label: "Bilderbuch", prompt: "Children's storybook illustration style, soft colored pencil and watercolor, warm muted palette, cozy and inviting, textured paper feel." },
  { id: "realistic", label: "Realistisch", prompt: "Photorealistic CGI, lifelike textures and materials, natural lighting, cinematic color grading, shallow depth of field." },
  { id: "claymation", label: "Claymation", prompt: "Stop-motion claymation style, soft clay textures, slightly imperfect surfaces, warm directional lighting, miniature set design feel." },
  { id: "custom", label: "Eigener Style", prompt: "" },
];

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
    setTimeout(() => setSaved(false), 2000);
  };

  const generateStory = async () => {
    if (!theme.trim()) return;
    setGenerating(true);
    setGenProgress("Starte...");
    setGenError("");
    setText("");

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
        setGenError(errData.error || `Fehler ${res.status}`);
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
            }
            if (data.progress) setGenProgress(data.progress);
            if (data.error) setGenError(data.error);
            if (data.done && !data.error) {
              if (data.title) setName(data.title);
              if (data.text) setText(data.text);
            }
          } catch { /* */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setGenError((err as Error).message);
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
          <p className="text-[9px] text-white/20 mt-1">
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
              <p className="text-[9px] text-white/20 mt-1">
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
              <p className="text-[9px] text-white/20 mt-1">PDF und DOCX Support kommt spaeter</p>
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
              <p className="text-[9px] text-white/20 mt-1">
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

  const generate = async (force: boolean) => {
    if (!project.storyText) return;
    setGenerating(true);
    setProgress("Starte...");
    setError("");
    setResult(null);

    // Save style settings first
    await fetch(`/api/studio/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directingStyle,
        atmosphere: atmosphere === "custom" ? `custom:${customAtmo}` : atmosphere,
        stylePrompt: resolvedStylePrompt,
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
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(errData.error || `Fehler ${res.status}`);
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setError("Kein Stream"); setGenerating(false); return; }

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
            if (data.progress) setProgress(data.progress);
            if (data.error) setError(data.error);
            if (data.done) {
              gotDone = true;
              if (!data.error) {
                setResult({ sequences: data.sequences || 0, scenes: data.scenes || 0 });
              }
            }
          } catch { /* ignore parse errors */ }
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
            onUpdate(project.id);
          } else {
            setError("Verbindung unterbrochen. Bitte nochmal versuchen.");
          }
        } catch {
          setError("Verbindung unterbrochen. Bitte nochmal versuchen.");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
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
              <span className="text-[8px] block mt-0.5 opacity-60">{m.desc}</span>
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

      {/* Generate Button */}
      <div className="flex items-center gap-3">
        {!generating ? (
          <>
            <button
              onClick={() => generate(false)}
              className="px-5 py-2 rounded-xl bg-[#d4a853] text-black text-sm font-medium hover:bg-[#e4b863]"
            >
              🎬 Drehbuch generieren
            </button>
            {project.status !== "draft" && (
              <button
                onClick={() => generate(true)}
                className="px-4 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:text-white/60"
              >
                Neu generieren
              </button>
            )}
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
                <SequencePreview key={seq.id} sequence={seq} index={i} characters={project.characters} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Character Card (with portrait upload) ──────────────────────────

interface DigitalActor {
  id: string;
  name: string;
  description?: string;
  voiceId?: string;
  voiceSettings?: Record<string, unknown>;
  voicePreviewUrl?: string;
  portraitAssetId?: string;
  style?: string;
  tags: string[];
  _count?: { characters: number };
}

function CharacterCard({ character, projectId, onUpdate, visualStyle }: { character: Character; projectId: string; onUpdate: () => void; visualStyle?: string }) {
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(character.name);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fullscreenPortrait, setFullscreenPortrait] = useState(false);
  const [showCastMenu, setShowCastMenu] = useState(false);
  const [actors, setActors] = useState<DigitalActor[]>([]);
  const [loadingActors, setLoadingActors] = useState(false);

  const generatePortrait = async () => {
    setGenerating(true);
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
      if (res.ok) onUpdate();
    } catch { /* */ }
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
    } catch { /* */ }
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
      onUpdate();
    } catch { /* */ }
  };

  const uncastActor = async () => {
    try {
      await fetch(`/api/studio/projects/${projectId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, updates: { actorId: null } }),
      });
      setShowCastMenu(false);
      onUpdate();
    } catch { /* */ }
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
      onUpdate();
    } catch { /* */ }
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
    } catch { /* */ }
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
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#d4a853] text-black text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-[#e4b863]"
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
        <p className="text-[10px] text-white/20 mt-0.5 font-mono">{character.markerId}</p>
      )}
      {!character.portraitUrl && !character.actorId && (
        <div className="flex gap-2 mt-2 justify-center">
          <p className="text-[10px] text-white/20">Actor casten fuer Portrait</p>
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
          </div>
          {showVersions && character.castHistory && (
            <div className="mt-1 bg-[#1a2e1a] border border-white/10 rounded-lg p-1.5 text-left">
              <p className="text-[7px] text-white/25 px-1 mb-1">Versionen (aktuell: {character.castSnapshot ? new Date((character.castSnapshot as Record<string, string>).syncedAt).toLocaleString("de", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?"})</p>
              {(character.castHistory as Array<Record<string, string>>).map((snap, idx) => (
                <button
                  key={idx}
                  onClick={() => switchVersion(idx)}
                  className="w-full text-left px-2 py-0.5 rounded text-[8px] text-white/40 hover:bg-white/5 hover:text-white/60"
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
      {/* Fullscreen portrait overlay */}
      {fullscreenPortrait && character.portraitUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setFullscreenPortrait(false)}>
          <img
            src={portraitSrc(character.portraitUrl)}
            alt={character.name}
            className="max-w-full max-h-full object-contain rounded-xl"
          />
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl" onClick={() => setFullscreenPortrait(false)}>&#x2715;</button>
        </div>
      )}
    </div>
  );
}

// ── Sequence Preview (Screenplay Tab) ──────────────────────────────

function SequencePreview({ sequence, index, characters }: { sequence: Sequence; index: number; characters: Character[] }) {
  const [open, setOpen] = useState(false);
  const charMap = new Map(characters.map((c) => [c.id, c]));

  return (
    <div className="bg-white/3 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/20 w-4 text-right">{index + 1}</span>
          <div>
            <span className="text-xs text-white/60">{sequence.name}</span>
            {sequence.location && (
              <span className="text-[9px] text-white/25 ml-2">{sequence.location}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/25">{sequence.sceneCount || 0} Szenen</span>
          <span className="text-white/15 text-[10px]">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && sequence.scenes && (
        <div className="px-3 pb-2 space-y-1 border-t border-white/5 pt-2">
          {sequence.scenes.map((scene, si) => (
            <SceneDetailRow key={scene.id || si} scene={scene} index={si} character={scene.characterId ? charMap.get(scene.characterId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scene Detail Row (expandable) ─────────────────────────────────

function SceneDetailRow({ scene, index, character }: {
  scene: NonNullable<Sequence["scenes"]>[number];
  index: number;
  character?: Character;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Compact row — click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 text-[10px] px-1 py-1 hover:bg-white/5 rounded transition-all text-left"
      >
        <span className="text-white/15 w-4 text-right shrink-0 mt-0.5">{index + 1}</span>
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] mt-0.5 ${
          scene.type === "dialog" ? "bg-blue-500/15 text-blue-300" :
          scene.type === "landscape" ? "bg-green-500/15 text-green-300" :
          "bg-white/5 text-white/20"
        }`}>{scene.type}</span>
        {character && (
          <span className="text-[9px] text-white/30 shrink-0 mt-0.5">{character.emoji || ""} {character.name}</span>
        )}
        <span className="text-white/35 flex-1 truncate">{scene.sceneDescription?.slice(0, 80)}</span>
        <span className="text-white/10 text-[8px] shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-6 pl-2 border-l border-white/5 pb-2 space-y-1.5 mt-1">
          {/* Dialog text */}
          {scene.spokenText && (
            <div>
              <span className="text-[8px] text-white/20 uppercase">Dialog:</span>
              <p className="text-[11px] text-blue-300/70 italic mt-0.5">&quot;{scene.spokenText}&quot;</p>
            </div>
          )}

          {/* Scene description (full) */}
          <div>
            <span className="text-[8px] text-white/20 uppercase">Szenen-Beschreibung:</span>
            <p className="text-[10px] text-white/40 mt-0.5">{scene.sceneDescription}</p>
          </div>

          {/* Technical details */}
          <div className="flex flex-wrap gap-3 text-[9px]">
            {scene.camera && (
              <span className="text-white/25">Kamera: <span className="text-white/40">{scene.camera}</span></span>
            )}
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
  const [extracting, setExtracting] = useState(false);
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
          <p className="text-[10px] text-white/20">
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
            className="text-[10px] text-white/20 hover:text-white/40 disabled:opacity-50"
          >
            {extracting ? "Extrahiere..." : "🔄 Alle Charaktere neu extrahieren"}
          </button>
        </div>
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

  const totalSequences = project.sequences.length;
  const audioCount = project.sequences.filter((s) => ["audio", "clips", "mastered"].includes(s.status)).length;
  const clipsCount = project.sequences.filter((s) => ["clips", "mastered"].includes(s.status)).length;
  const allClipsDone = clipsCount === totalSequences && totalSequences > 0;

  const assembleFilm = async () => {
    setAssembling(true);
    setAssembleProgress("Starte Assembly...");
    setAssembleError("");
    setFilmUrl("");

    try {
      const res = await fetch(`/api/studio/projects/${project.id}/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: project.format || "portrait" }),
      });

      await consumeSSE(res, {
        onProgress: setAssembleProgress,
        onError: setAssembleError,
        onDone: () => onUpdate(project.id),
      });
    } catch (err) {
      setAssembleError((err as Error).message);
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

      {/* Sequence Cards */}
      <div className="space-y-3">
        {project.sequences
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((seq, i) => (
            <SequenceCard
              key={seq.id}
              sequence={seq}
              index={i}
              projectId={project.id}
              projectStyle={project.stylePrompt}
              hasActorsCast={project.characters?.some((c: Character) => c.actorId) || false}
              onUpdate={() => onUpdate(project.id)}
            />
          ))}
      </div>

      {/* Film Assembly */}
      {allClipsDone && (
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-[#f5eed6]">Film zusammenfuegen</h4>
            {project.status === "completed" && (
              <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#a8d5b8]/20 text-[#a8d5b8]">
                Fertig
              </span>
            )}
          </div>

          {!assembling ? (
            <div className="flex gap-2">
              <button
                onClick={assembleFilm}
                className="px-4 py-2 rounded-xl bg-[#a8d5b8] text-black text-xs font-medium hover:bg-[#b8e5c8]"
              >
                🎬 Film rendern
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

  const selectFromLibrary = async (blobUrl: string) => {
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}/landscape`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landscapeRefUrl: blobUrl }),
      });
      setShowLibrary(false);
      onUpdate();
    } catch { /* */ }
  };

  return (
    <div>
      <p className="text-[9px] text-white/25 mb-1.5">Landscape / Hintergrund</p>
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
          {/* Fullscreen overlay */}
          {fullscreen && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setFullscreen(false)}>
              <img
                src={portraitSrc(sequence.landscapeRefUrl)}
                alt="Landscape"
                className="max-w-full max-h-full object-contain rounded-xl"
              />
              <button className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl" onClick={() => setFullscreen(false)}>✕</button>
            </div>
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

function SequencePreviewPlayer({ scenes }: { scenes: NonNullable<Sequence["scenes"]> }) {
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const clips = scenes.filter((s) => s.status === "done" && s.videoUrl);
  if (clips.length < 2) return null; // Only show if 2+ clips

  const currentClip = clips[currentIdx];
  const clipUrl = currentClip?.videoUrl
    ? `/api/studio/blob?url=${encodeURIComponent(currentClip.videoUrl)}`
    : "";

  const handleEnded = () => {
    if (currentIdx < clips.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setPlaying(false);
      setCurrentIdx(0);
    }
  };

  const handlePlay = () => {
    setPlaying(true);
    setCurrentIdx(0);
  };

  useEffect(() => {
    if (playing && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentIdx, playing]);

  if (!playing) {
    return (
      <button
        onClick={handlePlay}
        className="w-full text-center text-[9px] py-1.5 bg-[#d4a853]/10 text-[#d4a853]/60 rounded-lg hover:text-[#d4a853] hover:bg-[#d4a853]/20 transition-all mb-2"
      >
        ▶ Alle {clips.length} Clips abspielen
      </button>
    );
  }

  return (
    <div className="mb-2 rounded-xl overflow-hidden bg-black relative">
      <video
        ref={videoRef}
        key={currentIdx}
        src={clipUrl}
        autoPlay
        onEnded={handleEnded}
        className="w-full aspect-video"
        playsInline
      />
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
        <span className="text-[8px] text-white/60 bg-black/60 px-1.5 py-0.5 rounded">
          {currentIdx + 1}/{clips.length}
        </span>
        <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#d4a853] transition-all"
            style={{ width: `${((currentIdx + 1) / clips.length) * 100}%` }}
          />
        </div>
        <button
          onClick={() => { setPlaying(false); setCurrentIdx(0); }}
          className="text-[8px] text-white/40 bg-black/60 px-1.5 py-0.5 rounded hover:text-white/70"
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
}: {
  sequence: Sequence;
  index: number;
  projectId: string;
  projectStyle?: string;
  hasActorsCast: boolean;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [clipGenerating, setClipGenerating] = useState(false);
  const [generatingSceneIdx, setGeneratingSceneIdx] = useState<number | null>(null);
  const [showCostConfirm, setShowCostConfirm] = useState(false); // kept for UI compat
  const clipQuality = "pro" as const; // Always Kling Pro
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

  // Cost estimation
  const sceneCount = sequence.sceneCount || sequence.scenes?.length || 0;
  const dialogScenes = sequence.scenes?.filter((s) => s.type === "dialog").length || Math.ceil(sceneCount * 0.6);
  const landscapeScenes = sceneCount - dialogScenes;
  // Cost per ~5s clip: Dialog=Kling Avatar ~$0.28, Landscape=Seedance ~$0.13
  // Premium: Dialog=Veo+LipSync ~$0.55, Landscape=Kling Pro ~$0.84
  // Kling 3.0 Pro: ~$0.12/s for dialog (Avatar), ~$0.08/s for landscape (I2V)
  const estimatedCost = dialogScenes * 0.60 + landscapeScenes * 0.40;

  // Task tracking is now server-side (each route creates its own StudioTask)

  const generateAudio = async () => {
    setAudioGenerating(true);
    setProgress("Starte Audio...");
    setError("");

    const scenes = sequence.scenes || [];
    let totalDurationMs = 0;
    let dialogsDone = 0;
    const totalDialogs = scenes.filter((s) => s.spokenText && s.characterId).length;

    try {
      // Generate each scene individually (avoids Vercel timeout)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const needsDialog = scene.spokenText && scene.characterId;
        const needsSfx = scene.sfx;

        if (!needsDialog && !needsSfx) continue;

        if (needsDialog) {
          dialogsDone++;
          setProgress(`Dialog ${dialogsDone}/${totalDialogs}: Szene ${i + 1}...`);
        } else {
          setProgress(`SFX: Szene ${i + 1}...`);
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
          console.error(`[Audio] Scene ${i + 1} failed:`, errMsg);
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
      } catch { /* ambience is optional */ }

      // Update sequence status to "audio"
      try {
        await fetch(`/api/studio/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "audio" }),
        });
      } catch { /* */ }

      setProgress(`Fertig: ${dialogsDone} Dialoge`);
      onUpdate();
    } catch (err) {
      setError((err as Error).message);
    }

    setAudioGenerating(false);
    setProgress("");
  };

  const generateSingleClip = async (sceneIndex: number) => {
    setClipGenerating(true);
    setGeneratingSceneIdx(sceneIndex);
    setError("");
    setProgress(`Clip ${sceneIndex + 1}...`);


    try {
      const res = await fetch(
        `/api/studio/projects/${projectId}/sequences/${sequence.id}/clips`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneIndex, quality: clipQuality, stylePrompt: resolvedStyle }),
        },
      );
      let hadError = false;
      await consumeSSE(res, {
        onProgress: (p) => setProgress(`Clip ${sceneIndex + 1}: ${p}`),
        onError: (e) => { setError(e); hadError = true; },
        onDone: () => onUpdate(),
      });
    } catch (err) {
      setError(`Clip ${sceneIndex + 1}: ${(err as Error).message}`);
    }

    setClipGenerating(false);
    setGeneratingSceneIdx(null);
    setProgress("");
  };

  const startClipGeneration = () => {
    // Generate all clips directly (always Kling Pro, no cost confirmation needed)
    generateAllClipsTracked();
  };

  const confirmAndGenerateClips = async () => {
    setShowCostConfirm(false);
    setClipGenerating(true);
    setError("");
    const total = sceneCount;

    for (let i = 0; i < total; i++) {
      // Skip scenes that are already done
      const scene = sequence.scenes?.[i];
      if (scene?.status === "done" && scene?.videoUrl) {
        continue;
      }

      setProgress(`Clip ${i + 1}/${total}...`);

      try {
        const res = await fetch(
          `/api/studio/projects/${projectId}/sequences/${sequence.id}/clips`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sceneIndex: i, quality: clipQuality }),
          },
        );

        await consumeSSE(res, {
          onProgress: (p) => setProgress(`Clip ${i + 1}/${total}: ${p}`),
          onError: (e) => { setError(`Clip ${i + 1}: ${e}`); },
          onDone: () => onUpdate(),
        });

        if (error) break;
      } catch (err) {
        setError(`Clip ${i + 1}: ${(err as Error).message}`);
        break;
      }
    }

    setClipGenerating(false);
    setProgress("");
  };

  const [backgroundQueued, setBackgroundQueued] = useState(false);

  // "Alle Clips" generiert sequenziell mit Task-Tracking
  const generateAllClipsTracked = async () => {
    setClipGenerating(true);
    setError("");
    const total = sceneCount;

    for (let i = 0; i < total; i++) {
      const scene = sequence.scenes?.[i];
      if (scene?.status === "done" && scene?.videoUrl) continue;

      setProgress(`Clip ${i + 1}/${total}...`);

      try {
        const res = await fetch(
          `/api/studio/projects/${projectId}/sequences/${sequence.id}/clips`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sceneIndex: i, quality: clipQuality, stylePrompt: resolvedStyle }),
          },
        );
        let hadError = false;
        await consumeSSE(res, {
          onProgress: (p) => setProgress(`Clip ${i + 1}/${total}: ${p}`),
          onError: (e) => { setError(`Clip ${i + 1}: ${e}`); hadError = true; },
          onDone: () => onUpdate(),
        });
        if (hadError) break;
      } catch (err) {
        setError(`Clip ${i + 1}: ${(err as Error).message}`);
        break;
      }
    }

    setClipGenerating(false);
    setProgress("");
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
          <span className="text-[10px] text-white/20 w-5 text-right">{index + 1}</span>
          <div>
            <p className="text-xs font-medium text-[#f5eed6]">{sequence.name}</p>
            <p className="text-[8px] text-white/25">
              {sequence.location && `${sequence.location} · `}
              {sequence.sceneCount ? `${sequence.sceneCount} Szenen` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[8px] px-2 py-0.5 rounded-full ${seqStatusColor(sequence.status)}`}>
            {seqStatusLabel(sequence.status)}
          </span>
          <span className="text-white/20 text-[10px]">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
          {/* Workflow Status — only show hints for incomplete steps */}
          {sequence.status === "storyboard" && !isGenerating && (
            <div className="px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/15">
              <p className="text-[11px] text-blue-300/80 font-medium">Schritt 1: Audio generieren</p>
              <p className="text-[10px] text-blue-300/50 mt-0.5">
                Dialog-Stimmen + Soundeffekte + Hintergrund-Atmosphaere fuer {sceneCount} Szenen
              </p>
            </div>
          )}

          {/* Action buttons — always visible */}
          <div className="flex flex-wrap gap-2">
            {!isGenerating && (
              <button
                onClick={generateAudio}
                className="text-[11px] px-4 py-2 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 font-medium"
              >
                {sequence.audioUrl || sequence.scenes?.some((s) => s.dialogAudioUrl) ? "🔄 Audio neu" : "🔊 Audio generieren"}
              </button>
            )}
            {canGenerateClips && !isGenerating && (
              <button
                onClick={generateAllClipsTracked}
                className="text-[11px] px-4 py-2 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30 font-medium"
              >
                {sequence.scenes?.some((s) => s.status === "done") ? "\uD83D\uDD04 Clips neu generieren" : "\uD83C\uDFAC Clips generieren"}
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

          {/* Landscape Image */}
          <LandscapeSection sequence={sequence} projectId={projectId} onUpdate={onUpdate} />

          {/* Cost Confirmation */}
          {/* Cost info (shown inline, no separate dialog) */}
          {canGenerateClips && !isGenerating && (
            <p className="text-[9px] text-white/20">
              {dialogScenes} Dialog · {landscapeScenes} Landscape · Kling 3.0 Pro · ~${estimatedCost.toFixed(2)}
            </p>
          )}

          {/* Audio Timeline Preview */}
          {sequence.scenes && sequence.scenes.some((s) => s.dialogAudioUrl) && !isGenerating && (
            <AudioTimelinePlayer
              projectId={projectId}
              sequenceId={sequence.id}
              scenes={sequence.scenes}
              ambienceUrl={sequence.audioUrl}
              blobProxy={(url) => url.includes(".blob.vercel-storage.com") ? `/api/studio/blob?url=${encodeURIComponent(url)}` : url}
            />
          )}

          {/* Sequence Preview Player — play all clips in order */}
          <SequencePreviewPlayer scenes={sequence.scenes || []} />

          {/* Scene List with Clip Versions */}
          {sequence.scenes && sequence.scenes.length > 0 && (
            <div>
              <p className="text-[9px] text-white/25 mb-1">
                Szenen ({sequence.scenes.length})
                {sequence.scenes.filter((s) => s.status === "done").length > 0 &&
                  ` · ${sequence.scenes.filter((s) => s.status === "done").length} Clips fertig`}
              </p>
              <div className="space-y-2">
                {sequence.scenes.map((scene, si) => (
                  <SceneClipCard
                    key={scene.id || si}
                    scene={scene}
                    sceneIndex={si}
                    sequenceId={sequence.id}
                    projectId={projectId}
                    isGenerating={generatingSceneIdx === si}
                    canGenerate={canGenerateClips && !isGenerating}
                    onGenerate={() => generateSingleClip(si)}
                    onUpdate={onUpdate}
                  />
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

// ── Scene Clip Card (with versions) ────────────────────────────────

function SceneClipCard({ scene, sceneIndex, sequenceId, projectId, isGenerating, canGenerate, onGenerate, onUpdate }: {
  scene: NonNullable<Sequence["scenes"]>[number];
  sceneIndex: number;
  sequenceId: string;
  projectId: string;
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onUpdate: () => void;
}) {
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const isDone = scene.status === "done" && scene.videoUrl;
  const versions = scene.versions || [];
  const activeIdx = scene.activeVersionIdx ?? (versions.length - 1);

  const setActiveVersion = async (vIdx: number) => {
    await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/clips`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIndex, action: "setActive", versionIdx: vIdx }),
    });
    onUpdate();
  };

  const deleteVersion = async (vIdx: number) => {
    await fetch(`/api/studio/projects/${projectId}/sequences/${sequenceId}/clips`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIndex, action: "deleteVersion", versionIdx: vIdx }),
    });
    onUpdate();
  };

  return (
    <div className="rounded-lg overflow-hidden bg-white/[0.02]">
      {/* Scene header */}
      <div className="flex items-center gap-2 text-[10px] px-2 py-1.5">
        <span className="text-white/15 w-4 text-right shrink-0">{sceneIndex + 1}</span>
        <span className={`shrink-0 px-1 py-0.5 rounded text-[8px] ${
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
        {isGenerating ? (
          <div className="w-3 h-3 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin shrink-0" />
        ) : canGenerate ? (
          <button onClick={onGenerate} className="text-[8px] px-2 py-0.5 bg-[#d4a853]/15 text-[#d4a853] rounded hover:bg-[#d4a853]/25 shrink-0">
            {isDone ? "🔄 Neu" : "▶ Clip"}
          </button>
        ) : isDone ? (
          <span className="text-[#a8d5b8] text-[8px] shrink-0">✓</span>
        ) : null}
      </div>

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
                  {/* Thumbnail video */}
                  <video
                    src={portraitSrc(v.videoUrl)}
                    preload="metadata"
                    muted
                    className="w-full h-16 object-cover bg-black/30"
                  />
                  {/* Meta info */}
                  <div className="p-1.5 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[7px] text-white/30">{v.provider}</span>
                      <span className="text-[7px] text-white/20">${v.cost.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[7px] text-white/20">{v.durationSec.toFixed(1)}s · {v.quality}</span>
                      {!isActive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveVersion(vi); }}
                          className="text-[7px] text-[#a8d5b8]/60 hover:text-[#a8d5b8]"
                        >
                          aktivieren
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[6px] text-white/15">
                        {v.createdAt ? new Date(v.createdAt).toLocaleTimeString("de", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteVersion(vi); }}
                        className="text-[7px] text-red-400/40 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Expanded video player */}
          {expandedVideo && (
            <div className="mt-2">
              <video
                src={portraitSrc(expandedVideo)}
                controls
                autoPlay
                playsInline
                className="w-full max-h-[300px] rounded-lg bg-black/30"
              />
            </div>
          )}
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
      } catch { /* */ }
    }
  }
}

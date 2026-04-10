"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
    audioStartMs: number;
    audioEndMs: number;
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
      body: JSON.stringify({ name: "Neues Projekt" }),
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
    { id: "story" as const, label: "Geschichte", emoji: "📖" },
    { id: "screenplay" as const, label: "Drehbuch", emoji: "🎬" },
    { id: "characters" as const, label: "Charaktere", emoji: "🎭" },
    { id: "production" as const, label: "Produktion", emoji: "🎥" },
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

const LENGTH_OPTIONS = [
  { id: "short", label: "Kurz (2-3 min)" },
  { id: "medium", label: "Mittel (5-7 min)" },
  { id: "long", label: "Lang (10-15 min)" },
];

function StoryTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const [mode, setMode] = useState<StoryInputMode>(project.storyText ? "text" : "ai");
  const [text, setText] = useState(project.storyText || "");
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // AI generation state
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState("warm");
  const [length, setLength] = useState("medium");
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
      body: JSON.stringify({ name, storyText: text, storySource: mode === "ai" ? "ai" : "typed" }),
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

    // Use project characters if available, otherwise KoalaTree defaults
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
      : [
          { id: "koda", name: "Koda", markerId: "[KODA]", role: "lead" as const, personality: "weise, warm, geduldig", species: "Koala", speakingStyle: "langsam und bedaechtig" },
          { id: "kiki", name: "Kiki", markerId: "[KIKI]", role: "supporting" as const, personality: "frech, keck, witzig", species: "Kookaburra", speakingStyle: "schnell und aufgeregt" },
          { id: "luna", name: "Luna", markerId: "[LUNA]", role: "supporting" as const, personality: "sanft, traeumerisch, mysterioes", species: "Eule", speakingStyle: "leise und poetisch" },
          { id: "mika", name: "Mika", markerId: "[MIKA]", role: "supporting" as const, personality: "mutig, abenteuerlustig, wild", species: "Dingo", speakingStyle: "energisch und begeistert" },
        ];

    const brief = {
      theme,
      tone,
      length,
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
          className="w-full text-sm bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80"
        />
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

          {/* Tone + Length */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Stimmung</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70">
                {TONE_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Laenge</label>
              <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/70">
                {LENGTH_OPTIONS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
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
  const [atmosphere, setAtmosphere] = useState(project.atmosphere || DEFAULT_ATMOSPHERE);
  const [customAtmo, setCustomAtmo] = useState("");
  const [screenplayMode, setScreenplayMode] = useState<"film" | "hoerspiel" | "audiobook">("film");
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
      body: JSON.stringify({ directingStyle, atmosphere }),
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
          force,
        }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) { setError("Kein Stream"); setGenerating(false); return; }

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
            if (data.progress) setProgress(data.progress);
            if (data.error) setError(data.error);
            if (data.done && !data.error) {
              setResult({ sequences: data.sequences || 0, scenes: data.scenes || 0 });
            }
          } catch { /* ignore parse errors */ }
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

  return (
    <div className="space-y-5">
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

function CharacterCard({ character, projectId, onUpdate }: { character: Character; projectId: string; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);

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

  const inputId = `portrait-${character.id}`;

  return (
    <div className="card p-3 text-center group relative">
      {/* Portrait with upload overlay */}
      <div className="relative mx-auto w-14 h-14">
        {character.portraitUrl ? (
          <img
            src={portraitSrc(character.portraitUrl)}
            alt={character.name}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
            <span className="text-2xl">{character.emoji || "🎭"}</span>
          </div>
        )}
        {/* Upload overlay */}
        <label
          htmlFor={inputId}
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-white text-[10px]">📷</span>
          )}
        </label>
        <input id={inputId} type="file" accept="image/*" onChange={handlePortraitUpload} className="hidden" />
      </div>

      <p className="text-xs font-medium text-[#f5eed6] mt-1.5">{character.name}</p>
      <p className="text-[8px] text-white/30">
        {character.role === "lead" ? "Hauptrolle" :
         character.role === "narrator" ? "Erzaehler" :
         character.role === "minor" ? "Statistin" : "Nebenrolle"}
      </p>
      {character.markerId && (
        <p className="text-[8px] text-white/15 mt-0.5 font-mono">{character.markerId}</p>
      )}
      {!character.portraitUrl && (
        <p className="text-[7px] text-red-300/50 mt-1">Kein Portrait</p>
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
        <div className="px-3 pb-2 space-y-1.5 border-t border-white/5 pt-2">
          {sequence.scenes.map((scene, si) => {
            const char = scene.characterId ? charMap.get(scene.characterId) : null;
            return (
              <div key={scene.id || si} className="flex items-start gap-2 text-[10px]">
                <span className="text-white/15 w-4 text-right shrink-0">{si + 1}</span>
                <span className={`shrink-0 px-1 py-0.5 rounded text-[8px] ${
                  scene.type === "dialog" ? "bg-blue-500/15 text-blue-300" :
                  scene.type === "landscape" ? "bg-green-500/15 text-green-300" :
                  scene.type === "transition" ? "bg-purple-500/15 text-purple-300" :
                  "bg-white/5 text-white/20"
                }`}>{scene.type}</span>
                {char && <span className="text-[9px] text-white/30">{char.emoji || ""} {char.name}</span>}
                <span className="text-white/35 flex-1 truncate">{scene.sceneDescription?.slice(0, 80)}</span>
              </div>
            );
          })}
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
            <CharacterCard key={c.id} character={c} projectId={project.id} onUpdate={() => onUpdate(project.id)} />
          ))}
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
        body: JSON.stringify({ format: "portrait" }),
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
              <video src={project.videoUrl || filmUrl} controls className="w-full rounded-xl max-h-[400px]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Landscape Section (within SequenceCard) ────────────────────────

function LandscapeSection({ sequence, projectId, onUpdate }: { sequence: Sequence; projectId: string; onUpdate: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const generateLandscape = async () => {
    setGenerating(true);
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}/landscape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: customPrompt || undefined }),
      });
      onUpdate();
    } catch { /* */ }
    setGenerating(false);
  };

  const uploadLandscape = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await fetch(`/api/studio/projects/${projectId}/sequences/${sequence.id}/landscape`, {
        method: "POST",
        body: formData,
      });
      onUpdate();
    } catch { /* */ }
    setUploading(false);
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
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 rounded-lg transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); generateLandscape(); }} disabled={generating} className="text-[9px] px-2 py-1 bg-white/20 text-white rounded">
                {generating ? "..." : "🔄 Neu"}
              </button>
              <label className="text-[9px] px-2 py-1 bg-white/20 text-white rounded cursor-pointer" onClick={(e) => e.stopPropagation()}>
                📷 Upload
                <input type="file" accept="image/*" onChange={uploadLandscape} className="hidden" />
              </label>
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
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="text-[9px] px-2.5 py-1.5 bg-[#d4a853]/15 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/25"
          >
            {generating ? "Generiert..." : "🎨 AI Landscape"}
          </button>
          <label className="text-[9px] px-2.5 py-1.5 bg-white/5 text-white/30 rounded-lg hover:text-white/50 cursor-pointer">
            {uploading ? "..." : "📷 Upload"}
            <input type="file" accept="image/*" onChange={uploadLandscape} className="hidden" />
          </label>
        </div>
      )}
      {showPrompt && !sequence.landscapeRefUrl && (
        <div className="mt-2 flex gap-2">
          <input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={`z.B. ${sequence.location || "Magischer Wald"} bei Sonnenuntergang`}
            className="flex-1 text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/60 placeholder-white/20"
          />
          <button
            onClick={generateLandscape}
            disabled={generating}
            className="text-[9px] px-3 py-1.5 bg-[#d4a853] text-black rounded-lg font-medium disabled:opacity-50"
          >
            {generating ? "..." : "Generieren"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sequence Card (within Production Tab) ──────────────────────────

function SequenceCard({
  sequence,
  index,
  projectId,
  onUpdate,
}: {
  sequence: Sequence;
  index: number;
  projectId: string;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [clipGenerating, setClipGenerating] = useState(false);
  const [generatingSceneIdx, setGeneratingSceneIdx] = useState<number | null>(null);
  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [clipQuality, setClipQuality] = useState<"standard" | "premium">("standard");
  const [visualStyle, setVisualStyle] = useState("disney-2d");
  const [customStylePrompt, setCustomStylePrompt] = useState("");
  const resolvedStyle = visualStyle === "custom"
    ? customStylePrompt
    : VISUAL_STYLES.find((s) => s.id === visualStyle)?.prompt || "";
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Cost estimation
  const sceneCount = sequence.sceneCount || sequence.scenes?.length || 0;
  const dialogScenes = sequence.scenes?.filter((s) => s.type === "dialog").length || Math.ceil(sceneCount * 0.6);
  const landscapeScenes = sceneCount - dialogScenes;
  // Cost per ~5s clip: Dialog=Kling Avatar ~$0.28, Landscape=Seedance ~$0.13
  // Premium: Dialog=Veo+LipSync ~$0.55, Landscape=Kling Pro ~$0.84
  const estimatedCost = clipQuality === "premium"
    ? dialogScenes * 1.50 + landscapeScenes * 1.50  // Seedance 2.0 (~$0.30/s × 5s)
    : dialogScenes * 0.32 + landscapeScenes * 0.25; // Veo Lite+LipSync / Seedance 1.5

  const generateAudio = async () => {
    setAudioGenerating(true);
    setProgress("Starte Audio...");
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/studio/projects/${projectId}/sequences/${sequence.id}/audio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
          signal: controller.signal,
        },
      );

      await consumeSSE(res, {
        onProgress: setProgress,
        onError: setError,
        onDone: () => onUpdate(),
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    }

    setAudioGenerating(false);
    setProgress("");
    abortRef.current = null;
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
      await consumeSSE(res, {
        onProgress: (p) => setProgress(`Clip ${sceneIndex + 1}: ${p}`),
        onError: setError,
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
    setShowCostConfirm(true);
    setError("");
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

  const isGenerating = audioGenerating || clipGenerating;
  const canGenerateAudio = sequence.status === "storyboard" || sequence.status === "draft";
  const canGenerateClips = ["audio", "clips"].includes(sequence.status);

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
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {canGenerateAudio && !isGenerating && (
              <button
                onClick={generateAudio}
                className="text-[10px] px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30"
              >
                🔊 Audio generieren
              </button>
            )}
            {canGenerateClips && !isGenerating && !showCostConfirm && (
              <button
                onClick={startClipGeneration}
                className="text-[10px] px-3 py-1.5 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30"
              >
                🎬 Clips generieren
              </button>
            )}
            {sequence.status === "audio" && !isGenerating && (
              <button
                onClick={generateAudio}
                className="text-[10px] px-3 py-1.5 bg-white/5 text-white/30 rounded-lg hover:text-white/50"
              >
                🔄 Audio neu
              </button>
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

          {/* Cost Confirmation + Style Selection */}
          {showCostConfirm && (
            <div className="bg-[#d4a853]/10 border border-[#d4a853]/20 rounded-xl p-3 space-y-3">
              <p className="text-xs font-medium text-[#d4a853]">Clip-Einstellungen</p>

              {/* Visual Style */}
              <div>
                <p className="text-[9px] text-white/30 mb-1">Visueller Style</p>
                <div className="flex flex-wrap gap-1.5">
                  {VISUAL_STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setVisualStyle(s.id)}
                      className={`text-[9px] px-2.5 py-1 rounded-lg transition-all ${
                        visualStyle === s.id
                          ? "bg-[#d4a853]/30 text-[#d4a853] font-medium"
                          : "bg-white/5 text-white/35 hover:text-white/60"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {visualStyle === "custom" && (
                  <input
                    value={customStylePrompt}
                    onChange={(e) => setCustomStylePrompt(e.target.value)}
                    placeholder="Beschreibe den visuellen Style..."
                    className="w-full mt-1.5 text-[10px] bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/60 placeholder-white/20"
                  />
                )}
              </div>

              {/* Quality + Cost */}
              <div className="text-[10px] text-white/50 space-y-0.5">
                <p>{dialogScenes} Dialog-Szenen · {landscapeScenes} Landscape-Szenen</p>
                <p>Qualitaet: <select value={clipQuality} onChange={(e) => setClipQuality(e.target.value as "standard" | "premium")} className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/60 text-[10px]">
                  <option value="standard">Standard (~${(dialogScenes * 0.32 + landscapeScenes * 0.25).toFixed(2)})</option>
                  <option value="premium">Premium (~${(dialogScenes * 1.50 + landscapeScenes * 1.50).toFixed(2)})</option>
                </select></p>
                <p className="text-[#d4a853] font-medium mt-1">
                  Geschaetzte Kosten: ~${estimatedCost.toFixed(2)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={confirmAndGenerateClips}
                  className="text-[10px] px-3 py-1.5 bg-[#d4a853] text-black rounded-lg font-medium hover:bg-[#e4b863]"
                >
                  Bestaetigen & Generieren
                </button>
                <button
                  onClick={() => setShowCostConfirm(false)}
                  className="text-[10px] px-3 py-1.5 text-white/30 hover:text-white/50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Audio Player */}
          {sequence.audioUrl && !isGenerating && (
            <div>
              <p className="text-[9px] text-white/25 mb-1">
                Audio ({sequence.audioDauerSek ? `${Math.round(sequence.audioDauerSek)}s` : ""})
              </p>
              <audio
                controls
                src={`/api/studio/blob?url=${encodeURIComponent(sequence.audioUrl)}`}
                className="w-full h-8 opacity-70"
              />
            </div>
          )}

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

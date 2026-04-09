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
}

interface Project {
  id: string;
  name: string;
  status: string;
  storyText?: string;
  directingStyle?: string;
  atmosphere?: string;
  language?: string;
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
              onClick={() => { setSelectedProject(p); setActiveTab("story"); }}
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
              <ProductionTab project={selectedProject} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

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

function StoryTab({ project, onUpdate }: { project: Project; onUpdate: (id: string) => void }) {
  const [text, setText] = useState(project.storyText || "");
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset when project changes
  useEffect(() => {
    setText(project.storyText || "");
    setName(project.name);
  }, [project.id, project.storyText, project.name]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/studio/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, storyText: text, storySource: "typed" }),
    });
    onUpdate(project.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

      {/* Story Text */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">
          Geschichte
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Paste oder schreibe deine Geschichte hier...\n\nVerwende Charakter-Marker wie [KODA], [KIKI] etc."}
          rows={12}
          className="w-full text-sm bg-white/5 border border-white/10 rounded-xl p-3 text-white/80 placeholder-white/20 resize-y"
        />
        <p className="text-[9px] text-white/20 mt-1">
          {wordCount} Woerter · ~{Math.ceil(wordCount * 0.4)}s Audio
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || (!text.trim() && !name.trim())}
          className="px-4 py-2 rounded-xl bg-[#4a7c59] text-white text-xs font-medium hover:bg-[#5a8c69] disabled:opacity-50"
        >
          {saving ? "Speichert..." : "Speichern"}
        </button>
        {saved && <span className="text-[10px] text-[#a8d5b8]">Gespeichert!</span>}
      </div>
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

      {/* Existing sequences preview */}
      {project.sequences.length > 0 && !generating && (
        <div>
          <h4 className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Sequenzen</h4>
          <div className="space-y-1.5">
            {project.sequences
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((seq, i) => (
                <div key={seq.id} className="flex items-center gap-2 text-xs text-white/50">
                  <span className="text-white/20 w-5 text-right">{i + 1}.</span>
                  <span className="text-white/60">{seq.name}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full ml-auto ${
                    seq.status === "mastered" ? "bg-[#a8d5b8]/20 text-[#a8d5b8]" :
                    seq.status === "clips" ? "bg-[#d4a853]/20 text-[#d4a853]" :
                    "bg-white/5 text-white/30"
                  }`}>
                    {seq.status}
                  </span>
                </div>
              ))}
          </div>
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
            <div key={c.id} className="card p-3 text-center group relative">
              {c.portraitUrl ? (
                <img
                  src={c.portraitUrl}
                  alt={c.name}
                  className="w-12 h-12 rounded-full mx-auto object-cover"
                />
              ) : (
                <span className="text-2xl block">{c.emoji || "🎭"}</span>
              )}
              <p className="text-xs font-medium text-[#f5eed6] mt-1.5">{c.name}</p>
              <p className="text-[8px] text-white/30">
                {c.role === "lead" ? "Hauptrolle" :
                 c.role === "narrator" ? "Erzaehler" :
                 c.role === "minor" ? "Statistin" : "Nebenrolle"}
              </p>
              {c.markerId && (
                <p className="text-[8px] text-white/15 mt-0.5 font-mono">{c.markerId}</p>
              )}
            </div>
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
            {extracting ? "Extrahiere..." : "🔄 Charaktere neu extrahieren (ueberschreibt nicht)"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Production Tab ─────────────────────────────────────────────────

function ProductionTab({ project }: { project: Project }) {
  const totalSequences = project.sequences.length;
  const masteredCount = project.sequences.filter((s) => s.status === "mastered").length;
  const clipsCount = project.sequences.filter((s) => s.status === "clips").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#f5eed6]">Produktion</h3>
        {totalSequences > 0 && (
          <div className="text-[10px] text-white/30">
            {masteredCount}/{totalSequences} fertig
            {clipsCount > 0 && ` · ${clipsCount} in Arbeit`}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {totalSequences > 0 && (
        <div className="mb-4">
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#a8d5b8] rounded-full transition-all"
              style={{ width: `${(masteredCount / totalSequences) * 100}%` }}
            />
          </div>
        </div>
      )}

      {totalSequences === 0 ? (
        <div className="text-center py-6 text-white/30 text-sm">
          <p>Zuerst ein Drehbuch generieren (Tab &apos;Drehbuch&apos;).</p>
        </div>
      ) : (
        <div className="space-y-3">
          {project.sequences
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((seq, i) => (
              <div key={seq.id} className="card p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-white/20 w-5 text-right">{i + 1}</span>
                    <div>
                      <p className="text-xs font-medium text-[#f5eed6]">{seq.name}</p>
                      <p className="text-[8px] text-white/25">
                        {seq.location && `${seq.location} · `}
                        {seq.sceneCount ? `${seq.sceneCount} Szenen` : seq.status}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[8px] px-2 py-0.5 rounded-full ${
                    seq.status === "mastered" ? "bg-[#a8d5b8]/20 text-[#a8d5b8]" :
                    seq.status === "clips" ? "bg-[#d4a853]/20 text-[#d4a853]" :
                    seq.status === "audio" ? "bg-blue-500/20 text-blue-300" :
                    "bg-white/5 text-white/30"
                  }`}>
                    {seq.status === "mastered" ? "Fertig" :
                     seq.status === "clips" ? "Clips" :
                     seq.status === "audio" ? "Audio" :
                     seq.status === "storyboard" ? "Storyboard" :
                     "Entwurf"}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Future: Batch generation controls will go here */}
      {totalSequences > 0 && masteredCount < totalSequences && (
        <div className="mt-4 pt-3 border-t border-white/5 text-center">
          <p className="text-[10px] text-white/20">
            Audio- und Clip-Generierung kommt im naechsten Update.
          </p>
        </div>
      )}
    </div>
  );
}

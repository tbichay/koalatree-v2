"use client";

/**
 * LipSync Pipeline Comparison — UI for the /api/studio/test-lipsync-spike endpoint.
 *
 * Lets the user pick one dialog scene from their projects and run 4 variants in parallel:
 *   A — Kling O3 + Kling LipSync (baseline, current production)
 *   B — Kling O3 + Sync Labs v3 (post-proc upgrade)
 *   C — ByteDance OmniHuman 1.5 (portrait + audio talking head)
 *   D — ByteDance Seedance 2.0 Reference-to-Video (all-in-one multimodal)
 *
 * Results shown side-by-side as video players so the user can pick a winner.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ToastProvider, useToast } from "@/app/components/Toasts";

// ── Types ──────────────────────────────────────────────────────

type Variant = "A" | "B" | "C" | "D";

interface SceneLite {
  id: string;
  index: number;
  type: string;
  characterId?: string;
  spokenText?: string;
  sceneDescription?: string;
  dialogAudioUrl?: string;
  audioStartMs?: number;
  audioEndMs?: number;
}

interface SequenceLite {
  id: string;
  name: string;
  orderIndex: number;
  location?: string;
  landscapeRefUrl?: string;
  scenes?: SceneLite[];
}

interface CharacterLite {
  id: string;
  name: string;
  emoji?: string;
  portraitUrl?: string;
}

interface ProjectLite {
  id: string;
  name: string;
  characters: CharacterLite[];
  sequences: SequenceLite[];
}

interface DialogSceneOption {
  projectId: string;
  projectName: string;
  sequenceId: string;
  sequenceName: string;
  sceneIndex: number;
  characterName: string;
  characterEmoji?: string;
  audioSec: number;
  textPreview: string;
}

interface VariantResult {
  label: string;
  provider: string;
  url?: string;
  cost?: number;
  durationMs: number;
  error?: string;
}

interface SpikeResponse {
  sceneIndex: number;
  character: string;
  audioSec: number;
  clipSec: number;
  testRunId: number;
  results: Partial<Record<Variant, VariantResult>>;
}

const ALL_VARIANTS: Variant[] = ["A", "B", "C", "D"];

const VARIANT_INFO: Record<Variant, { title: string; hint: string }> = {
  A: {
    title: "Kling O3 + Kling LipSync",
    hint: "Baseline — zeigt den aktuellen Flimmer-Effekt (chunk inpaint).",
  },
  B: {
    title: "Kling O3 + Sync Labs v3",
    hint: "Upgrade — globaler Kontext, soll Flicker eliminieren.",
  },
  C: {
    title: "OmniHuman 1.5",
    hint: "Talking Head aus Portrait + Audio (ByteDance). Keine Szenen-Kontrolle.",
  },
  D: {
    title: "Seedance 2.0 Ref-to-Video",
    hint: "Multimodal all-in-one: 3 Charakter-Refs + Location + Audio.",
  },
};

// ── Inner page (needs ToastProvider) ──────────────────────────

function TestLipSyncPageInner() {
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectLite[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [variants, setVariants] = useState<Record<Variant, boolean>>({
    A: true,
    B: true,
    C: true,
    D: true,
  });
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [result, setResult] = useState<SpikeResponse | null>(null);

  // Load projects on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/studio/projects");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { projects: ProjectLite[] };
        setProjects(data.projects || []);
      } catch (err) {
        toast.error(`Projekte laden fehlgeschlagen: ${(err as Error).message}`);
        setProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [toast]);

  // Running timer
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [startedAt]);

  // Derive the flat list of eligible dialog scenes across all projects
  const dialogScenes: DialogSceneOption[] = useMemo(() => {
    if (!projects) return [];
    const out: DialogSceneOption[] = [];
    for (const p of projects) {
      for (const seq of p.sequences || []) {
        for (const scene of seq.scenes || []) {
          if (scene.type !== "dialog") continue;
          if (!scene.dialogAudioUrl) continue;
          if (!scene.characterId) continue;
          const char = p.characters.find((c) => c.id === scene.characterId);
          const audioSec = ((scene.audioEndMs || 0) - (scene.audioStartMs || 0)) / 1000;
          const text = (scene.spokenText || scene.sceneDescription || "").trim();
          out.push({
            projectId: p.id,
            projectName: p.name || "Unbenannt",
            sequenceId: seq.id,
            sequenceName: seq.name || `Sequenz ${seq.orderIndex + 1}`,
            sceneIndex: scene.index,
            characterName: char?.name || "?",
            characterEmoji: char?.emoji,
            audioSec,
            textPreview: text.length > 80 ? text.slice(0, 80) + "…" : text,
          });
        }
      }
    }
    return out;
  }, [projects]);

  const selectedScene = useMemo(
    () => dialogScenes.find((s) => sceneKey(s) === selectedKey),
    [dialogScenes, selectedKey],
  );

  async function runTest() {
    if (!selectedScene) {
      toast.error("Bitte erst eine Dialog-Szene auswaehlen");
      return;
    }
    const picked = ALL_VARIANTS.filter((v) => variants[v]);
    if (picked.length === 0) {
      toast.error("Mindestens eine Variante auswaehlen");
      return;
    }

    setRunning(true);
    setResult(null);
    setStartedAt(Date.now());
    setElapsedSec(0);

    const tid = toast.loading(`Teste ${picked.length} Varianten parallel — kann 5-10 Min dauern…`);
    try {
      const res = await fetch("/api/studio/test-lipsync-spike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedScene.projectId,
          sequenceId: selectedScene.sequenceId,
          sceneIndex: selectedScene.sceneIndex,
          variants: picked,
        }),
      });
      const data = await res.json() as SpikeResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(data);
      const ok = Object.values(data.results || {}).filter((r) => r && !r.error).length;
      const fail = Object.values(data.results || {}).filter((r) => r && r.error).length;
      if (fail > 0) toast.error(`${ok} ok, ${fail} fehlgeschlagen`, tid);
      else toast.success(`${ok} Varianten fertig!`, tid);
    } catch (err) {
      toast.error(`Fehler: ${(err as Error).message}`, tid);
    } finally {
      setRunning(false);
      setStartedAt(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#141414", color: "#E8E8E8" }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/studio"
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            ← Studio
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#f5eed6] mt-2">
            LipSync Pipeline Vergleich
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Eine Dialog-Szene durch 4 Pipelines — Side-by-Side-Vergleich zum
            datenbasierten Entscheiden.
          </p>
        </div>

        {/* Controls */}
        <div className="card p-5 mb-6">
          <div className="grid gap-5">
            {/* Scene picker */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                Dialog-Szene
              </label>
              {loadingProjects ? (
                <div className="text-sm text-white/40">Lade Projekte…</div>
              ) : dialogScenes.length === 0 ? (
                <div className="text-sm text-[#d4a853]">
                  Keine Dialog-Szene mit generiertem Audio gefunden. In der{" "}
                  <Link href="/studio/engine" className="underline">
                    Engine
                  </Link>{" "}
                  zuerst Audio generieren.
                </div>
              ) : (
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  disabled={running}
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-[#E8E8E8] focus:border-[#4a7c59] focus:outline-none disabled:opacity-50"
                >
                  <option value="">— Szene waehlen —</option>
                  {dialogScenes.map((s) => (
                    <option key={sceneKey(s)} value={sceneKey(s)}>
                      {s.characterEmoji ? s.characterEmoji + " " : ""}
                      {s.characterName} • {s.audioSec.toFixed(1)}s • {s.projectName} /{" "}
                      {s.sequenceName} #{s.sceneIndex}
                      {s.textPreview ? ` — "${s.textPreview}"` : ""}
                    </option>
                  ))}
                </select>
              )}
              {selectedScene && (
                <div className="mt-2 text-xs text-white/50">
                  Audio-Laenge: <span className="text-[#f5eed6]">{selectedScene.audioSec.toFixed(1)}s</span>
                  {" · "}
                  Geschaetzte Kosten: <span className="text-[#f5eed6]">{estimateCost(selectedScene.audioSec, variants)}</span>
                </div>
              )}
            </div>

            {/* Variant checkboxes */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                Varianten
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_VARIANTS.map((v) => (
                  <label
                    key={v}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      variants[v]
                        ? "border-[#4a7c59]/40 bg-[#4a7c59]/5"
                        : "border-[#2A2A2A] bg-[#1E1E1E]"
                    } ${running ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={variants[v]}
                      disabled={running}
                      onChange={(e) =>
                        setVariants((prev) => ({ ...prev, [v]: e.target.checked }))
                      }
                      className="mt-0.5 accent-[#4a7c59]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#f5eed6]">
                        {v}. {VARIANT_INFO[v].title}
                      </div>
                      <div className="text-[11px] text-white/40 mt-0.5">
                        {VARIANT_INFO[v].hint}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Run button */}
            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={runTest}
                disabled={running || !selectedScene || !Object.values(variants).some(Boolean)}
                className="px-5 py-2.5 rounded-lg text-sm tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: running ? "#2A2A2A" : "#4a7c59",
                  color: "#f5eed6",
                }}
              >
                {running ? `Laeuft seit ${elapsedSec}s…` : "Test starten"}
              </button>
              {running && (
                <span className="text-xs text-white/50">
                  Parallel-Run, kann 5-10 Min dauern — Seite offen lassen.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        {result && <ResultsGrid result={result} />}
      </div>
    </div>
  );
}

// ── Results grid ───────────────────────────────────────────────

function ResultsGrid({ result }: { result: SpikeResponse }) {
  const variants = ALL_VARIANTS.filter((v) => result.results[v]);
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-[#f5eed6]">
          Ergebnisse — {result.character} • {result.audioSec.toFixed(1)}s Audio
        </h2>
        <span className="text-[11px] text-white/30">Run #{result.testRunId}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {variants.map((v) => {
          const r = result.results[v]!;
          const info = VARIANT_INFO[v];
          return (
            <div key={v} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-white/40">Variante {v}</div>
                  <div className="text-sm font-medium text-[#f5eed6]">
                    {info.title}
                  </div>
                </div>
                <div className="text-right text-[11px] text-white/40">
                  {(r.durationMs / 1000).toFixed(1)}s
                  {typeof r.cost === "number" && r.cost > 0 && (
                    <div>${r.cost.toFixed(3)}</div>
                  )}
                </div>
              </div>

              {r.error ? (
                <div className="rounded-lg bg-[#3a1a1a] border border-[#5a2a2a] p-3 text-xs text-[#ff9a9a]">
                  <div className="font-medium mb-1">Fehler</div>
                  <div className="text-white/60 break-all">{r.error}</div>
                </div>
              ) : r.url ? (
                <>
                  <video
                    src={r.url}
                    controls
                    playsInline
                    className="w-full rounded-lg bg-black"
                    style={{ aspectRatio: "16/9" }}
                  />
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-2 text-[11px] text-white/40 hover:text-white/70 truncate"
                  >
                    {r.url}
                  </a>
                </>
              ) : (
                <div className="text-xs text-white/40">Kein Ergebnis</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function sceneKey(s: { projectId: string; sequenceId: string; sceneIndex: number }): string {
  return `${s.projectId}::${s.sequenceId}::${s.sceneIndex}`;
}

function estimateCost(audioSec: number, enabled: Record<Variant, boolean>): string {
  // Rough estimates — must match runners in the spike route
  const clipSec = Math.max(4, Math.ceil(audioSec + 1.0));
  let total = 0;
  if (enabled.A) total += 0.084 * clipSec + 0.014 * clipSec;
  if (enabled.B) total += 0.084 * clipSec + 0.133 * clipSec;
  if (enabled.C) total += 0.16 * clipSec;
  if (enabled.D) total += 0; // Seedance price unknown here
  return `~$${total.toFixed(2)}`;
}

// ── Default export ─────────────────────────────────────────────

export default function TestLipSyncPage() {
  return (
    <ToastProvider>
      <TestLipSyncPageInner />
    </ToastProvider>
  );
}

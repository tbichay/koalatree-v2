"use client";

/**
 * Wan 2.7 Spike — Preset-mode UI.
 *
 * User picks ONE character (must have voice config). Presets are hardcoded
 * in the backend route — user only selects which variants to run.
 *
 *   A — Dialog + Prop + Audio lip-sync    (H3, H3b, H8, W5c, W3)
 *   B — Seamless continuation from A      (H4)  [runs after A]
 *   C — Action / Dance (no audio)         (W3, W5d)
 *   D — Singing / Music setting           (W2 video, H3b)
 *   E — Real portrait (opt-in)            (H1b)
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ToastProvider, useToast } from "@/app/components/Toasts";
import { blobProxy } from "@/lib/studio/blob-proxy";

// ── Types ──────────────────────────────────────────────────────

type Variant = "A" | "B" | "C" | "D" | "E";

interface CharacterLite {
  id: string;
  name: string;
  emoji?: string;
  portraitUrl?: string;
  voiceId?: string;
  actorId?: string;
  castSnapshot?: { portraitUrl?: string; voiceId?: string } | null;
}

interface ProjectLite {
  id: string;
  name: string;
  characters: CharacterLite[];
}

interface CharacterOption {
  projectId: string;
  projectName: string;
  characterId: string;
  label: string;
  hasVoice: boolean;
  hasPortrait: boolean;
}

interface VariantResult {
  label: string;
  provider: string;
  url?: string;
  cost?: number;
  durationSec?: number;
  durationMs: number;
  promptUsed?: string;
  dialogText?: string;
  actualPrompt?: string;
  seed?: number;
  error?: string;
  failedStep?: string;
  errorStack?: string;
}

interface HealthCheck {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
  detail?: string;
}

interface SpikeResponse {
  characterId: string;
  characterName: string;
  resolution: "720p" | "1080p";
  testRunId: number;
  totalCostUsd: number;
  maxCostUsd: number;
  anyFailed: boolean;
  results: Partial<Record<Variant, VariantResult>>;
}

const ALL_VARIANTS: Variant[] = ["A", "B", "C", "D", "E"];

// Preset info — MUST stay in sync with PRESETS in the backend route.
const PRESET_INFO: Record<Variant, {
  title: string;
  requirements: string;
  dialogText?: string;
  promptSummary: string;
  needsAudio: boolean;
  targetSec: number;
}> = {
  A: {
    title: "Dialog + Prop + Audio",
    requirements: "H3, H3b, H8, W5c, W3",
    dialogText: "Hallo Freund! Schau mal, ich habe eine magische Eichel gefunden, die sanft in meiner Pfote leuchtet.",
    promptSummary: "Charakter hält goldene leuchtende Eichel, spricht warm in Kamera, Wald-Clearing.",
    needsAudio: true,
    targetSec: 9,
  },
  B: {
    title: "Seamless Continuation (ab A)",
    requirements: "H4",
    promptSummary: "Nimmt A's letzten Frame — Charakter dreht Kopf, schaut off-camera. Kein Audio.",
    needsAudio: false,
    targetSec: 6,
  },
  C: {
    title: "Action / Dance (stumm)",
    requirements: "W3, W5d",
    promptSummary: "Tanzt glücklich, lacht, Ganzkörper-Bewegung, sonnige Wiese. Kein Audio.",
    needsAudio: false,
    targetSec: 7,
  },
  D: {
    title: "Singen / Musik-Setting",
    requirements: "W2 (Video), H3b",
    dialogText: "La la la, die Sonne scheint so schön heute, die Vögel singen auf dem alten Baum. La la la.",
    promptSummary: "Singt in Vintage-Mikrofon, Café-Stage, warmes Licht.",
    needsAudio: true,
    targetSec: 9,
  },
  E: {
    title: "Real Portrait (optional)",
    requirements: "H1b",
    dialogText: "Hallo, schön dich zu sehen. Ich wollte dir nur kurz etwas über meinen Tag heute erzählen.",
    promptSummary: "Echtes Foto → warmer Sprech-Clip. Identität/Kleidung bewahrt.",
    needsAudio: true,
    targetSec: 7,
  },
};

// ── Inner page ─────────────────────────────────────────────────

function TestWanPageInner() {
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectLite[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [variants, setVariants] = useState<Record<Variant, boolean>>({
    A: true, B: true, C: true, D: true, E: false,
  });
  const [realPortraitUrl, setRealPortraitUrl] = useState<string>("");
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [maxCostUsd, setMaxCostUsd] = useState<number>(5);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [result, setResult] = useState<SpikeResponse | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; checks: HealthCheck[] } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Load projects + restore last result on mount
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
    try {
      const cached = localStorage.getItem("wan-spike-last-result");
      if (cached) setResult(JSON.parse(cached));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result) return;
    const hasSuccess = Object.values(result.results).some((r) => r?.url);
    if (hasSuccess) {
      try { localStorage.setItem("wan-spike-last-result", JSON.stringify(result)); } catch {}
    }
  }, [result]);

  async function runHealthCheck() {
    setCheckingHealth(true);
    const tid = toast.loading("Prüfe FAL_KEY und Blob-Token…");
    try {
      const res = await fetch("/api/studio/test-lipsync-spike/health");
      const data = await res.json() as { ok: boolean; checks: HealthCheck[] };
      setHealth(data);
      if (data.ok) toast.success("Alles OK — Test kann laufen", tid);
      else toast.error(`${data.checks.filter((c) => !c.ok).length} Check(s) fehlgeschlagen`, tid);
    } catch (err) {
      toast.error(`Health-Check fehlgeschlagen: ${(err as Error).message}`, tid);
    } finally {
      setCheckingHealth(false);
    }
  }

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [startedAt]);

  // Flat character list (only those with portrait)
  const characterOptions: CharacterOption[] = useMemo(() => {
    if (!projects) return [];
    const out: CharacterOption[] = [];
    for (const p of projects) {
      for (const c of p.characters || []) {
        const hasPortrait = !!(c.portraitUrl || c.castSnapshot?.portraitUrl);
        const hasVoice = !!(c.voiceId || c.castSnapshot?.voiceId);
        if (!hasPortrait) continue; // mandatory
        out.push({
          projectId: p.id,
          projectName: p.name || "Unbenannt",
          characterId: c.id,
          label: `${c.emoji ? c.emoji + " " : ""}${c.name} — ${p.name || "?"}`,
          hasVoice,
          hasPortrait,
        });
      }
    }
    return out;
  }, [projects]);

  const selectedChar = useMemo(
    () => characterOptions.find((c) => charKey(c) === selectedKey),
    [characterOptions, selectedKey],
  );

  const needsVoice = useMemo(
    () => ALL_VARIANTS.some((v) => variants[v] && PRESET_INFO[v].needsAudio),
    [variants],
  );

  const estimatedCost = useMemo(() => {
    return ALL_VARIANTS
      .filter((v) => variants[v])
      .reduce((sum, v) => sum + PRESET_INFO[v].targetSec * 0.10, 0);
  }, [variants]);

  async function runTest() {
    if (!selectedChar) {
      toast.error("Bitte erst einen Charakter wählen");
      return;
    }
    const picked = ALL_VARIANTS.filter((v) => variants[v]);
    if (picked.length === 0) {
      toast.error("Mindestens eine Variante auswählen");
      return;
    }
    if (picked.includes("E") && !realPortraitUrl.trim()) {
      toast.error("Variante E braucht eine Real-Portrait-URL");
      return;
    }
    if (needsVoice && !selectedChar.hasVoice) {
      toast.error(`"${selectedChar.label}" hat keine Voice-Config. Entweder Variante A/D/E abwählen oder Voice im Studio zuweisen.`);
      return;
    }
    if (estimatedCost > maxCostUsd) {
      toast.error(`Est. Kosten $${estimatedCost.toFixed(2)} > Cap $${maxCostUsd}. Cap erhöhen oder Varianten reduzieren.`);
      return;
    }

    setRunning(true);
    setResult(null);
    setStartedAt(Date.now());
    setElapsedSec(0);

    const tid = toast.loading(
      `Wan-Spike (${picked.length} Varianten, ${resolution}) — A/C/D/E parallel, B nach A. ~5–10 Min.`,
    );
    try {
      const res = await fetch("/api/studio/test-wan-spike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedChar.projectId,
          characterId: selectedChar.characterId,
          variants: picked,
          realPortraitUrl: picked.includes("E") ? realPortraitUrl.trim() : undefined,
          resolution,
          maxCostUsd,
        }),
      });
      const data = await res.json() as SpikeResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      const ok = Object.values(data.results || {}).filter((r) => r && !r.error).length;
      const fail = Object.values(data.results || {}).filter((r) => r && r.error).length;
      if (fail > 0) toast.error(`${ok} ok, ${fail} fehlgeschlagen — $${(data.totalCostUsd || 0).toFixed(2)}`, tid);
      else toast.success(`${ok} Varianten fertig — $${(data.totalCostUsd || 0).toFixed(2)}`, tid);
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
          <Link href="/studio" className="text-xs text-white/40 hover:text-white/70 transition-colors">
            ← Studio
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#f5eed6] mt-2">
            Wan 2.7 Spike
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Preset-basiert — Skripte sind fest definiert. Nur Charakter wählen, Varianten anhaken, starten.
            Hard-Cap ${maxCostUsd}, nur Wan 2.7.
          </p>
        </div>

        {/* Controls */}
        <div className="card p-5 mb-6">
          <div className="grid gap-5">
            {/* Character picker */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                Charakter (liefert Portrait + Voice-Config)
              </label>
              {loadingProjects ? (
                <div className="text-sm text-white/40">Lade Projekte…</div>
              ) : characterOptions.length === 0 ? (
                <div className="text-sm text-[#d4a853]">
                  Keine Charaktere mit Portrait gefunden. Im{" "}
                  <Link href="/studio" className="underline">Studio</Link>{" "}
                  zuerst Charakter + Cast einrichten.
                </div>
              ) : (
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  disabled={running}
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-[#E8E8E8] focus:border-[#4a7c59] focus:outline-none disabled:opacity-50"
                >
                  <option value="">— Charakter wählen —</option>
                  {characterOptions.map((c) => (
                    <option key={charKey(c)} value={charKey(c)}>
                      {c.label} {c.hasVoice ? "" : "⚠ keine Voice"}
                    </option>
                  ))}
                </select>
              )}
              {selectedChar && needsVoice && !selectedChar.hasVoice && (
                <div className="mt-2 text-[11px] text-[#d4a853]">
                  ⚠ Dieser Charakter hat keine Voice-Config. Varianten mit Audio (A, D, E) werden fehlschlagen.
                </div>
              )}
            </div>

            {/* Variant presets */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                Varianten (Skripte fest — einfach ankreuzen)
              </label>
              <div className="grid grid-cols-1 gap-2">
                {ALL_VARIANTS.map((v) => {
                  const info = PRESET_INFO[v];
                  return (
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
                        onChange={(e) => setVariants((prev) => ({ ...prev, [v]: e.target.checked }))}
                        className="mt-0.5 accent-[#4a7c59]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <div className="text-sm font-medium text-[#f5eed6]">
                            {v}. {info.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] whitespace-nowrap">
                            <span className="text-[#a8d5b8]/70 font-mono">{info.requirements}</span>
                            <span className="text-white/30">•</span>
                            <span className="text-white/40">{info.targetSec}s • ${(info.targetSec * 0.10).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-white/50 mt-1">
                          {info.promptSummary}
                        </div>
                        {info.dialogText && (
                          <div className="text-[11px] text-[#e0d9bf]/80 mt-1 italic">
                            🎙️ „{info.dialogText}"
                          </div>
                        )}
                        {!info.needsAudio && (
                          <div className="text-[10px] text-white/40 mt-1">kein Audio</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Real portrait URL (only when E enabled) */}
            {variants.E && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                  Real-Portrait-URL (für Variante E)
                </label>
                <input
                  type="url"
                  value={realPortraitUrl}
                  onChange={(e) => setRealPortraitUrl(e.target.value)}
                  disabled={running}
                  placeholder="https://… öffentlich erreichbares JPG/PNG"
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-[#E8E8E8] focus:border-[#4a7c59] focus:outline-none disabled:opacity-50"
                />
                <p className="text-[11px] text-white/40 mt-1">
                  Muss für externe Provider erreichbar sein. Vercel-Blob private-URLs gehen nicht.
                </p>
              </div>
            )}

            {/* Resolution + cost cap */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                  Resolution
                </label>
                <div className="flex gap-2">
                  {(["720p", "1080p"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      disabled={running}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                        resolution === r
                          ? "bg-[#4a7c59] text-[#f5eed6]"
                          : "bg-[#1E1E1E] border border-[#2A2A2A] text-white/60 hover:text-[#f5eed6]"
                      } disabled:opacity-50`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/40 mt-1">
                  Preis gleich ($0.10/s). 720p schneller.
                </p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
                  Hard Cost Cap (USD)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={maxCostUsd}
                  onChange={(e) => setMaxCostUsd(Number(e.target.value) || 5)}
                  disabled={running}
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-[#E8E8E8] focus:border-[#4a7c59] focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Cost preview */}
            {Object.values(variants).some(Boolean) && (
              <div className="rounded-lg bg-[#1E1E1E] border border-[#2A2A2A] p-3 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="text-white/50">
                    Geschätzte Kosten ({ALL_VARIANTS.filter((v) => variants[v]).length} Varianten, Wan)
                  </span>
                  <span className={estimatedCost > maxCostUsd ? "text-red-300" : "text-[#f5eed6]"}>
                    ~${estimatedCost.toFixed(2)} / cap ${maxCostUsd.toFixed(2)}
                  </span>
                </div>
                <div className="text-[10px] text-white/40 mt-1">
                  + ElevenLabs TTS (~$0.10 gesamt für alle Audio-Varianten)
                </div>
              </div>
            )}

            {/* Run + Health buttons */}
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <button
                type="button"
                onClick={runTest}
                disabled={running || !selectedChar || !Object.values(variants).some(Boolean)}
                className="px-5 py-2.5 rounded-lg text-sm tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: running ? "#2A2A2A" : "#4a7c59", color: "#f5eed6" }}
              >
                {running ? `Läuft seit ${elapsedSec}s…` : "Wan-Spike starten"}
              </button>
              <button
                type="button"
                onClick={runHealthCheck}
                disabled={checkingHealth || running}
                className="px-4 py-2.5 rounded-lg text-xs tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-[#2A2A2A] text-white/70 hover:text-[#f5eed6] hover:border-[#4a7c59]/50"
              >
                {checkingHealth ? "Prüfe…" : "Health-Check (FAL + Blob)"}
              </button>
              {running && (
                <span className="text-xs text-white/50">
                  Seite offen lassen. B wartet auf A.
                </span>
              )}
            </div>

            {/* Health check output */}
            {health && (
              <div className={`rounded-lg p-3 text-xs border ${health.ok ? "border-[#3d6b4a]/40 bg-[#1a2e1a]/40" : "border-red-500/30 bg-[#2e1a1a]/40"}`}>
                <div className={`font-medium mb-2 ${health.ok ? "text-[#a8d5b8]" : "text-red-300"}`}>
                  {health.ok ? "✓ Alle Checks OK" : "✗ Mindestens ein Check hat Forbidden/Error"}
                </div>
                <div className="space-y-1">
                  {health.checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={c.ok ? "text-[#a8d5b8]" : "text-red-300"}>{c.ok ? "✓" : "✗"}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[#f5eed6]">{c.name}</span>
                        <span className="text-white/40 ml-2">({c.ms}ms)</span>
                        {c.error && <div className="text-red-300/80 mt-0.5 break-all">{c.error}</div>}
                        {c.detail && <div className="text-white/30 mt-0.5 break-all text-[10px]">{c.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
      <div className="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-medium text-[#f5eed6]">
          Ergebnisse — {result.characterName} • {result.resolution}
        </h2>
        <div className="text-[11px] text-white/40 flex items-center gap-3">
          <span>Total: ${result.totalCostUsd.toFixed(2)}</span>
          <span>Run #{result.testRunId}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {variants.map((v) => {
          const r = result.results[v]!;
          const info = PRESET_INFO[v];
          return (
            <div key={v} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-white/40">Variante {v}</div>
                  <div className="text-sm font-medium text-[#f5eed6]">{info.title}</div>
                  <div className="text-[10px] text-[#a8d5b8]/70 mt-0.5 font-mono">{info.requirements}</div>
                </div>
                <div className="text-right text-[11px] text-white/40">
                  {(r.durationMs / 1000).toFixed(1)}s gen
                  {typeof r.cost === "number" && r.cost > 0 && (
                    <div>${r.cost.toFixed(2)}</div>
                  )}
                  {r.durationSec && <div>{r.durationSec}s clip</div>}
                </div>
              </div>

              {r.error ? (
                <div className="rounded-lg bg-[#3a1a1a] border border-[#5a2a2a] p-3 text-xs text-[#ff9a9a]">
                  <div className="font-medium mb-1">Fehler</div>
                  {r.failedStep && (
                    <div className="text-[10px] text-white/50 mb-1">
                      <span className="text-white/30">Schritt:</span> {r.failedStep}
                    </div>
                  )}
                  <div className="text-white/80 mb-2">{parseFalError(r.error)}</div>
                  <details>
                    <summary className="cursor-pointer text-white/40 hover:text-white/60 text-[10px]">
                      Raw + Stack
                    </summary>
                    <div className="mt-1 text-white/40 break-all text-[10px]">{r.error}</div>
                    {r.errorStack && (
                      <pre className="mt-1 text-white/30 text-[10px] whitespace-pre-wrap">{r.errorStack}</pre>
                    )}
                  </details>
                </div>
              ) : r.url ? (
                <>
                  <video
                    src={blobProxy(r.url)}
                    controls
                    playsInline
                    className="w-full rounded-lg bg-black"
                    style={{ aspectRatio: "9/16", maxHeight: "480px" }}
                  />
                  <a
                    href={blobProxy(r.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-2 text-[11px] text-white/40 hover:text-white/70 truncate"
                  >
                    Video öffnen ↗
                  </a>
                  {r.dialogText && (
                    <div className="mt-2 text-[11px] text-[#e0d9bf]/70 italic">
                      🎙️ „{r.dialogText}"
                    </div>
                  )}
                  {r.actualPrompt && r.actualPrompt !== r.promptUsed && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10px] text-white/40 hover:text-white/60">
                        Wan-rewrite-Prompt
                      </summary>
                      <div className="mt-1 text-[10px] text-white/50 whitespace-pre-wrap break-words">
                        {r.actualPrompt}
                      </div>
                    </details>
                  )}
                  {r.promptUsed && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-white/40 hover:text-white/60">
                        Unser Prompt
                      </summary>
                      <div className="mt-1 text-[10px] text-white/50 whitespace-pre-wrap break-words">
                        {r.promptUsed}
                      </div>
                    </details>
                  )}
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

function charKey(c: { projectId: string; characterId: string }): string {
  return `${c.projectId}::${c.characterId}`;
}

function parseFalError(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return raw;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed.detail && Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail[0].msg;
    }
    if (typeof parsed.detail === "string") return parsed.detail;
    if (parsed.message) return parsed.message;
  } catch {}
  return raw;
}

// ── Default export ─────────────────────────────────────────────

export default function TestWanPage() {
  return (
    <ToastProvider>
      <TestWanPageInner />
    </ToastProvider>
  );
}

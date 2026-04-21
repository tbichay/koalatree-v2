"use client";

/**
 * Show-Detail mit Edit-Tabs: Grundlagen, Brand, Cast, Foki, Episoden, Gefahrenzone.
 *
 * Jeder Tab lädt dieselbe Show-Struktur (single GET /api/studio/shows/[slug])
 * und PATCH-updated via entsprechende Nested-Routes. Jede Mutation bumpt
 * die revisionHash server-seitig — UI muss sich darüber keine Gedanken machen.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Actor {
  id: string;
  displayName: string;
  emoji: string | null;
  species: string | null;
  role: string | null;
  expertise: string[];
}

interface FokusTemplate {
  id: string;
  displayName: string;
  emoji: string | null;
  description: string | null;
  minAlter: number;
  maxAlter: number;
}

interface ShowActorRow {
  id: string;
  actorId: string;
  role: string | null;
  styleOverride: string | null;
  orderIndex: number;
  actor: Actor;
}

interface ShowFokusRow {
  id: string;
  fokusTemplateId: string;
  showOverlay: string;
  castRoles: Record<string, unknown>;
  userInputSchema: Record<string, unknown>;
  targetDurationMin: number;
  displayLabel: string | null;
  orderIndex: number;
  enabled: boolean;
  fokusTemplate: FokusTemplate;
}

interface EpisodeRow {
  id: string;
  title: string | null;
  status: string;
  progressPct: number;
  canzoiaJobId: string;
  createdAt: string;
  durationSec: number | null;
}

interface Show {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  category: string;
  ageBand: string | null;
  brandVoice: string;
  palette: Record<string, string> | null;
  coverUrl: string | null;
  trailerAudioUrl: string | null;
  publishedAt: string | null;
  budgetMinutes: number;
  // Feature #4: Continuity-Mode (Serialisierung)
  continuityMode: boolean;
  continuityDepth: number;
  featuredShowFokusId: string | null;
  revisionHash: string;
  updatedAt: string;
  cast: ShowActorRow[];
  foki: ShowFokusRow[];
  episodes: EpisodeRow[];
}

interface ReadinessCheck {
  id: string;
  label: string;
  severity: "blocking" | "warning";
  ok: boolean;
  detail?: string;
}

interface ShowReadiness {
  ready: boolean;
  blockingFailures: number;
  warningFailures: number;
  checks: ReadinessCheck[];
}

type Tab = "grundlagen" | "brand" | "cast" | "foki" | "test" | "episoden" | "gefahrenzone";

export default function ShowDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [show, setShow] = useState<Show | null>(null);
  const [readiness, setReadiness] = useState<ShowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("grundlagen");
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadShow = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studio/shows/${slug}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load fehlgeschlagen");
      setShow(data.show);
      setReadiness(data.readiness ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadShow();
  }, [loadShow]);

  function flash(msg: string) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 1800);
  }

  if (loading) return <div className="text-white/40 text-sm p-8">Lade Show…</div>;
  if (error || !show) return <div className="text-red-400 text-sm p-8">{error ?? "Nicht gefunden"}</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/studio/shows" className="text-white/40 hover:text-white/70 text-xs">
          ← Shows
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-xl font-bold text-[#f5eed6]">{show.title}</h1>
          {show.publishedAt ? (
            <span className="text-[9px] px-2 py-0.5 rounded bg-green-500/20 text-green-300">LIVE</span>
          ) : (
            <span className="text-[9px] px-2 py-0.5 rounded bg-white/10 text-white/50">DRAFT</span>
          )}
        </div>
        {show.subtitle && <p className="text-sm text-white/50">{show.subtitle}</p>}
        <p className="text-[10px] text-white/30 mt-1 font-mono">rev: {show.revisionHash}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10 overflow-x-auto">
        {(
          [
            ["grundlagen", "Grundlagen"],
            ["brand", "Brand"],
            ["cast", `Cast (${show.cast.length})`],
            ["foki", `Foki (${show.foki.length})`],
            ["test", "▶ Test"],
            ["episoden", `Episoden (${show.episodes.length})`],
            ["gefahrenzone", "Gefahrenzone"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-xs transition ${
              tab === id
                ? "text-[#C8A97E] border-b-2 border-[#C8A97E] -mb-px"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {saveMsg && (
        <div className="mb-4 text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
          ✓ {saveMsg}
        </div>
      )}

      {tab === "grundlagen" && <GrundlagenTab show={show} readiness={readiness} onSaved={(m) => { loadShow(); flash(m); }} />}
      {tab === "brand" && <BrandTab show={show} onSaved={(m) => { loadShow(); flash(m); }} />}
      {tab === "cast" && <CastTab show={show} onChanged={(m) => { loadShow(); flash(m); }} />}
      {tab === "foki" && <FokiTab show={show} onChanged={(m) => { loadShow(); flash(m); }} />}
      {tab === "test" && <TestTab show={show} onComplete={() => loadShow()} />}
      {tab === "episoden" && <EpisodenTab show={show} />}
      {tab === "gefahrenzone" && (
        <GefahrenzoneTab
          show={show}
          onDeleted={() => router.push("/studio/shows")}
        />
      )}
    </div>
  );
}

// ── Grundlagen ─────────────────────────────────────────────────

function GrundlagenTab({
  show,
  readiness,
  onSaved,
}: {
  show: Show;
  readiness: ShowReadiness | null;
  onSaved: (msg: string) => void;
}) {
  const [title, setTitle] = useState(show.title);
  const [subtitle, setSubtitle] = useState(show.subtitle ?? "");
  const [description, setDescription] = useState(show.description);
  const [category, setCategory] = useState(show.category);
  const [ageBand, setAgeBand] = useState(show.ageBand ?? "");
  const [budgetMinutes, setBudgetMinutes] = useState(show.budgetMinutes);
  // Feature #4: Continuity-Settings — opt-in Serialisierung
  const [continuityMode, setContinuityMode] = useState(show.continuityMode);
  const [continuityDepth, setContinuityDepth] = useState(show.continuityDepth);
  const [publishedAt, setPublishedAt] = useState<string | null>(show.publishedAt);
  const [saving, setSaving] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    await fetch(`/api/studio/shows/${show.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        subtitle: subtitle || null,
        description,
        category,
        ageBand: ageBand || null,
        budgetMinutes,
        continuityMode,
        continuityDepth,
      }),
    });
    setSaving(false);
    onSaved("Grundlagen gespeichert");
  }

  async function togglePublished() {
    setPublishError(null);
    const newVal = publishedAt ? null : new Date().toISOString();
    const res = await fetch(`/api/studio/shows/${show.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishedAt: newVal }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const blocking = Array.isArray(data.blocking) ? data.blocking.join(", ") : "";
      setPublishError(
        data.error ? `${data.error}${blocking ? ` — ${blocking}` : ""}` : "Publish fehlgeschlagen",
      );
      return;
    }
    setPublishedAt(newVal);
    onSaved(newVal ? "Publiziert" : "Depubliziert");
  }

  // Publish nur blockieren wenn wir gerade *publishen wollen* (not
  // already published) UND Readiness sagt nein. Depublish ist immer ok.
  const publishDisabled = !publishedAt && readiness !== null && !readiness.ready;

  return (
    <div className="space-y-5">
      <Field label="Titel"><TextInput value={title} onChange={setTitle} /></Field>
      <Field label="Untertitel"><TextInput value={subtitle} onChange={setSubtitle} /></Field>
      <Field label="Beschreibung"><TextArea value={description} onChange={setDescription} rows={4} /></Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Kategorie"><TextInput value={category} onChange={setCategory} /></Field>
        <Field label="AgeBand (z.B. 3-5, 6-8, null)"><TextInput value={ageBand} onChange={setAgeBand} /></Field>
      </div>

      <Field label="Budget-Minuten (pro Episode)">
        <input
          type="number"
          value={budgetMinutes}
          onChange={(e) => setBudgetMinutes(parseInt(e.target.value || "0"))}
          className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 w-32"
        />
      </Field>

      {/* Continuity-Mode (Feature #4) */}
      <div className="p-4 bg-[#1A1A1A] border border-white/10 rounded-lg space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={continuityMode}
            onChange={(e) => setContinuityMode(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#141414] text-[#C8A97E] focus:ring-0 focus:ring-offset-0"
          />
          <div className="flex-1">
            <div className="text-sm text-[#f5eed6]">
              Continuity-Mode (Serialisierung)
            </div>
            <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
              Wenn aktiv, laedt der Generator bei jeder neuen Episode die letzten
              <strong> {continuityDepth} Folgen</strong> (Titel + extrahierte Themen + optionale
              Regie-Notiz) und injiziert sie als Kontext in den Claude-Prompt.
              Claude kann Callbacks machen und Charakter-Arcs fortfuehren.
              Standardmaessig aus — bestehende Shows sind Anthologie-Format.
            </p>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
              Rejected Pilot-Episoden zaehlen nicht als Vorfolge;
              &ldquo;pending&rdquo; ebenfalls nicht (erst nach Approve).
            </p>
          </div>
        </label>
        {continuityMode && (
          <div className="pl-7">
            <label className="block text-[10px] uppercase tracking-wide text-white/50 mb-1">
              Rueckwaertige Tiefe (1-10)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={continuityDepth}
              onChange={(e) => {
                const v = parseInt(e.target.value || "3");
                setContinuityDepth(Math.max(1, Math.min(10, Number.isFinite(v) ? v : 3)));
              }}
              className="bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 w-24"
            />
            <p className="text-[10px] text-white/40 mt-1">
              Je hoeher, desto laenger der Prompt. 3 ist ein guter Default.
            </p>
          </div>
        )}
      </div>

      {/* Publish-Readiness Checklist */}
      {readiness && <ReadinessPanel readiness={readiness} published={!!publishedAt} />}

      {publishError && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          ✗ {publishError}
        </div>
      )}

      <div className="flex items-center gap-3 pt-4 border-t border-white/10">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] disabled:opacity-50"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
        <button
          onClick={togglePublished}
          disabled={publishDisabled}
          title={publishDisabled ? "Readiness-Checks noch offen" : undefined}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
            publishedAt
              ? "bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30"
              : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
          }`}
        >
          {publishedAt ? "Depublizieren" : "Publizieren"}
        </button>
      </div>
    </div>
  );
}

// ── Readiness-Panel ──────────────────────────────────────────────

function ReadinessPanel({
  readiness,
  published,
}: {
  readiness: ShowReadiness;
  published: boolean;
}) {
  const blocking = readiness.checks.filter((c) => c.severity === "blocking");
  const warnings = readiness.checks.filter((c) => c.severity === "warning");

  const headline = readiness.ready
    ? published
      ? "Live — alle Pflicht-Checks bestanden"
      : "Publish-bereit — alle Pflicht-Checks bestanden"
    : `${readiness.blockingFailures} Pflicht-Check${readiness.blockingFailures === 1 ? "" : "s"} offen`;
  const headlineColor = readiness.ready
    ? "text-green-300"
    : "text-red-300";

  return (
    <div className="pt-4 border-t border-white/10">
      <div className={`text-xs font-medium mb-3 ${headlineColor}`}>
        {headline}
      </div>
      <ul className="space-y-1.5">
        {blocking.map((c) => <CheckRow key={c.id} check={c} />)}
        {warnings.map((c) => <CheckRow key={c.id} check={c} />)}
      </ul>
    </div>
  );
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  const icon = check.ok
    ? "✓"
    : check.severity === "blocking"
      ? "✗"
      : "!";
  const iconColor = check.ok
    ? "text-green-300"
    : check.severity === "blocking"
      ? "text-red-300"
      : "text-yellow-300";
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={`${iconColor} font-bold w-4 text-center flex-shrink-0`}>{icon}</span>
      <div className="flex-1">
        <div className="text-white/80">{check.label}</div>
        {!check.ok && check.detail && (
          <div className="text-white/40 text-[11px] mt-0.5">{check.detail}</div>
        )}
      </div>
      {check.severity === "warning" && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400/70 flex-shrink-0">
          OPTIONAL
        </span>
      )}
    </li>
  );
}

// ── Brand ──────────────────────────────────────────────────────

function BrandTab({ show, onSaved }: { show: Show; onSaved: (msg: string) => void }) {
  const [brandVoice, setBrandVoice] = useState(show.brandVoice);
  const [palette, setPalette] = useState(show.palette ?? { bg: "#1A1A1A", ink: "#f5eed6", accent: "#C8A97E" });
  const [coverUrl, setCoverUrl] = useState(show.coverUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/studio/shows/${show.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandVoice, palette, coverUrl: coverUrl || null }),
    });
    setSaving(false);
    onSaved("Brand gespeichert");
  }

  return (
    <div className="space-y-5">
      <Field
        label="Brand-Voice"
        hint="Prompt-Overlay. Wird bei JEDER Generation zusätzlich zum Fokus-Skeleton injiziert. Ton, Do's + Don'ts, Stilregeln."
      >
        <TextArea value={brandVoice} onChange={setBrandVoice} rows={6} />
      </Field>

      <Field label="Palette">
        <div className="flex items-center gap-4">
          {(["bg", "ink", "accent"] as const).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={(palette as Record<string, string>)[key] ?? "#000000"}
                onChange={(e) => setPalette({ ...palette, [key]: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer border border-white/10"
              />
              <div>
                <div className="text-[10px] text-white/50 uppercase">{key}</div>
                <div className="text-[10px] font-mono text-white/70">{(palette as Record<string, string>)[key]}</div>
              </div>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Cover-URL">
        <TextInput value={coverUrl} onChange={setCoverUrl} placeholder="https://…" />
      </Field>

      <div className="pt-4 border-t border-white/10">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] disabled:opacity-50"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
      </div>

      <TrailerSection show={show} onChanged={onSaved} />
    </div>
  );
}

// ── Trailer ────────────────────────────────────────────────────

function TrailerSection({ show, onChanged }: { show: Show; onChanged: (msg: string) => void }) {
  const hasTrailer = !!show.trailerAudioUrl;
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const [lastDur, setLastDur] = useState<number | null>(null);
  // Cache-Buster damit das <audio> nach einem Neu-Generieren die neue MP3
  // holt, statt den Browser-Cache zu nutzen. Key aendert sich pro
  // generate/delete-Roundtrip (via revisionHash).
  const [playerKey, setPlayerKey] = useState(() => show.revisionHash);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/shows/${show.slug}/trailer`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Trailer-Generation fehlgeschlagen");
      setLastText(data.text ?? null);
      setLastDur(data.durationSec ?? null);
      setPlayerKey(data.revisionHash ?? String(Date.now()));
      onChanged(hasTrailer ? "Trailer neu generiert" : "Trailer generiert");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function remove() {
    if (!confirm("Trailer loeschen? Der Blob bleibt, nur der Pointer wird entfernt.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/shows/${show.slug}/trailer`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Loeschen fehlgeschlagen");
      setLastText(null);
      setLastDur(null);
      setPlayerKey(data.revisionHash ?? String(Date.now()));
      onChanged("Trailer entfernt");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="pt-4 border-t border-white/10 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-[#f5eed6]">Trailer</h3>
          <p className="text-[11px] text-white/50 mt-0.5">
            20-Sekunden-Audio-Intro mit Cast-Stimmen. Laeuft im Canzoia-Katalog automatisch ab.
            Generator-Kosten ~0,01€ (Claude + ElevenLabs).
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {hasTrailer && (
            <button
              onClick={remove}
              disabled={deleting || generating}
              className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-300 text-xs hover:bg-red-500/10 disabled:opacity-50"
            >
              {deleting ? "Loescht…" : "Loeschen"}
            </button>
          )}
          <button
            onClick={generate}
            disabled={generating || deleting}
            className="px-3 py-1.5 rounded-lg bg-[#C8A97E] text-[#141414] text-xs font-medium hover:bg-[#d4b88c] disabled:opacity-50"
          >
            {generating
              ? (hasTrailer ? "Generiert…" : "Generiert…")
              : (hasTrailer ? "Neu generieren" : "Generieren")}
          </button>
        </div>
      </div>

      {hasTrailer && (
        <audio
          key={playerKey}
          src={`/api/studio/shows/${show.slug}/trailer.mp3?v=${encodeURIComponent(playerKey)}`}
          controls
          preload="none"
          className="w-full"
        />
      )}

      {!hasTrailer && !generating && (
        <div className="text-[11px] text-white/40 italic">
          Noch kein Trailer generiert.
        </div>
      )}

      {generating && (
        <div className="text-[11px] text-[#C8A97E]">
          Claude schreibt + ElevenLabs synthetisiert (15-40s)…
        </div>
      )}

      {lastText && (
        <details className="text-[11px] text-white/60">
          <summary className="cursor-pointer hover:text-white/80">
            Trailer-Text {lastDur ? `(${lastDur}s)` : ""}
          </summary>
          <pre className="mt-2 p-3 bg-black/40 border border-white/10 rounded whitespace-pre-wrap font-mono text-[10px]">
            {lastText}
          </pre>
        </details>
      )}

      {error && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Cast ───────────────────────────────────────────────────────

function CastTab({ show, onChanged }: { show: Show; onChanged: (msg: string) => void }) {
  const [allActors, setAllActors] = useState<Actor[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/studio/shows/actors")
      .then((r) => r.json())
      .then((d) => setAllActors(d.actors || []));
  }, []);

  async function addActor(actorId: string) {
    await fetch(`/api/studio/shows/${show.slug}/cast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId }),
    });
    setPickerOpen(false);
    onChanged("Actor hinzugefügt");
  }

  async function removeActor(actorId: string) {
    if (!confirm("Actor aus Cast entfernen?")) return;
    await fetch(`/api/studio/shows/${show.slug}/cast?actorId=${actorId}`, { method: "DELETE" });
    onChanged("Entfernt");
  }

  async function updateCastRole(actorId: string, role: string) {
    // PATCH replaces whole cast — preserve others
    const nextCast = show.cast.map((c) => ({
      actorId: c.actorId,
      role: c.actorId === actorId ? role : c.role,
      styleOverride: c.styleOverride,
      orderIndex: c.orderIndex,
    }));
    await fetch(`/api/studio/shows/${show.slug}/cast`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cast: nextCast }),
    });
    onChanged("Rolle aktualisiert");
  }

  const notInCast = allActors.filter((a) => !show.cast.some((c) => c.actorId === a.id));

  return (
    <div className="space-y-3">
      {show.cast.length === 0 && (
        <p className="text-white/40 text-sm">Noch kein Cast. Füge Actors hinzu.</p>
      )}

      {show.cast.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 p-3 bg-[#1A1A1A] border border-white/10 rounded-lg">
          <span className="text-2xl">{entry.actor.emoji}</span>
          <div className="flex-1">
            <div className="text-sm text-[#f5eed6] font-medium">{entry.actor.displayName}</div>
            <div className="text-[10px] text-white/40">{entry.actor.role ?? entry.actor.species}</div>
          </div>
          <input
            type="text"
            defaultValue={entry.role ?? ""}
            onBlur={(e) => {
              if (e.target.value !== (entry.role ?? "")) updateCastRole(entry.actorId, e.target.value);
            }}
            placeholder="Rolle (host, gast…)"
            className="bg-[#141414] border border-white/10 rounded px-2 py-1 text-xs text-white/80 w-40"
          />
          <button
            onClick={() => removeActor(entry.actorId)}
            className="text-red-400/60 hover:text-red-400 text-xs px-2"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="pt-3">
        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs text-[#C8A97E] hover:text-[#d4b88c]"
          >
            + Actor hinzufügen
          </button>
        ) : (
          <div className="p-3 bg-[#1A1A1A] border border-white/10 rounded-lg">
            <div className="grid grid-cols-2 gap-2">
              {notInCast.map((a) => (
                <button
                  key={a.id}
                  onClick={() => addActor(a.id)}
                  className="flex items-center gap-2 p-2 rounded hover:bg-white/5 text-left"
                >
                  <span>{a.emoji}</span>
                  <span className="text-xs text-[#f5eed6]">{a.displayName}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              className="mt-2 text-[10px] text-white/40 hover:text-white/70"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Foki ───────────────────────────────────────────────────────

function FokiTab({ show, onChanged }: { show: Show; onChanged: (msg: string) => void }) {
  const [templates, setTemplates] = useState<FokusTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingFokus, setEditingFokus] = useState<ShowFokusRow | null>(null);

  useEffect(() => {
    fetch("/api/studio/shows/fokus-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []));
  }, []);

  async function addFokus(fokusTemplateId: string) {
    await fetch(`/api/studio/shows/${show.slug}/foki`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fokusTemplateId }),
    });
    setPickerOpen(false);
    onChanged("Fokus hinzugefügt");
  }

  async function removeFokus(showFokusId: string) {
    if (!confirm("Fokus aus Show entfernen?")) return;
    await fetch(`/api/studio/shows/${show.slug}/foki?showFokusId=${showFokusId}`, { method: "DELETE" });
    onChanged("Entfernt");
  }

  async function toggleEnabled(showFokusId: string, enabled: boolean) {
    await fetch(`/api/studio/shows/${show.slug}/foki/${showFokusId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    onChanged(enabled ? "Aktiviert" : "Deaktiviert");
  }

  const notInShow = templates.filter((t) => !show.foki.some((f) => f.fokusTemplateId === t.id));

  return (
    <div className="space-y-3">
      {show.foki.length === 0 && (
        <p className="text-white/40 text-sm">Noch keine Foki. Füge Fokus-Templates hinzu.</p>
      )}

      {show.foki.map((entry) => (
        <div
          key={entry.id}
          className={`p-3 bg-[#1A1A1A] border rounded-lg ${
            entry.enabled ? "border-white/10" : "border-white/5 opacity-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{entry.fokusTemplate.emoji}</span>
            <div className="flex-1">
              <div className="text-sm text-[#f5eed6] font-medium">
                {entry.displayLabel || entry.fokusTemplate.displayName}
              </div>
              <div className="text-[10px] text-white/40">
                {entry.fokusTemplate.minAlter}+ · {entry.targetDurationMin} min
                {entry.showOverlay && <span className="ml-2 text-[#C8A97E]/60">• Overlay aktiv</span>}
              </div>
            </div>
            <button
              onClick={() => toggleEnabled(entry.id, !entry.enabled)}
              className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:bg-white/10"
            >
              {entry.enabled ? "An" : "Aus"}
            </button>
            <button
              onClick={() => setEditingFokus(entry)}
              className="text-[10px] px-2 py-1 rounded bg-[#C8A97E]/20 text-[#C8A97E] hover:bg-[#C8A97E]/30"
            >
              Bearbeiten
            </button>
            <button
              onClick={() => removeFokus(entry.id)}
              className="text-red-400/60 hover:text-red-400 text-xs px-2"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <div className="pt-3">
        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs text-[#C8A97E] hover:text-[#d4b88c]"
          >
            + Fokus hinzufügen
          </button>
        ) : (
          <div className="p-3 bg-[#1A1A1A] border border-white/10 rounded-lg">
            <div className="grid grid-cols-2 gap-2">
              {notInShow.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addFokus(t.id)}
                  className="flex items-center gap-2 p-2 rounded hover:bg-white/5 text-left"
                >
                  <span>{t.emoji}</span>
                  <span className="text-xs text-[#f5eed6]">{t.displayName}</span>
                  <span className="text-[9px] text-white/30">{t.minAlter}+</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              className="mt-2 text-[10px] text-white/40 hover:text-white/70"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {editingFokus && (
        <FokusEditModal
          slug={show.slug}
          fokus={editingFokus}
          onClose={() => setEditingFokus(null)}
          onSaved={() => {
            setEditingFokus(null);
            onChanged("Fokus aktualisiert");
          }}
        />
      )}
    </div>
  );
}

function FokusEditModal({
  slug,
  fokus,
  onClose,
  onSaved,
}: {
  slug: string;
  fokus: ShowFokusRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [showOverlay, setShowOverlay] = useState(fokus.showOverlay);
  const [targetDurationMin, setTargetDurationMin] = useState(fokus.targetDurationMin);
  const [displayLabel, setDisplayLabel] = useState(fokus.displayLabel ?? "");
  const [castRolesText, setCastRolesText] = useState(JSON.stringify(fokus.castRoles, null, 2));
  const [userInputSchemaText, setUserInputSchemaText] = useState(JSON.stringify(fokus.userInputSchema, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const castRoles = JSON.parse(castRolesText);
      const userInputSchema = JSON.parse(userInputSchemaText);
      const res = await fetch(`/api/studio/shows/${slug}/foki/${fokus.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          showOverlay,
          targetDurationMin,
          displayLabel: displayLabel || null,
          castRoles,
          userInputSchema,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#141414] border-b border-white/10 px-5 py-3 flex items-center justify-between">
          <h3 className="text-[#f5eed6] text-sm font-semibold">
            {fokus.fokusTemplate.emoji} {fokus.fokusTemplate.displayName} — fine-tuning
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-lg">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Display-Label (optional override)">
            <TextInput value={displayLabel} onChange={setDisplayLabel} placeholder={fokus.fokusTemplate.displayName} />
          </Field>

          <Field label="Ziel-Dauer (Min)">
            <input
              type="number"
              value={targetDurationMin}
              onChange={(e) => setTargetDurationMin(parseInt(e.target.value || "0"))}
              className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 w-32"
            />
          </Field>

          <Field
            label="Show-Overlay (zusätzlich zu Brand-Voice + Fokus-Skeleton)"
            hint="Feinschliff-Prompt nur für dieses Fokus-in-dieser-Show. Bleibt leer = keine weitere Injektion."
          >
            <TextArea value={showOverlay} onChange={setShowOverlay} rows={4} />
          </Field>

          <Field label="Cast-Roles (JSON)" hint="Welche Actor-IDs welche Rolle pro Fokus haben (lead, support, …).">
            <TextArea value={castRolesText} onChange={setCastRolesText} rows={6} mono />
          </Field>

          <Field label="User-Input-Schema (JSON)" hint="Effektives Schema für dieses Fokus.">
            <TextArea value={userInputSchemaText} onChange={setUserInputSchemaText} rows={10} mono />
          </Field>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-white/10">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10">
              Abbrechen
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] disabled:opacity-50"
            >
              {saving ? "Speichert…" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Test-Tab (admin fires a real generation without Canzoia) ────

interface UserInputField {
  kind: "text" | "select" | "number";
  id: string;
  label: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  default?: string | number;
  required?: boolean;
  maxLength?: number;
}

interface TestEpisodeState {
  id: string;
  status: string;
  progressPct: number;
  progressStage: string | null;
  title: string | null;
  audioUrl: string | null;
  durationSec: number | null;
  text: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  ttsChars: number | null;
}

function TestTab({ show, onComplete }: { show: Show; onComplete: () => void }) {
  const activeFoki = show.foki.filter((f) => f.enabled);
  const [selectedFokusId, setSelectedFokusId] = useState<string>(activeFoki[0]?.id ?? "");
  const selectedFokus = show.foki.find((f) => f.id === selectedFokusId) ?? null;

  // Profile snapshot (admin-controlled for test)
  const [displayName, setDisplayName] = useState("Testi");
  const [ageYears, setAgeYears] = useState(6);
  const [interests, setInterests] = useState("Dinosaurier, Sterne");
  const [favoriteAnimal, setFavoriteAnimal] = useState("Koala");

  // userInputs — built from the Fokus' userInputSchema
  const [userInputs, setUserInputs] = useState<Record<string, string | number>>({});

  // Pipeline state
  const [running, setRunning] = useState(false);
  const [episode, setEpisode] = useState<TestEpisodeState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Feature S3: Pilot-Mode — Episode durchlaeuft das Review-Gate.
  // Der Admin muss via Episode-Detail approven bevor der generation.completed-
  // Webhook rausgeht. Sinnvoll beim aller-ersten Test einer neuen Show, damit
  // ein defektes Cast-Setup nicht sofort einen Kunden-Feed floodet.
  const [isPilot, setIsPilot] = useState(false);

  // Reset userInputs when Fokus changes — pre-fill defaults from schema
  useEffect(() => {
    if (!selectedFokus) return;
    const schema = selectedFokus.userInputSchema as { fields?: UserInputField[] };
    const defaults: Record<string, string | number> = {};
    (schema.fields ?? []).forEach((f) => {
      if (f.default !== undefined) defaults[f.id] = f.default;
      else if (f.kind === "select" && f.options?.[0]) defaults[f.id] = f.options[0].value;
      else defaults[f.id] = "";
    });
    setUserInputs(defaults);
  }, [selectedFokusId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startGeneration() {
    if (!selectedFokusId) return;
    setError(null);
    setEpisode(null);
    setRunning(true);

    const profileSnapshot = {
      displayName: displayName || "Hörer",
      ageYears: Number.isFinite(ageYears) ? ageYears : 7,
      interests: interests
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      favoriteAnimal: favoriteAnimal || undefined,
    };

    try {
      const res = await fetch(`/api/studio/shows/${show.slug}/test-episode`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          showFokusId: selectedFokusId,
          userInputs,
          profileSnapshot,
          isPilot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Start fehlgeschlagen");
      void pollEpisode(show.slug, data.episodeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  }

  async function pollEpisode(slug: string, episodeId: string) {
    // Simple polling loop: 2s interval, abort on terminal status, max 10min.
    const started = Date.now();
    while (Date.now() - started < 10 * 60 * 1000) {
      try {
        const res = await fetch(`/api/studio/shows/${slug}/test-episode?episodeId=${episodeId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Polling fehlgeschlagen");
        setEpisode(data.episode);
        if (data.episode.status === "completed" || data.episode.status === "failed") {
          setRunning(false);
          onComplete();
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setRunning(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setError("Timeout nach 10 Minuten");
    setRunning(false);
  }

  if (activeFoki.length === 0) {
    return (
      <div className="text-white/50 text-sm p-6 border border-white/10 rounded-lg">
        Keine aktiven Foki. Füge im Foki-Tab mindestens einen Fokus hinzu und aktiviere ihn.
      </div>
    );
  }
  if (show.cast.length === 0) {
    return (
      <div className="text-white/50 text-sm p-6 border border-white/10 rounded-lg">
        Kein Cast. Weise im Cast-Tab mindestens einen Actor zu.
      </div>
    );
  }

  const schema = (selectedFokus?.userInputSchema as { fields?: UserInputField[] }) ?? { fields: [] };

  return (
    <div className="space-y-6">
      {/* Fokus-Auswahl */}
      <div>
        <label className="block text-xs font-medium text-white/60 mb-2">Fokus</label>
        <div className="flex flex-wrap gap-2">
          {activeFoki.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFokusId(f.id)}
              className={`px-3 py-2 rounded-lg text-xs border transition ${
                selectedFokusId === f.id
                  ? "border-[#C8A97E] bg-[#C8A97E]/10 text-[#C8A97E]"
                  : "border-white/10 bg-[#1A1A1A] text-white/60 hover:border-white/20"
              }`}
            >
              {f.fokusTemplate.emoji} {f.displayLabel || f.fokusTemplate.displayName}{" "}
              <span className="text-white/40 ml-1">· {f.targetDurationMin}m</span>
            </button>
          ))}
        </div>
      </div>

      {/* User-Inputs (aus Schema) */}
      {selectedFokus && (
        <div className="p-4 bg-[#1A1A1A] border border-white/10 rounded-lg space-y-3">
          <div className="text-[11px] text-white/40 uppercase tracking-wide">Nutzer-Inputs</div>
          {(schema.fields ?? []).map((f) => (
            <Field key={f.id} label={f.label}>
              {f.kind === "select" ? (
                <select
                  value={(userInputs[f.id] as string) ?? ""}
                  onChange={(e) => setUserInputs({ ...userInputs, [f.id]: e.target.value })}
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none"
                >
                  {(f.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : f.kind === "number" ? (
                <input
                  type="number"
                  value={(userInputs[f.id] as number) ?? 0}
                  onChange={(e) => setUserInputs({ ...userInputs, [f.id]: parseInt(e.target.value || "0") })}
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
                />
              ) : (
                <input
                  type="text"
                  value={(userInputs[f.id] as string) ?? ""}
                  onChange={(e) => setUserInputs({ ...userInputs, [f.id]: e.target.value })}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
                />
              )}
            </Field>
          ))}
        </div>
      )}

      {/* Profil-Snapshot */}
      <div className="p-4 bg-[#1A1A1A] border border-white/10 rounded-lg space-y-3">
        <div className="text-[11px] text-white/40 uppercase tracking-wide">Test-Profil</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <TextInput value={displayName} onChange={setDisplayName} />
          </Field>
          <Field label="Alter">
            <input
              type="number"
              value={ageYears}
              onChange={(e) => setAgeYears(parseInt(e.target.value || "0"))}
              className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
            />
          </Field>
        </div>
        <Field label="Interessen (Komma-getrennt)">
          <TextInput value={interests} onChange={setInterests} />
        </Field>
        <Field label="Lieblingstier">
          <TextInput value={favoriteAnimal} onChange={setFavoriteAnimal} />
        </Field>
      </div>

      {/* Pilot-Toggle (Feature S3) */}
      <div className="p-4 bg-[#1A1A1A] border border-white/10 rounded-lg">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPilot}
            onChange={(e) => setIsPilot(e.target.checked)}
            disabled={running}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#141414] text-[#C8A97E] focus:ring-0 focus:ring-offset-0"
          />
          <div className="flex-1">
            <div className="text-sm text-[#f5eed6]">
              Als Pilot generieren (Review-Gate)
            </div>
            <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
              Episode wird fertig gebaut, aber der Canzoia-Webhook bleibt
              suspendiert. Du pruefst das Ergebnis im Episode-Detail und
              approvest oder rejectest — erst dann geht&rsquo;s raus an Canzoia.
              Empfohlen fuer die erste Episode einer neuen Show.
            </p>
          </div>
        </label>
      </div>

      {/* Generate */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/10">
        <button
          onClick={startGeneration}
          disabled={running || !selectedFokusId}
          className="px-5 py-2.5 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-semibold hover:bg-[#d4b88c] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running
            ? episode
              ? `${episode.progressStage ?? episode.status}… ${episode.progressPct}%`
              : "Starte…"
            : episode?.status === "completed"
            ? "Neu generieren"
            : isPilot
            ? "Pilot generieren"
            : "Generieren"}
        </button>
        {running && (
          <span className="text-[11px] text-white/40">
            Polling läuft — Audio-Synthese kann 30-90s dauern.
          </span>
        )}
      </div>

      {/* Progress bar */}
      {episode && episode.status !== "completed" && episode.status !== "failed" && (
        <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-[#C8A97E] transition-all duration-300"
            style={{ width: `${episode.progressPct}%` }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 border border-red-500/30 bg-red-950/20 rounded-lg text-sm text-red-300">
          ⚠ {error}
        </div>
      )}
      {episode?.status === "failed" && (
        <div className="p-4 border border-red-500/30 bg-red-950/20 rounded-lg">
          <div className="text-sm text-red-300 font-medium">
            Generation fehlgeschlagen ({episode.errorCode ?? "Error"})
          </div>
          {episode.errorMessage && (
            <pre className="text-[11px] text-red-300/70 whitespace-pre-wrap mt-2 font-mono">
              {episode.errorMessage}
            </pre>
          )}
        </div>
      )}

      {/* Completed — audio + transcript */}
      {episode?.status === "completed" && episode.audioUrl && (
        <div className="space-y-4">
          <div className="p-5 border border-[#C8A97E]/30 bg-[#C8A97E]/5 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[#f5eed6] text-sm font-semibold">
                  {episode.title ?? "Testfolge"}
                </div>
                <div className="text-[10px] text-white/50 mt-0.5">
                  {episode.durationSec}s · in {episode.inputTokens ?? 0}/out {episode.outputTokens ?? 0} tokens · {episode.ttsChars ?? 0} Zeichen TTS
                </div>
              </div>
              <a
                href={episode.audioUrl}
                download
                className="text-[11px] text-[#C8A97E] hover:text-[#d4b88c] underline"
              >
                Download
              </a>
            </div>
            <audio src={episode.audioUrl} controls className="w-full" />
          </div>

          {episode.text && (
            <details className="p-4 bg-[#1A1A1A] border border-white/10 rounded-lg">
              <summary className="cursor-pointer text-xs text-white/60 hover:text-white/80">
                Transkript anzeigen ({episode.text.length} Zeichen)
              </summary>
              <pre className="mt-3 text-[11px] text-white/70 whitespace-pre-wrap font-mono leading-relaxed">
                {episode.text}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Episoden (Links zum Detail-Debug-View) ─────────────────────

function EpisodenTab({ show }: { show: Show }) {
  if (show.episodes.length === 0) {
    return (
      <div className="text-white/40 text-sm p-6 border border-white/10 rounded-lg text-center">
        Noch keine Episoden generiert. Sobald Canzoia-User via API Episoden generieren, erscheinen sie hier.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {show.episodes.map((ep) => (
        // Click → /studio/shows/[slug]/episodes/[id]: Prompts, Timeline,
        // Audio, Retry — der Debug-Pfad fuer "warum hat das nicht geklappt".
        <Link
          key={ep.id}
          href={`/studio/shows/${show.slug}/episodes/${ep.id}`}
          className="flex items-center gap-3 p-3 bg-[#1A1A1A] border border-white/10 rounded-lg hover:border-[#C8A97E]/40 transition"
        >
          <span
            className={`text-[10px] px-2 py-0.5 rounded ${
              ep.status === "completed"
                ? "bg-green-500/20 text-green-300"
                : ep.status === "failed"
                ? "bg-red-500/20 text-red-300"
                : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {ep.status}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[#f5eed6] truncate">{ep.title ?? "(kein Titel)"}</div>
            <div className="text-[10px] text-white/40 font-mono truncate">{ep.canzoiaJobId}</div>
          </div>
          <div className="text-[10px] text-white/40 shrink-0">
            {ep.durationSec ? `${ep.durationSec}s` : `${ep.progressPct}%`}
          </div>
          <span className="text-white/30 text-xs">→</span>
        </Link>
      ))}
    </div>
  );
}

// ── Gefahrenzone ───────────────────────────────────────────────

function GefahrenzoneTab({ show, onDeleted }: { show: Show; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    if (confirmText !== show.slug) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/studio/shows/${show.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Delete failed");
      }
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 border border-red-500/20 rounded-lg p-5 bg-red-950/10">
      <h3 className="text-red-300 font-semibold text-sm">Show löschen</h3>
      <p className="text-xs text-white/60">
        Unwiderruflich. Wenn Episoden existieren, blockiert der Server die Löschung. Bestätige mit dem Slug{" "}
        <span className="font-mono text-[#C8A97E]">{show.slug}</span>.
      </p>
      <TextInput value={confirmText} onChange={setConfirmText} placeholder={show.slug} />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={doDelete}
        disabled={deleting || confirmText !== show.slug}
        className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm disabled:opacity-40"
      >
        {deleting ? "Lösche…" : "Unwiderruflich löschen"}
      </button>
    </div>
  );
}

// ── Shared inputs ──────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-2">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-white/30 mt-1">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none"
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 4,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none resize-y ${
        mono ? "font-mono text-[11px]" : ""
      }`}
    />
  );
}

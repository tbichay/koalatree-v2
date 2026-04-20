"use client";

/**
 * FokusTemplate-Edit-Seite.
 *
 * System-Templates (ownerUserId=null) sind editierbar, aber ein Banner warnt,
 * dass ein Re-Seed die Aenderungen ueberschreibt. Custom Templates sind frei
 * editierbar + loeschbar (wenn nicht in Shows referenziert).
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface FokusTemplate {
  id: string;
  displayName: string;
  description: string | null;
  emoji: string | null;
  systemPromptSkeleton: string;
  interactionStyle: string | null;
  defaultCastRoles: Record<string, unknown>;
  defaultUserInputSchema: Record<string, unknown>;
  defaultDurationMin: number;
  minAlter: number;
  maxAlter: number;
  supportedCategories: string[];
  ownerUserId: string | null;
  _count: { shows: number };
}

const KNOWN_CATEGORIES = ["kids", "wellness", "knowledge"];

export default function FokusEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [template, setTemplate] = useState<FokusTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/studio/shows/fokus-templates/${id}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || "Load failed");
    else setTemplate(data.template);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 1800);
  }

  async function save(updates: Partial<FokusTemplate>) {
    if (!template) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/shows/fokus-templates/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setTemplate(data.template);
      flash("Gespeichert");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirm("Fokus-Vorlage loeschen?")) return;
    const res = await fetch(`/api/studio/shows/fokus-templates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    router.push("/studio/shows/foki");
  }

  if (loading) return <div className="text-white/40 text-sm p-8">Lade Fokus…</div>;
  if (error || !template)
    return <div className="text-red-400 text-sm p-8">{error ?? "Nicht gefunden"}</div>;

  const isSeed = !template.ownerUserId;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/studio/shows/foki" className="text-white/40 hover:text-white/70 text-xs">
          ← Foki
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-4xl">{template.emoji ?? "✶"}</span>
          <div>
            <h1 className="text-xl font-bold text-[#f5eed6]">{template.displayName}</h1>
            <p className="text-[10px] text-white/30 font-mono">id: {template.id}</p>
          </div>
          {isSeed && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300">
              SEED
            </span>
          )}
          {template._count.shows > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/60">
              {template._count.shows} Show(s) nutzen
            </span>
          )}
        </div>
      </div>

      {isSeed && (
        <div className="mb-5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-xs text-yellow-200/80">
            ⚠️ System-Template. Aenderungen gehen bei einem erneuten Seed-Lauf
            verloren — fuer dauerhafte Anpassungen das Seed-Skript aktualisieren.
          </p>
        </div>
      )}

      {saveMsg && (
        <div className="mb-4 text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
          ✓ {saveMsg}
        </div>
      )}

      <FokusForm
        key={template.id}
        template={template}
        saving={saving}
        onSave={save}
        onDelete={!isSeed ? doDelete : undefined}
      />
    </div>
  );
}

function FokusForm({
  template,
  saving,
  onSave,
  onDelete,
}: {
  template: FokusTemplate;
  saving: boolean;
  onSave: (updates: Partial<FokusTemplate>) => void;
  onDelete?: () => void;
}) {
  const [displayName, setDisplayName] = useState(template.displayName);
  const [emoji, setEmoji] = useState(template.emoji ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [systemPromptSkeleton, setSystemPromptSkeleton] = useState(template.systemPromptSkeleton);
  const [interactionStyle, setInteractionStyle] = useState(template.interactionStyle ?? "");
  const [defaultDurationMin, setDefaultDurationMin] = useState(template.defaultDurationMin);
  const [minAlter, setMinAlter] = useState(template.minAlter);
  const [maxAlter, setMaxAlter] = useState(template.maxAlter);
  const [categories, setCategories] = useState<string[]>(template.supportedCategories);
  const [castRolesText, setCastRolesText] = useState(
    JSON.stringify(template.defaultCastRoles ?? {}, null, 2)
  );
  const [inputSchemaText, setInputSchemaText] = useState(
    JSON.stringify(template.defaultUserInputSchema ?? { fields: [] }, null, 2)
  );

  function toggleCat(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  function saveAll() {
    let defaultCastRoles: Record<string, unknown>;
    let defaultUserInputSchema: Record<string, unknown>;
    try {
      defaultCastRoles = JSON.parse(castRolesText);
      defaultUserInputSchema = JSON.parse(inputSchemaText);
    } catch {
      alert("defaultCastRoles oder defaultUserInputSchema ist kein valides JSON.");
      return;
    }
    onSave({
      displayName,
      emoji: emoji || null,
      description: description || null,
      systemPromptSkeleton,
      interactionStyle: interactionStyle || null,
      defaultDurationMin,
      minAlter,
      maxAlter,
      supportedCategories: categories,
      defaultCastRoles,
      defaultUserInputSchema,
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
        <Field label="Emoji">
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={2}
            className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-center text-2xl w-16"
          />
        </Field>
        <Field label="Name">
          <TextInput value={displayName} onChange={setDisplayName} />
        </Field>
      </div>

      <Field label="Kurz-Beschreibung">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>

      <Field
        label="System-Prompt-Skelett"
        hint="Format-Level-Instruktionen. Show.brandVoice + ShowFokus.showOverlay werden ergaenzt."
      >
        <TextArea value={systemPromptSkeleton} onChange={setSystemPromptSkeleton} rows={10} mono />
      </Field>

      <Field
        label="Interaction-Style (optional)"
        hint="Dialog-Regeln. Wie sprechen die Charaktere miteinander in dieser Fokus-Art?"
      >
        <TextArea value={interactionStyle} onChange={setInteractionStyle} rows={4} mono />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Default Dauer (min)">
          <NumberInput value={defaultDurationMin} onChange={setDefaultDurationMin} min={1} max={60} />
        </Field>
        <Field label="Min Alter">
          <NumberInput value={minAlter} onChange={setMinAlter} min={0} max={99} />
        </Field>
        <Field label="Max Alter">
          <NumberInput value={maxAlter} onChange={setMaxAlter} min={0} max={99} />
        </Field>
      </div>

      <Field label="Unterstuetzte Kategorien">
        <div className="flex flex-wrap gap-2">
          {KNOWN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-[11px] transition capitalize ${
                categories.includes(cat)
                  ? "bg-[#3d6b4a]/30 text-[#a8d5b8] border border-[#3d6b4a]/50"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Default Cast-Roles (JSON)"
        hint='z.B. { "lead": "erzaehler", "support": ["kind","helfer"] }'
      >
        <TextArea value={castRolesText} onChange={setCastRolesText} rows={5} mono />
      </Field>

      <Field
        label="Default User-Input-Schema (JSON)"
        hint='Struktur: { "fields": [{ "id":"wunsch", "kind":"text", "label":"...", "placeholder":"..." }] }'
      >
        <TextArea value={inputSchemaText} onChange={setInputSchemaText} rows={10} mono />
      </Field>

      <div className="flex items-center gap-3 pt-4 border-t border-white/10">
        <button
          onClick={saveAll}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] disabled:opacity-50"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="ml-auto px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm"
          >
            Loeschen
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value || "0"))}
      min={min}
      max={max}
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

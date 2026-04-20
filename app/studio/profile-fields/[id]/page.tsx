"use client";

/**
 * ProfileFieldDef-Edit-Seite.
 *
 * System-Felder (ownerUserId=null) sind editierbar, aber nur deaktivierbar,
 * nicht loeschbar — verhindert verwaiste References auf Canzoia-Seite.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface FieldDef {
  id: string;
  label: string;
  kind: string;
  description: string | null;
  placeholder: string | null;
  options: Array<{ value: string; label: string }> | null;
  required: boolean;
  isActive: boolean;
  order: number;
  category: string | null;
  minAlter: number | null;
  maxAlter: number | null;
  aiPrompt: string | null;
  ownerUserId: string | null;
}

const KINDS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Zahl" },
  { value: "select", label: "Auswahl (eine)" },
  { value: "multi_select", label: "Mehrfach-Auswahl" },
  { value: "boolean", label: "Ja/Nein" },
  { value: "tags", label: "Tags (freie Strings)" },
];

export default function ProfileFieldEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [field, setField] = useState<FieldDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/studio/profile-fields/${id}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || "Load failed");
    else setField(data.field);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 1800);
  }

  async function save(updates: Partial<FieldDef>) {
    if (!field) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/profile-fields/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setField(data.field);
      flash("Gespeichert");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirm("Feld loeschen?")) return;
    const res = await fetch(`/api/studio/profile-fields/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    router.push("/studio/profile-fields");
  }

  if (loading) return <div className="text-white/40 text-sm p-8">Lade Feld…</div>;
  if (error || !field)
    return <div className="text-red-400 text-sm p-8">{error ?? "Nicht gefunden"}</div>;

  const isSeed = !field.ownerUserId;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link
          href="/studio/profile-fields"
          className="text-white/40 hover:text-white/70 text-xs"
        >
          ← Profile-Felder
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div>
            <h1 className="text-xl font-bold text-[#f5eed6]">{field.label}</h1>
            <p className="text-[10px] text-white/30 font-mono">id: {field.id}</p>
          </div>
          {isSeed && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300">
              SYSTEM
            </span>
          )}
          {field.isActive ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-300">
              AKTIV
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/50">
              INAKTIV
            </span>
          )}
        </div>
      </div>

      {saveMsg && (
        <div className="mb-4 text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
          ✓ {saveMsg}
        </div>
      )}

      <FieldForm
        key={field.id}
        field={field}
        saving={saving}
        onSave={save}
        onDelete={!isSeed ? doDelete : undefined}
      />
    </div>
  );
}

function FieldForm({
  field,
  saving,
  onSave,
  onDelete,
}: {
  field: FieldDef;
  saving: boolean;
  onSave: (updates: Partial<FieldDef>) => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [kind, setKind] = useState(field.kind);
  const [description, setDescription] = useState(field.description ?? "");
  const [placeholder, setPlaceholder] = useState(field.placeholder ?? "");
  const [category, setCategory] = useState(field.category ?? "");
  const [required, setRequired] = useState(field.required);
  const [isActive, setIsActive] = useState(field.isActive);
  const [order, setOrder] = useState(field.order);
  const [minAlter, setMinAlter] = useState<number | null>(field.minAlter);
  const [maxAlter, setMaxAlter] = useState<number | null>(field.maxAlter);
  const [aiPrompt, setAiPrompt] = useState(field.aiPrompt ?? "");
  const [optionsText, setOptionsText] = useState(
    field.options ? JSON.stringify(field.options, null, 2) : "[]"
  );

  const needsOptions = kind === "select" || kind === "multi_select";

  function saveAll() {
    let options: Array<{ value: string; label: string }> | null = null;
    if (needsOptions) {
      try {
        const parsed = JSON.parse(optionsText);
        if (!Array.isArray(parsed)) throw new Error();
        options = parsed;
      } catch {
        alert("Options-Feld muss valides JSON-Array sein: [{ value, label }]");
        return;
      }
    }
    onSave({
      label,
      kind,
      description: description || null,
      placeholder: placeholder || null,
      category: category || null,
      required,
      isActive,
      order,
      minAlter,
      maxAlter,
      aiPrompt: aiPrompt || null,
      options,
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Label">
          <TextInput value={label} onChange={setLabel} />
        </Field>
        <Field label="Typ">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Beschreibung / Hinweis" hint="Wird im Onboarding als Hint angezeigt.">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Platzhalter (optional)">
          <TextInput value={placeholder} onChange={setPlaceholder} />
        </Field>
        <Field
          label="Gruppe / Kategorie"
          hint="basic, interests, favorites, family, …"
        >
          <TextInput value={category} onChange={setCategory} placeholder="basic" />
        </Field>
      </div>

      {needsOptions && (
        <Field
          label="Optionen (JSON-Array)"
          hint='Beispiel: [{"value":"blau","label":"Blau"},{"value":"rot","label":"Rot"}]'
        >
          <TextArea value={optionsText} onChange={setOptionsText} rows={5} mono />
        </Field>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Field label="Reihenfolge">
          <NumberInput value={order} onChange={setOrder} min={0} max={999} />
        </Field>
        <Field label="Min Alter (optional)">
          <NumberInput
            value={minAlter ?? 0}
            onChange={(v) => setMinAlter(v || null)}
            min={0}
            max={99}
          />
        </Field>
        <Field label="Max Alter (optional)">
          <NumberInput
            value={maxAlter ?? 0}
            onChange={(v) => setMaxAlter(v || null)}
            min={0}
            max={99}
          />
        </Field>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="accent-[#C8A97E]"
          />
          Pflichtfeld
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-[#C8A97E]"
          />
          Aktiv (Canzoia-sichtbar)
        </label>
      </div>

      <Field
        label="KI-Onboarding-Prompt (optional)"
        hint="Hinweis fuer den Canzoia-Chatbot, wie er diese Info erfragen soll."
      >
        <TextArea value={aiPrompt} onChange={setAiPrompt} rows={3} />
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

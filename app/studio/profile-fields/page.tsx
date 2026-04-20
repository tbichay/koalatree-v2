"use client";

/**
 * Profile-Fields — Studio-Verwaltung der ProfileFieldDef-Katalog.
 *
 * Neue Felder hier anlegen → Canzoia liest sie via /api/canzoia/profile-fields
 * und nutzt sie im Onboarding-Chatbot + profileSnapshot ohne weiteren Deploy.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface FieldRow {
  id: string;
  label: string;
  kind: string;
  description: string | null;
  category: string | null;
  required: boolean;
  isActive: boolean;
  order: number;
  options: unknown;
  ownerUserId: string | null;
}

const KIND_LABELS: Record<string, string> = {
  text: "Text",
  number: "Zahl",
  select: "Auswahl",
  multi_select: "Mehrfach-Auswahl",
  boolean: "Ja/Nein",
  tags: "Tags",
};

export default function ProfileFieldsListPage() {
  const router = useRouter();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/studio/profile-fields");
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else setFields(data.fields || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createNew() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/profile-fields", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Neues Feld",
          kind: "text",
          isActive: false,
          order: fields.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fehler beim Erstellen");
        return;
      }
      router.push(`/studio/profile-fields/${data.field.id}`);
    } finally {
      setCreating(false);
    }
  }

  const system = fields.filter((f) => !f.ownerUserId);
  const custom = fields.filter((f) => f.ownerUserId);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">Profile-Felder</h1>
          <p className="text-sm text-white/40">
            {loading
              ? "…"
              : `${fields.length} Feld${fields.length === 1 ? "" : "er"} · System + eigene`}
            <span className="ml-2 text-white/30">
              (von Canzoia-Onboarding genutzt)
            </span>
          </p>
        </div>
        <button
          onClick={createNew}
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] transition disabled:opacity-50"
        >
          {creating ? "…" : "+ Neues Feld"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-white/30 text-sm">Lade Felder…</p>
      ) : (
        <>
          {system.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                System-Felder (Canzoia-sichtbar)
              </h2>
              <FieldTable fields={system} />
            </section>
          )}

          {custom.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                Eigene Felder
              </h2>
              <FieldTable fields={custom} />
            </section>
          )}

          {fields.length === 0 && !error && (
            <div className="border border-white/10 rounded-lg p-12 text-center">
              <p className="text-white/60 mb-4">Noch keine Profile-Felder.</p>
              <button
                onClick={createNew}
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium"
              >
                Erstes Feld anlegen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FieldTable({ fields }: { fields: FieldRow[] }) {
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5">
          <tr className="text-left text-[11px] text-white/50 uppercase tracking-wide">
            <th className="px-4 py-2.5 w-12">#</th>
            <th className="px-4 py-2.5">Label</th>
            <th className="px-4 py-2.5 font-mono">id</th>
            <th className="px-4 py-2.5">Typ</th>
            <th className="px-4 py-2.5">Gruppe</th>
            <th className="px-4 py-2.5 text-center">req</th>
            <th className="px-4 py-2.5 text-center">aktiv</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id} className="border-t border-white/5 hover:bg-white/5">
              <td className="px-4 py-2 text-white/40 tabular-nums">{f.order}</td>
              <td className="px-4 py-2">
                <Link
                  href={`/studio/profile-fields/${f.id}`}
                  className="text-[#f5eed6] hover:text-[#C8A97E]"
                >
                  {f.label}
                </Link>
              </td>
              <td className="px-4 py-2 text-[11px] text-white/40 font-mono">{f.id}</td>
              <td className="px-4 py-2 text-white/70">{KIND_LABELS[f.kind] ?? f.kind}</td>
              <td className="px-4 py-2 text-white/50">{f.category ?? "—"}</td>
              <td className="px-4 py-2 text-center">
                {f.required ? <span className="text-[#C8A97E]">●</span> : <span className="text-white/20">○</span>}
              </td>
              <td className="px-4 py-2 text-center">
                {f.isActive ? (
                  <span className="text-green-300">●</span>
                ) : (
                  <span className="text-white/20">○</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

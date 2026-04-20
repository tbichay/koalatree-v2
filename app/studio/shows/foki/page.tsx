"use client";

/**
 * Foki (FokusTemplates) — Studio-Library.
 *
 * Lists all system + admin-owned FokusTemplates and offers "+ Neuer Fokus".
 * Sits at /studio/shows/foki as a sub-tab next to Shows + Actors. Creating a
 * template here makes it available in every Show's "add Fokus" picker.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface FokusTemplateRow {
  id: string;
  displayName: string;
  description: string | null;
  emoji: string | null;
  minAlter: number;
  maxAlter: number;
  defaultDurationMin: number;
  supportedCategories: string[];
  ownerUserId: string | null;
  _count: { shows: number };
}

export default function FokiListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FokusTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/studio/shows/fokus-templates")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setTemplates(d.templates || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function createNew() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/shows/fokus-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Neuer Fokus",
          systemPromptSkeleton:
            "Erzaehle eine kurze, gut strukturierte Episode. (Anpassen!)",
          defaultUserInputSchema: { fields: [] },
          defaultCastRoles: {},
          supportedCategories: [],
          defaultDurationMin: 5,
          minAlter: 3,
          maxAlter: 99,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fehler beim Erstellen");
        return;
      }
      router.push(`/studio/shows/foki/${data.template.id}`);
    } finally {
      setCreating(false);
    }
  }

  const system = templates.filter((t) => !t.ownerUserId);
  const custom = templates.filter((t) => t.ownerUserId);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/studio/shows"
          className="px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          Shows
        </Link>
        <Link
          href="/studio/shows/actors"
          className="px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          Actors
        </Link>
        <Link
          href="/studio/shows/foki"
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#3d6b4a]/30 text-[#a8d5b8]"
        >
          Foki
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">Foki-Vorlagen</h1>
          <p className="text-sm text-white/40">
            {loading
              ? "…"
              : `${templates.length} Vorlage${templates.length === 1 ? "" : "n"} · System + eigene`}
          </p>
        </div>
        <button
          onClick={createNew}
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] transition disabled:opacity-50"
        >
          {creating ? "…" : "+ Neuer Fokus"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-white/30 text-sm">Lade Foki…</p>
      ) : (
        <>
          {system.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                System-Vorlagen (Seed)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {system.map((t) => (
                  <FokusCard key={t.id} template={t} />
                ))}
              </div>
            </section>
          )}

          {custom.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                Eigene Vorlagen
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {custom.map((t) => (
                  <FokusCard key={t.id} template={t} />
                ))}
              </div>
            </section>
          )}

          {templates.length === 0 && !error && (
            <div className="border border-white/10 rounded-lg p-12 text-center">
              <p className="text-white/60 mb-4">Noch keine Foki-Vorlagen.</p>
              <button
                onClick={createNew}
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium"
              >
                Erste Vorlage anlegen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FokusCard({ template }: { template: FokusTemplateRow }) {
  return (
    <Link
      href={`/studio/shows/foki/${template.id}`}
      className="block rounded-lg border border-white/10 bg-[#1A1A1A] hover:border-[#C8A97E]/50 transition p-4"
    >
      <div className="flex items-start gap-3 mb-2">
        <span className="text-3xl">{template.emoji ?? "✶"}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#f5eed6] font-semibold text-sm">{template.displayName}</h3>
          <p className="text-[10px] text-white/50 font-mono">{template.id}</p>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
          {template._count.shows} shows
        </span>
      </div>
      {template.description && (
        <p className="text-[11px] text-white/60 line-clamp-2 mb-2">{template.description}</p>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#C8A97E]/10 text-[#C8A97E]/80">
          {template.defaultDurationMin} min
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
          {template.minAlter}-{template.maxAlter}J
        </span>
        {template.supportedCategories.map((cat) => (
          <span
            key={cat}
            className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 capitalize"
          >
            {cat}
          </span>
        ))}
      </div>
    </Link>
  );
}

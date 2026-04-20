"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Actor {
  id: string;
  displayName: string;
  species: string | null;
  role: string | null;
  description: string | null;
  emoji: string | null;
  color: string | null;
  portraitUrl: string | null;
  voiceId: string;
  persona: string;
  expertise: string[];
  defaultTone: string | null;
  ownerUserId: string | null;
  _count: { shows: number };
}

export default function ActorsListPage() {
  const router = useRouter();
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/studio/shows/actors")
      .then((r) => r.json())
      .then((d) => setActors(d.actors || []))
      .finally(() => setLoading(false));
  }, []);

  async function createNew() {
    setCreating(true);
    const res = await fetch("/api/studio/shows/actors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Neuer Actor",
        voiceId: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs default — admin muss anpassen
        persona: "(Beschreibung noch offen)",
        expertise: [],
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.actor?.id) router.push(`/studio/shows/actors/${data.actor.id}`);
  }

  const seedActors = actors.filter((a) => !a.ownerUserId);
  const customActors = actors.filter((a) => a.ownerUserId);

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
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#3d6b4a]/30 text-[#a8d5b8]"
        >
          Actors
        </Link>
        <Link
          href="/studio/shows/foki"
          className="px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          Foki
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">Actors</h1>
          <p className="text-sm text-white/40">
            {loading ? "…" : `${actors.length} Actor${actors.length === 1 ? "" : "s"} · global + eigene`}
          </p>
        </div>
        <button
          onClick={createNew}
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] transition disabled:opacity-50"
        >
          {creating ? "…" : "+ Neuer Actor"}
        </button>
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Lade Actors…</p>
      ) : (
        <>
          {seedActors.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                KoalaTree Cast (Seed)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {seedActors.map((a) => (
                  <ActorCard key={a.id} actor={a} />
                ))}
              </div>
            </section>
          )}

          {customActors.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                Eigene Actors
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {customActors.map((a) => (
                  <ActorCard key={a.id} actor={a} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ActorCard({ actor }: { actor: Actor }) {
  return (
    <Link
      href={`/studio/shows/actors/${actor.id}`}
      className="block rounded-lg border border-white/10 bg-[#1A1A1A] hover:border-[#C8A97E]/50 transition p-4"
    >
      <div className="flex items-start gap-3 mb-2">
        <span className="text-3xl">{actor.emoji ?? "•"}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#f5eed6] font-semibold text-sm">{actor.displayName}</h3>
          <p className="text-[10px] text-white/50">
            {actor.role ?? "—"} · {actor.species ?? "—"}
          </p>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
          {actor._count.shows} shows
        </span>
      </div>
      {actor.description && (
        <p className="text-[11px] text-white/60 line-clamp-2 mb-2">{actor.description}</p>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        {actor.expertise.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[#C8A97E]/10 text-[#C8A97E]/80"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}

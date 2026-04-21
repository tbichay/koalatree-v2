"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ShowRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  category: string;
  ageBand: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
  _count: { foki: number; cast: number; episodes: number };
  readiness?: {
    ready: boolean;
    blockingFailures: number;
    warningFailures: number;
  };
}

export default function ShowsListPage() {
  const [shows, setShows] = useState<ShowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/studio/shows")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setShows(d.shows || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/studio/shows"
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#3d6b4a]/30 text-[#a8d5b8]"
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
          className="px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          Foki
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">Shows</h1>
          <p className="text-sm text-white/40">
            {loading ? "…" : `${shows.length} Show${shows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link
          href="/studio/shows/new"
          className="px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium hover:bg-[#d4b88c] transition"
        >
          + Neue Show
        </Link>
      </div>

      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : loading ? (
        <p className="text-white/30 text-sm">Lade Shows…</p>
      ) : shows.length === 0 ? (
        <div className="border border-white/10 rounded-lg p-12 text-center">
          <p className="text-white/60 mb-4">Noch keine Shows angelegt.</p>
          <Link
            href="/studio/shows/new"
            className="inline-block px-4 py-2 rounded-lg bg-[#C8A97E] text-[#141414] text-sm font-medium"
          >
            Erste Show anlegen
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shows.map((show) => (
            <Link
              key={show.id}
              href={`/studio/shows/${show.slug}`}
              className="block rounded-xl border border-white/10 bg-[#1A1A1A] hover:border-[#C8A97E]/50 transition overflow-hidden"
            >
              {/* Cover */}
              <div
                className="h-32 bg-gradient-to-br from-[#2A2A2A] to-[#1A1A1A] flex items-center justify-center text-4xl"
                style={show.coverUrl ? { backgroundImage: `url(${show.coverUrl})`, backgroundSize: "cover" } : {}}
              >
                {!show.coverUrl && <span className="opacity-30">▣</span>}
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-[#f5eed6] font-semibold truncate">{show.title}</h3>
                  {show.publishedAt && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">LIVE</span>
                  )}
                  {/* Readiness-Signal:
                      - LIVE + degraded → rotes DEGRADED-Badge (Generate wuerde 503en)
                      - DRAFT + !ready  → gelbes "X Checks offen"
                      - !ready ignored wenn keine readiness im Payload (Kompat-Schutz) */}
                  {show.readiness && !show.readiness.ready && show.publishedAt && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300"
                      title={`${show.readiness.blockingFailures} Pflicht-Check(s) offen`}
                    >
                      DEGRADED
                    </span>
                  )}
                  {show.readiness && !show.readiness.ready && !show.publishedAt && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300/80"
                      title={`${show.readiness.blockingFailures} Pflicht-Check(s) offen`}
                    >
                      {show.readiness.blockingFailures} offen
                    </span>
                  )}
                </div>
                {show.subtitle && <p className="text-xs text-white/50 mb-2 truncate">{show.subtitle}</p>}
                <p className="text-xs text-white/60 line-clamp-2 mb-3">{show.description}</p>

                <div className="flex items-center gap-3 text-[10px] text-white/40">
                  <span>{show._count.cast} Cast</span>
                  <span>•</span>
                  <span>{show._count.foki} Foki</span>
                  <span>•</span>
                  <span>{show._count.episodes} Episoden</span>
                </div>

                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 capitalize">
                    {show.category}
                  </span>
                  {show.ageBand && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                      {show.ageBand}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

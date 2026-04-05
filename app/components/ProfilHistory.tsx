"use client";

import { useState, useEffect, useCallback } from "react";

interface ProfilEventItem {
  id: string;
  feld: string;
  aktion: string;
  wert: string;
  alterWert: string | null;
  createdAt: string;
}

interface Props {
  profilId: string;
  profilName: string;
  onClose: () => void;
}

const FELD_LABELS: Record<string, string> = {
  interessen: "Interessen",
  charaktereigenschaften: "Charakter",
  herausforderungen: "Herausforderungen",
  tags: "Themen",
  lieblingsfarbe: "Lieblingsfarbe",
  lieblingstier: "Lieblingstier",
};

const FELD_EMOJI: Record<string, string> = {
  interessen: "⭐",
  charaktereigenschaften: "💪",
  herausforderungen: "🌱",
  tags: "🏷️",
  lieblingsfarbe: "🎨",
  lieblingstier: "🐾",
};

const AKTION_LABELS: Record<string, string> = {
  added: "hinzugefügt",
  removed: "entfernt",
  changed: "geändert",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}

function groupByMonth(events: ProfilEventItem[]): Map<string, ProfilEventItem[]> {
  const groups = new Map<string, ProfilEventItem[]>();
  for (const e of events) {
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return groups;
}

function eventDescription(e: ProfilEventItem): string {
  const label = FELD_LABELS[e.feld] || e.feld;
  if (e.aktion === "changed") {
    return `${label}: ${e.alterWert} \u2192 ${e.wert}`;
  }
  return `${e.wert} ${e.aktion === "added" ? "zu" : "aus"} ${label} ${AKTION_LABELS[e.aktion]}`;
}

export default function ProfilHistory({ profilId, profilName, onClose }: Props) {
  const [events, setEvents] = useState<ProfilEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/profile/${profilId}/history`);
      if (res.ok) {
        setEvents(await res.json());
      }
    } catch (err) {
      console.error("[ProfilHistory] Fetch error:", err);
    }
    setLoading(false);
  }, [profilId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleDeleteOne = async (eventId: string) => {
    setDeleting((prev) => new Set(prev).add(eventId));
    try {
      const res = await fetch(`/api/profile/${profilId}/history/${eventId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
      }
    } catch (err) {
      console.error("[ProfilHistory] Delete error:", err);
    }
    setDeleting((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Alle ${events.length} Einträge löschen? Die Geschichten vergessen dann die Entwicklung.`)) return;
    try {
      const res = await fetch(`/api/profile/${profilId}/history`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds: events.map((e) => e.id) }),
      });
      if (res.ok) setEvents([]);
    } catch (err) {
      console.error("[ProfilHistory] Bulk delete error:", err);
    }
  };

  const grouped = groupByMonth(events);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] rounded-2xl bg-[#1a2a1a] border border-[#3d6b4a]/30 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="font-bold text-lg text-[#f5eed6]">
              Entwicklung von {profilName}
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              {events.length > 0 ? `${events.length} Änderungen` : "Noch keine Änderungen"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <button
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                onClick={handleDeleteAll}
              >
                Alle löschen
              </button>
            )}
            <button
              className="text-white/60 hover:text-white/80 transition-colors text-lg p-1"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-white/60">Lade...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🌱</div>
              <p className="text-white/50 text-sm">Noch keine Änderungen gespeichert</p>
              <p className="text-white/30 text-xs mt-1">
                Wenn du das Profil aktualisierst, merkt sich Koda die Entwicklung
              </p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([month, monthEvents]) => (
              <div key={month}>
                <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">
                  {month}
                </h3>
                <div className="space-y-1.5">
                  {monthEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 group rounded-lg px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <span className="text-base flex-shrink-0">
                        {FELD_EMOJI[e.feld] || "📝"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/70 truncate">
                          {eventDescription(e)}
                        </p>
                        <p className="text-[10px] text-white/25">
                          {formatDate(e.createdAt)}
                        </p>
                      </div>
                      <button
                        className="text-white/50 group-hover:text-white/80 hover:!text-red-400 transition-all text-xs p-1 flex-shrink-0 disabled:opacity-50"
                        onClick={() => handleDeleteOne(e.id)}
                        disabled={deleting.has(e.id)}
                        title="Eintrag löschen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        {events.length > 0 && (
          <div className="px-5 py-3 border-t border-white/5 text-center">
            <p className="text-[10px] text-white/20">
              Gelöschte Einträge werden dauerhaft entfernt und nicht mehr in Geschichten verwendet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

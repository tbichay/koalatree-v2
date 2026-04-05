"use client";

import { useState, useEffect } from "react";
import StoryVisualPlayer from "./StoryVisualPlayer";

interface TimelineEntry {
  characterId: string;
  startMs: number;
  endMs: number;
}

interface Props {
  isFirstTime: boolean;   // Keine Profile → Fullscreen-Modus
  isAdmin: boolean;
  hasAudio: boolean;
  onDismiss: () => void;
  onSkipToProfile: () => void;
  onAudioGenerated: () => void;
}

export default function WelcomeStory({
  isFirstTime, isAdmin, hasAudio,
  onDismiss, onSkipToProfile, onAudioGenerated,
}: Props) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");

  // Lade Timeline für den Visual Player
  useEffect(() => {
    if (!hasAudio) {
      setLoadingTimeline(false);
      return;
    }
    fetch("/api/audio/onboarding/timeline")
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setTimeline(Array.isArray(data) ? data : []))
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTimeline(false));
  }, [hasAudio]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setAdminMessage("Audio wird generiert... das dauert 1-2 Minuten.");
    try {
      const res = await fetch("/api/admin/onboarding", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setAdminMessage("Fertig! Audio wurde generiert.");
        onAudioGenerated();
        // Reload timeline
        const tlRes = await fetch("/api/audio/onboarding/timeline");
        if (tlRes.ok) setTimeline(await tlRes.json());
      } else {
        setAdminMessage(`Fehler: ${data.error}`);
      }
    } catch {
      setAdminMessage("Netzwerk-Fehler");
    }
    setRegenerating(false);
  };

  // ═══ Erster Besuch: Großer Welcome-Screen ═══
  if (isFirstTime) {
    return (
      <div className="mb-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[#f5eed6] mb-2">
            Willkommen am KoalaTree!
          </h2>
          <p className="text-white/50 text-sm max-w-md mx-auto">
            Bevor du loslegst, stellen sich Koda und seine Freunde vor.
            Lerne die Stimmen kennen, die deine Geschichten erzählen werden.
          </p>
        </div>

        {hasAudio && !loadingTimeline && timeline.length > 0 ? (
          <StoryVisualPlayer
            audioUrl="/api/audio/onboarding"
            timeline={timeline}
            title="Willkommen am KoalaTree!"
            autoPlay
            onEnded={onSkipToProfile}
          />
        ) : hasAudio && loadingTimeline ? (
          <div className="card p-8 text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-[#a8d5b8] rounded-full animate-spin mx-auto" />
          </div>
        ) : null}

        {/* Admin: Audio generieren */}
        {isAdmin && !hasAudio && (
          <div className="card p-6 text-center">
            <p className="text-white/60 text-sm mb-3">Onboarding-Audio noch nicht generiert</p>
            <button
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
              disabled={regenerating}
              onClick={handleRegenerate}
            >
              {regenerating ? "Generiere..." : "Audio generieren"}
            </button>
            {adminMessage && <p className="text-xs text-white/60 mt-2">{adminMessage}</p>}
          </div>
        )}

        <div className="text-center mt-6">
          <button
            onClick={onSkipToProfile}
            className="text-[#a8d5b8] text-sm hover:text-[#c8e5d0] transition-colors"
          >
            Überspringen — direkt Profil erstellen
          </button>
        </div>
      </div>
    );
  }

  // ═══ Bestehende User: Kompaktere Darstellung mit Visual Player ═══
  return (
    <div className="mb-8 p-5 rounded-2xl bg-gradient-to-br from-[#2a4a2a]/60 to-[#1a3a2a]/60 border border-[#4a7c59]/30">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🐨</div>
          <div>
            <h2 className="text-lg font-bold text-[#f5eed6]">
              Willkommen am KoalaTree!
            </h2>
            <p className="text-sm text-white/60">
              Koda und Kiki stellen sich und ihre Freunde vor
            </p>
          </div>
        </div>
        <button
          className="text-white/50 hover:text-white/70 transition-colors text-xs"
          onClick={onDismiss}
        >
          Ausblenden
        </button>
      </div>

      {hasAudio && !loadingTimeline && timeline.length > 0 ? (
        <StoryVisualPlayer
          audioUrl="/api/audio/onboarding"
          timeline={timeline}
          title="Willkommen am KoalaTree!"
        />
      ) : hasAudio && loadingTimeline ? (
        <div className="py-4 text-center">
          <div className="w-6 h-6 border-2 border-white/20 border-t-[#a8d5b8] rounded-full animate-spin mx-auto" />
        </div>
      ) : null}

      {isAdmin && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <button
              className="text-xs px-3 py-1.5 rounded bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30 transition-colors disabled:opacity-50"
              disabled={regenerating}
              onClick={handleRegenerate}
            >
              {regenerating ? "Generiere..." : hasAudio ? "Audio neu generieren" : "Audio erstmalig generieren"}
            </button>
            <span className="text-[10px] text-white/20">Admin</span>
          </div>
          {adminMessage && (
            <p className="text-xs text-white/60 mt-2 break-all">{adminMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

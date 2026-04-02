"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavBar from "../components/NavBar";
import AudioPlayer from "../components/AudioPlayer";
import { STORY_FORMATE, PAEDAGOGISCHE_ZIELE, StoryFormat, PaedagogischesZiel } from "@/lib/types";

interface GeschichteWithProfil {
  id: string;
  format: string;
  ziel: string;
  besonderesThema?: string;
  text: string;
  audioUrl?: string;
  zusammenfassung?: string;
  createdAt: string;
  kindProfil: {
    name: string;
    alter: number;
    geschlecht?: string;
  };
}

export default function GeschichtenPage() {
  const router = useRouter();
  const [geschichten, setGeschichten] = useState<GeschichteWithProfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingAudioId, setGeneratingAudioId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/geschichten")
      .then((res) => res.json())
      .then(setGeschichten)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-white/40">Geschichten werden geladen...</p>
      </main>
    );
  }

  // Group by child
  const grouped = geschichten.reduce((acc, g) => {
    const name = g.kindProfil.name;
    if (!acc[name]) acc[name] = [];
    acc[name].push(g);
    return acc;
  }, {} as Record<string, GeschichteWithProfil[]>);

  const cleanPreview = (text: string) =>
    text
      .replace(/\[(?:ATEMPAUSE|PAUSE|LANGSAM|DANKBARKEIT|KOALA|KODA|KIKI)\]/g, "")
      .replace(/\[SFX:[^\]]+\]/g, "")
      .slice(0, 150)
      .trim() + "...";

  const regenerateAudio = async (g: GeschichteWithProfil) => {
    setGeneratingAudioId(g.id);
    try {
      const response = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: g.text, geschichteId: g.id }),
      });
      if (!response.ok) throw new Error("Audio-Fehler");
      const data = await response.json();
      setGeschichten((prev) =>
        prev.map((story) =>
          story.id === g.id ? { ...story, audioUrl: data.audioUrl } : story
        )
      );
    } catch (err) {
      console.error("Audio regeneration failed:", err);
    } finally {
      setGeneratingAudioId(null);
    }
  };

  const hasPlayableAudio = (url?: string) =>
    url && url !== "local" && url.length > 10;

  return (
    <>
    <NavBar />
    <main className="relative flex-1 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">

        <h1 className="text-3xl font-bold mb-8">Geschichten-Bibliothek</h1>

        {geschichten.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 w-32 h-32 relative">
              <Image src="/koda-welcome.png" alt="Koda heißt dich willkommen" fill className="object-contain rounded-2xl" />
            </div>
            <p className="text-white/50 text-lg mb-4">Noch keine Geschichten erstellt</p>
            <p className="text-white/40 text-sm mb-6">Koda wartet schon gespannt darauf, dir eine Geschichte zu erzählen!</p>
            <button className="btn-primary" onClick={() => router.push("/dashboard")}>
              Erste Geschichte erstellen
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([name, stories]) => (
            <div key={name} className="mb-8">
              <h2 className="text-lg font-semibold text-white/70 mb-3">
                Geschichten für {name}
              </h2>
              <div className="space-y-3">
                {stories.map((g) => {
                  const formatInfo = STORY_FORMATE[g.format as StoryFormat];
                  const zielInfo = PAEDAGOGISCHE_ZIELE[g.ziel as PaedagogischesZiel];
                  const isExpanded = expandedId === g.id;

                  return (
                    <div key={g.id} className="card p-4">
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : g.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{formatInfo?.emoji || "📖"}</span>
                            <span className="font-medium">{formatInfo?.label || g.format}</span>
                            {hasPlayableAudio(g.audioUrl) && <span className="text-xs text-green-400">🎧</span>}
                          </div>
                          <span className="text-xs text-white/40">
                            {new Date(g.createdAt).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-white/50">
                          <span>{zielInfo?.emoji} {zielInfo?.label}</span>
                          {g.besonderesThema && (
                            <>
                              <span>·</span>
                              <span>{g.besonderesThema}</span>
                            </>
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-sm text-white/40 mt-2">{cleanPreview(g.text)}</p>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="text-sm text-white/70 leading-relaxed max-h-60 overflow-y-auto mb-4">
                            {g.text
                              .replace(/\[(?:ATEMPAUSE|PAUSE|LANGSAM|DANKBARKEIT|KOALA|KODA|KIKI)\]/g, "")
                              .replace(/\[SFX:[^\]]+\]/g, "")
                              .split("\n\n")
                              .map((p, i) => (
                                <p key={i} className="mb-2">{p}</p>
                              ))}
                          </div>
                          {hasPlayableAudio(g.audioUrl) ? (
                            <div className="mb-3">
                              <AudioPlayer
                                audioUrl={g.audioUrl!}
                                title={`${formatInfo?.emoji || "📖"} ${formatInfo?.label || g.format} für ${name}`}
                                compact
                              />
                            </div>
                          ) : (
                            <div className="mb-3">
                              <button
                                className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                                disabled={generatingAudioId === g.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  regenerateAudio(g);
                                }}
                              >
                                {generatingAudioId === g.id
                                  ? "Audio wird erzeugt..."
                                  : "🎧 Audio-Hörspiel erzeugen"}
                              </button>
                            </div>
                          )}
                          <button
                            className="text-sm text-[#a8d5b8] hover:text-[#c8e5d0]"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/story/result?id=${g.id}`);
                            }}
                          >
                            Geschichte öffnen →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
    </>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { StoryConfig, STORY_FORMATE, PAEDAGOGISCHE_ZIELE } from "@/lib/types";
import Stars from "../../components/Stars";
import StoryPreview from "../../components/StoryPreview";
import AudioPlayer from "../../components/AudioPlayer";

type Phase = "generating-text" | "text-done" | "generating-audio" | "done" | "error";

export default function ResultPage() {
  const router = useRouter();
  const [profilId, setProfilId] = useState<string | null>(null);
  const [kindName, setKindName] = useState("");
  const [config, setConfig] = useState<StoryConfig | null>(null);
  const [storyText, setStoryText] = useState("");
  const [geschichteId, setGeschichteId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("generating-text");
  const [error, setError] = useState("");
  const initialized = useRef(false);

  const generateStory = useCallback(async (pId: string, c: StoryConfig) => {
    try {
      setPhase("generating-text");
      setStoryText("");
      setGeschichteId(null);

      const response = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilId: pId, config: c }),
      });

      if (!response.ok) throw new Error("Story-Generierung fehlgeschlagen");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Stream nicht verfügbar");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n").filter(Boolean);

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                setStoryText(fullText);
              }
              if (data.done && data.geschichteId) {
                setGeschichteId(data.geschichteId);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      setPhase("text-done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setPhase("error");
    }
  }, []);

  const generateAudio = async () => {
    try {
      setPhase("generating-audio");

      const response = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: storyText, geschichteId }),
      });

      if (!response.ok) throw new Error("Audio-Generierung fehlgeschlagen");

      const contentType = response.headers.get("Content-Type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        setAudioUrl(data.audioUrl);
      } else {
        const blob = await response.blob();
        setAudioUrl(URL.createObjectURL(blob));
      }
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio-Fehler");
      setPhase("error");
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const configData = sessionStorage.getItem("dreamweaver-config");
    const pId = sessionStorage.getItem("dreamweaver-profilId");
    const name = sessionStorage.getItem("dreamweaver-kindName");

    if (!configData || !pId || !name) {
      router.push("/");
      return;
    }

    const c = JSON.parse(configData) as StoryConfig;
    setProfilId(pId);
    setKindName(name);
    setConfig(c);
    generateStory(pId, c);
  }, [router, generateStory]);

  if (!profilId || !config) return null;

  const formatInfo = STORY_FORMATE[config.format];
  const zielInfo = PAEDAGOGISCHE_ZIELE[config.ziel];

  return (
    <main className="relative flex-1 flex flex-col items-center px-4 py-12">
      <Stars />
      <div className="relative z-10 w-full max-w-2xl space-y-6">
        <button
          className="text-white/40 hover:text-white/60 text-sm transition-colors"
          onClick={() => router.push(`/story?profilId=${profilId}`)}
        >
          ← Zurück zum Konfigurator
        </button>

        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">
            {formatInfo.emoji} Geschichte für {kindName}
          </h1>
          <div className="flex items-center justify-center gap-3 text-white/50 text-sm">
            <span>{formatInfo.label}</span>
            <span>·</span>
            <span>{zielInfo.emoji} {zielInfo.label}</span>
          </div>
        </div>

        {phase === "generating-text" && storyText.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-4 float">✨</div>
            <p className="text-white/60 text-lg">Die Geschichte wird gewoben...</p>
            <p className="text-white/40 text-sm mt-2">Das dauert nur einen Moment</p>
          </div>
        )}

        {storyText && <StoryPreview text={storyText} />}

        {phase === "text-done" && (
          <div className="text-center">
            <button className="btn-primary text-lg px-8 py-3" onClick={generateAudio}>
              Audio-Hörspiel erzeugen 🎧
            </button>
            <p className="text-white/40 text-sm mt-2">
              Wandelt die Geschichte in eine Erzählstimme um
            </p>
          </div>
        )}

        {phase === "generating-audio" && (
          <div className="card p-8 text-center">
            <div className="text-3xl mb-3 float">🎧</div>
            <p className="text-white/60">Audio wird erzeugt...</p>
            <p className="text-white/40 text-sm mt-1">Das kann bis zu einer Minute dauern</p>
          </div>
        )}

        {phase === "done" && audioUrl && (
          <AudioPlayer audioUrl={audioUrl} title={`Gute-Nacht-Geschichte für ${kindName}`} />
        )}

        {phase === "error" && (
          <div className="card p-6 border-red-500/30 bg-red-500/10 text-center">
            <p className="text-red-300 mb-3">{error}</p>
            <button
              className="btn-primary"
              onClick={() => generateStory(profilId, config)}
            >
              Nochmal versuchen
            </button>
          </div>
        )}

        {(phase === "text-done" || phase === "done") && (
          <div className="text-center pt-4">
            <button
              className="text-indigo-300 hover:text-indigo-200 text-sm transition-colors"
              onClick={() => router.push(`/story?profilId=${profilId}`)}
            >
              Neue Geschichte erstellen
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

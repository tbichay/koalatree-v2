"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StoryConfig, StoryFormat, PaedagogischesZiel, STORY_FORMATE, PAEDAGOGISCHE_ZIELE } from "@/lib/types";
import Image from "next/image";
import NavBar from "../../components/NavBar";
import Stars from "../../components/Stars";
import StoryPreview from "../../components/StoryPreview";
import AudioPlayer from "../../components/AudioPlayer";

type Phase = "loading" | "generating-text" | "text-done" | "generating-audio" | "done" | "error";

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingId = searchParams.get("id");

  const [profilId, setProfilId] = useState<string | null>(null);
  const [kindName, setKindName] = useState("");
  const [config, setConfig] = useState<StoryConfig | null>(null);
  const [storyText, setStoryText] = useState("");
  const [geschichteId, setGeschichteId] = useState<string | null>(existingId);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [titel, setTitel] = useState("");
  const [phase, setPhase] = useState<Phase>(existingId ? "loading" : "generating-text");
  const [error, setError] = useState("");
  const [format, setFormat] = useState<StoryFormat | null>(null);
  const [ziel, setZiel] = useState<PaedagogischesZiel | null>(null);
  const initialized = useRef(false);

  // Load existing story from DB
  const loadExisting = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/geschichten/${id}`);
      if (!res.ok) throw new Error("Geschichte nicht gefunden");
      const data = await res.json();
      setStoryText(data.text);
      setProfilId(data.kindProfil.id);
      setKindName(data.kindProfil.name);
      setFormat(data.format as StoryFormat);
      setZiel(data.ziel as PaedagogischesZiel);
      setGeschichteId(data.id);
      setConfig({ kindProfilId: data.kindProfil.id, format: data.format, ziel: data.ziel, dauer: data.dauer });
      if (data.titel) setTitel(data.titel);
      if (data.audioUrl && data.audioUrl !== "local") {
        setAudioUrl(data.audioUrl);
        setPhase("done");
      } else {
        setPhase("text-done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
      setPhase("error");
    }
  }, []);

  // Generate new story via streaming
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
                if (data.titel) setTitel(data.titel);
                window.history.replaceState(null, "", `/story/result?id=${data.geschichteId}`);
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

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Audio-Fehler" }));
        throw new Error(errData.error || "Audio-Generierung fehlgeschlagen");
      }

      const data = await response.json();
      setAudioUrl(data.audioUrl);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio-Fehler");
      setPhase("error");
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Mode 1: Load existing story by ID
    if (existingId) {
      loadExisting(existingId);
      return;
    }

    // Mode 2: Generate new story from sessionStorage config
    const configData = sessionStorage.getItem("koalatree-config");
    const pId = sessionStorage.getItem("koalatree-profilId");
    const name = sessionStorage.getItem("koalatree-kindName");

    if (!configData || !pId || !name) {
      router.push("/dashboard");
      return;
    }

    const c = JSON.parse(configData) as StoryConfig;
    setProfilId(pId);
    setKindName(name);
    setConfig(c);
    setFormat(c.format);
    setZiel(c.ziel);
    generateStory(pId, c);
  }, [router, generateStory, loadExisting, existingId]);

  if (phase === "loading") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-white/40">Geschichte wird geladen...</p>
      </main>
    );
  }

  const formatInfo = format ? STORY_FORMATE[format] : null;
  const zielInfo = ziel ? PAEDAGOGISCHE_ZIELE[ziel] : null;

  return (
    <>
    <NavBar />
    <main className="relative flex-1 flex flex-col items-center px-4 py-8">
      <Stars />
      <div className="relative z-10 w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            className="text-white/40 hover:text-white/60 text-sm transition-colors"
            onClick={() => profilId ? router.push(`/story?profilId=${profilId}`) : router.push("/dashboard")}
          >
            ← Zurück
          </button>
          <button
            className="text-white/40 hover:text-white/60 text-sm transition-colors"
            onClick={() => router.push("/geschichten")}
          >
            Alle Geschichten →
          </button>
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">
            {titel || `${formatInfo?.emoji || "📖"} Geschichte für ${kindName}`}
          </h1>
          {formatInfo && zielInfo && (
            <div className="flex items-center justify-center gap-3 text-white/50 text-sm">
              <span>{formatInfo.label}</span>
              <span>·</span>
              <span>{zielInfo.emoji} {zielInfo.label}</span>
            </div>
          )}
        </div>

        {phase === "generating-text" && storyText.length === 0 && (
          <div className="card p-12 text-center">
            <div className="float mx-auto mb-4 w-32 h-32 relative">
              <Image src="/koda-thinking.png" alt="Koda denkt nach" fill className="object-contain rounded-2xl" />
            </div>
            <p className="text-white/60 text-lg">Koda denkt nach...</p>
            <p className="text-white/40 text-sm mt-2">Gleich beginnt deine Geschichte</p>
          </div>
        )}

        {storyText && <StoryPreview text={storyText} />}

        {phase === "text-done" && (
          <div className="text-center">
            <button className="btn-primary text-lg px-8 py-3" onClick={generateAudio}>
              Audio-Hörspiel erzeugen 🎧
            </button>
            <p className="text-white/40 text-sm mt-2">
              Koda und Kiki erwecken die Geschichte zum Leben
            </p>
          </div>
        )}

        {phase === "generating-audio" && (
          <div className="card p-8 text-center">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="float w-20 h-20 relative">
                <Image src="/koda-thinking.png" alt="Koda" fill className="object-contain rounded-2xl" />
              </div>
              <div className="float w-20 h-20 relative" style={{ animationDelay: "0.5s" }}>
                <Image src="/kiki-portrait.png" alt="Kiki" fill className="object-contain rounded-2xl" />
              </div>
            </div>
            <p className="text-white/60">Koda und Kiki bereiten das Hörspiel vor...</p>
            <p className="text-white/40 text-sm mt-1">Das kann bis zu einer Minute dauern</p>
          </div>
        )}

        {phase === "done" && audioUrl && (
          <AudioPlayer audioUrl={audioUrl} title={`Geschichte für ${kindName}`} />
        )}

        {phase === "error" && (
          <div className="card p-6 border-red-500/30 bg-red-500/10 text-center">
            <p className="text-red-300 mb-3">{error}</p>
            {profilId && config && (
              <button className="btn-primary" onClick={() => generateStory(profilId, config)}>
                Nochmal versuchen
              </button>
            )}
          </div>
        )}

        {(phase === "text-done" || phase === "done") && profilId && (
          <div className="text-center pt-4">
            <button
              className="text-[#a8d5b8] hover:text-[#c8e5d0] text-sm transition-colors"
              onClick={() => router.push(`/story?profilId=${profilId}`)}
            >
              Neue Geschichte erstellen
            </button>
          </div>
        )}
      </div>
    </main>
    </>
  );
}

export default function ResultPage() {
  return (
    <Suspense>
      <ResultContent />
    </Suspense>
  );
}

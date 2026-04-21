"use client";

/**
 * VoiceInputButton — Web Speech API Diktat-Button.
 *
 * Nutzt `window.SpeechRecognition` (oder Webkit-Prefix in Safari/Chrome).
 * Nur Client-seitig verfügbar, rendert nichts wenn die API fehlt (Firefox).
 *
 * Usage:
 *   <VoiceInputButton
 *     onTranscript={(text) => setValue((v) => v + " " + text)}
 *     lang="de-DE"
 *   />
 *
 * Default-Sprache ist de-DE (Koalatree-Primaersprache).
 */

import { useEffect, useRef, useState } from "react";

// Minimal-Typen fuer die Web Speech API — das Browser-Lib liefert nur bei
// einigen TS-Versionen vollstaendige Deklarationen.
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};
type SpeechRecognitionErrorEvent = { error: string };

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoiceInputButton({
  onTranscript,
  lang = "de-DE",
  className = "",
  size = "md",
}: {
  /** Final-Transkript, wird bei jedem "final" Result aufgerufen. */
  onTranscript: (text: string) => void;
  /** BCP-47 Sprach-Code (default de-DE). */
  lang?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  // Lazy initializer: laeuft auf Server als null (typeof window), auf Client
  // mit echter Check — ohne setState-in-Effect (vermeidet react-hooks/
  // set-state-in-effect Lint-Fehler und den hydrate-flash).
  const [available] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : getSpeechRecognitionCtor() !== null
  );
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    return () => {
      // cleanup on unmount — stoppt laufende Recognition
      try {
        recogRef.current?.stop();
      } catch {
        /* swallow: already stopped */
      }
    };
  }, []);

  function start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setError(null);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false; // nur finale Resultate ausloesen
    rec.lang = lang;

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) onTranscript(text);
        }
      }
    };
    rec.onerror = (ev) => {
      setError(ev.error);
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
    };

    try {
      rec.start();
      recogRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    try {
      recogRef.current?.stop();
    } catch {
      /* swallow */
    }
  }

  if (available === false) return null; // Firefox / no Speech API

  const isSm = size === "sm";
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={available === null}
        className={
          `rounded-lg font-medium transition ${
            recording
              ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          } ${isSm ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`
        }
        title={
          recording
            ? "Diktat stoppen"
            : "Diktat starten (Web Speech API — Chrome/Safari)"
        }
      >
        {recording ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-1.5 align-middle" />
            <span className="align-middle">Stop</span>
          </>
        ) : (
          <>🎤 Diktieren</>
        )}
      </button>
      {error && (
        <span className="text-[10px] text-red-300/80">
          {error === "not-allowed"
            ? "Mikro-Zugriff verweigert"
            : error === "no-speech"
            ? "Keine Spracheingabe erkannt"
            : error}
        </span>
      )}
    </div>
  );
}

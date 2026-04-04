"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CHARACTERS,
  POSE_LABELS,
  SCENE_LABELS,
  type CharacterKey,
  type PoseKey,
  type SceneKey,
} from "@/lib/studio";
import Stars from "../components/Stars";
import PageTransition from "../components/PageTransition";

interface GeneratedImage {
  url: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

type GenerateType = "character" | "hero-bg";

export default function StudioPage() {
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [genType, setGenType] = useState<GenerateType>("character");
  const [character, setCharacter] = useState<CharacterKey>("koda");
  const [pose, setPose] = useState<PoseKey>("portrait");
  const [scene, setScene] = useState<SceneKey>("golden");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    filename: string;
    prompt: string;
  } | null>(null);
  const [error, setError] = useState("");

  // Gallery
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);

  // Check admin status
  useEffect(() => {
    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => {
        setIsAdmin(d.isAdmin || false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load gallery
  const loadGallery = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/generate");
      if (res.ok) {
        const data = await res.json();
        setGallery(data.images || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadGallery();
  }, [isAdmin, loadGallery]);

  // Update scene when character changes (use character's default)
  useEffect(() => {
    const c = CHARACTERS[character];
    if (c) setScene(c.defaultBackground as SceneKey);
  }, [character]);

  // Generate image
  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    setResult(null);

    try {
      const body =
        genType === "hero-bg"
          ? { type: "hero-bg" }
          : { character, pose, scene, type: "character" };

      const res = await fetch("/api/admin/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler bei der Generierung");
        return;
      }

      setResult({ url: data.url, filename: data.filename, prompt: data.prompt });
      loadGallery(); // refresh gallery
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setGenerating(false);
    }
  };

  // ── Loading / Not Admin ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/40 text-lg">Laden...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold">KoalaTree Studio</h1>
        <p className="text-white/50 text-center">
          Das Studio ist nur f\u00FCr Administratoren zug\u00E4nglich.
        </p>
        <Link href="/dashboard" className="btn-primary mt-4">
          Zur\u00FCck zum Dashboard
        </Link>
      </div>
    );
  }

  // ── Main Studio UI ────────────────────────────────────────────────
  const charEntries = Object.entries(CHARACTERS) as [CharacterKey, (typeof CHARACTERS)[CharacterKey]][];
  const poseEntries = Object.entries(POSE_LABELS) as [PoseKey, string][];
  const sceneEntries = Object.entries(SCENE_LABELS) as [SceneKey, string][];

  return (
    <PageTransition>
      <Stars />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-32 sm:pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              🎨 KoalaTree Studio
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Bild-Generierung f\u00FCr Portraits, Szenen & Marketing-Assets
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-6">
          {/* ── Left: Controls ──────────────────────────────────── */}
          <div className="space-y-5">
            {/* Type selector */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                Typ
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setGenType("character")}
                  className={`chip ${genType === "character" ? "chip-selected" : ""}`}
                >
                  🐨 Charakter-Portrait
                </button>
                <button
                  onClick={() => setGenType("hero-bg")}
                  className={`chip ${genType === "hero-bg" ? "chip-selected" : ""}`}
                >
                  🌳 Hero-Hintergrund
                </button>
              </div>
            </div>

            {/* Character selector */}
            {genType === "character" && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                  Charakter
                </h2>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {charEntries.map(([key, c]) => (
                    <button
                      key={key}
                      onClick={() => setCharacter(key)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                        character === key
                          ? "bg-white/15 ring-2 ring-[#a8d5b8]/50"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <span className="text-2xl">{c.emoji}</span>
                      <span className="text-xs text-white/70">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pose selector */}
            {genType === "character" && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                  Pose
                </h2>
                <div className="flex flex-wrap gap-2">
                  {poseEntries.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPose(key)}
                      className={`chip ${pose === key ? "chip-selected" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scene selector */}
            {genType === "character" && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                  Hintergrund / Szene
                </h2>
                <div className="flex flex-wrap gap-2">
                  {sceneEntries.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setScene(key)}
                      className={`chip ${scene === key ? "chip-selected" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary w-full text-center flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generiere...
                </>
              ) : (
                <>
                  ✨ Bild generieren
                </>
              )}
            </button>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* ── Right: Preview & Result ─────────────────────────── */}
          <div className="space-y-5">
            {/* Current selection summary */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                Vorschau
              </h2>
              {genType === "hero-bg" ? (
                <div className="text-center py-8">
                  <span className="text-5xl mb-3 block">🌳</span>
                  <p className="text-white/70">Hero-Hintergrund (16:9)</p>
                  <p className="text-white/40 text-sm mt-1">
                    Magischer KoalaTree ohne Charaktere
                  </p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <span className="text-6xl mb-3 block">
                    {CHARACTERS[character].emoji}
                  </span>
                  <p className="text-lg font-semibold">{CHARACTERS[character].name}</p>
                  <p className="text-white/50 text-sm">
                    {CHARACTERS[character].tier} &middot;{" "}
                    {POSE_LABELS[pose]} &middot;{" "}
                    {SCENE_LABELS[scene]}
                  </p>
                </div>
              )}
            </div>

            {/* Generated result */}
            {result && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                  Ergebnis
                </h2>
                <div className="relative aspect-square rounded-xl overflow-hidden bg-black/20">
                  <Image
                    src={result.url}
                    alt={result.filename}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-white/50">{result.filename}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPrompt(!showPrompt)}
                      className="text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showPrompt ? "Prompt ausblenden" : "Prompt anzeigen"}
                    </button>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#a8d5b8] hover:text-[#c8e5d8] transition-colors"
                    >
                      \u00D6ffnen ↗
                    </a>
                  </div>
                </div>
                {showPrompt && (
                  <pre className="mt-3 text-xs text-white/40 bg-black/20 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                    {result.prompt}
                  </pre>
                )}
              </div>
            )}

            {/* Generating indicator */}
            {generating && !result && (
              <div className="card p-8 text-center">
                <div className="inline-block w-10 h-10 border-3 border-white/10 border-t-[#a8d5b8] rounded-full animate-spin mb-4" />
                <p className="text-white/50">
                  Bild wird generiert...
                </p>
                <p className="text-white/30 text-sm mt-1">
                  Das kann 30\u201360 Sekunden dauern
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Gallery ───────────────────────────────────────────── */}
        {gallery.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4">
              📁 Galerie ({gallery.length} Bilder)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {gallery.map((img) => (
                <a
                  key={img.url}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition-all"
                >
                  <Image
                    src={img.url}
                    alt={img.filename}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                    unoptimized
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <span className="text-xs text-white/80 truncate block">
                      {img.filename}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

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
  baseName: string;
  canonicalName: string;
  isActive: boolean;
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
  const [activeFiles, setActiveFiles] = useState<string[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [activateMsg, setActivateMsg] = useState("");

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
        setActiveFiles(data.activeFiles || []);
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
      loadGallery();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setGenerating(false);
    }
  };

  // Activate a version as the website portrait
  const handleActivate = async (filename: string) => {
    setActivating(filename);
    setActivateMsg("");
    try {
      const res = await fetch("/api/admin/studio/generate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (res.ok) {
        setActivateMsg(data.message || "Aktiviert!");
        loadGallery();
      } else {
        setActivateMsg(data.error || "Fehler");
      }
    } catch {
      setActivateMsg("Netzwerkfehler");
    } finally {
      setActivating(null);
      setTimeout(() => setActivateMsg(""), 4000);
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
        <div className="text-4xl">{"\uD83D\uDD12"}</div>
        <h1 className="text-xl font-semibold">KoalaTree Studio</h1>
        <p className="text-white/50 text-center">
          Das Studio ist nur f&uuml;r Administratoren zug&auml;nglich.
        </p>
        <Link href="/dashboard" className="btn-primary mt-4">
          Zur&uuml;ck zum Dashboard
        </Link>
      </div>
    );
  }

  // ── Main Studio UI ────────────────────────────────────────────────
  const charEntries = Object.entries(CHARACTERS) as [CharacterKey, (typeof CHARACTERS)[CharacterKey]][];
  const poseEntries = Object.entries(POSE_LABELS) as [PoseKey, string][];
  const sceneEntries = Object.entries(SCENE_LABELS) as [SceneKey, string][];

  // Group gallery by baseName for organized display
  const grouped = gallery.reduce<Record<string, GeneratedImage[]>>((acc, img) => {
    const key = img.baseName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(img);
    return acc;
  }, {});

  return (
    <PageTransition>
      <Stars />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-32 sm:pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              {"\uD83C\uDFA8"} KoalaTree Studio
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Bild-Generierung f&uuml;r Portraits, Szenen & Marketing-Assets
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            &larr; Dashboard
          </Link>
        </div>

        {/* Activate feedback */}
        {activateMsg && (
          <div className="mb-4 p-3 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/50 text-[#a8d5b8] text-sm text-center">
            {activateMsg}
          </div>
        )}

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
                  {"\uD83D\uDC28"} Charakter-Portrait
                </button>
                <button
                  onClick={() => setGenType("hero-bg")}
                  className={`chip ${genType === "hero-bg" ? "chip-selected" : ""}`}
                >
                  {"\uD83C\uDF33"} Hero-Hintergrund
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
                  {charEntries.map(([key, c]) => {
                    const hasActive = activeFiles.includes(`${key}-portrait.png`);
                    return (
                      <button
                        key={key}
                        onClick={() => setCharacter(key)}
                        className={`relative flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                          character === key
                            ? "bg-white/15 ring-2 ring-[#a8d5b8]/50"
                            : "bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-2xl">{c.emoji}</span>
                        <span className="text-xs text-white/70">{c.name}</span>
                        {hasActive && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#3d6b4a] rounded-full flex items-center justify-center text-[8px]">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                Auswahl
              </h2>
              {genType === "hero-bg" ? (
                <div className="text-center py-8">
                  <span className="text-5xl mb-3 block">{"\uD83C\uDF33"}</span>
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
                  Neues Ergebnis
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
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">{result.filename}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowPrompt(!showPrompt)}
                        className="text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showPrompt ? "Prompt ausblenden" : "Prompt"}
                      </button>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#a8d5b8] hover:text-[#c8e5d8] transition-colors"
                      >
                        &Ouml;ffnen &nearr;
                      </a>
                    </div>
                  </div>
                  {/* Activate button */}
                  <button
                    onClick={() => handleActivate(result.filename)}
                    disabled={activating === result.filename}
                    className="w-full py-2 px-4 rounded-lg bg-[#3d6b4a]/40 hover:bg-[#3d6b4a]/60 border border-[#3d6b4a]/50 text-[#a8d5b8] text-sm font-medium transition-all"
                  >
                    {activating === result.filename
                      ? "Wird aktiviert..."
                      : "✅ Als Portrait auf Website verwenden"}
                  </button>
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
                <p className="text-white/50">Bild wird generiert...</p>
                <p className="text-white/30 text-sm mt-1">
                  Das kann 30&ndash;60 Sekunden dauern
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Gallery — grouped by character/pose ──────────────────── */}
        {Object.keys(grouped).length > 0 && (
          <div className="mt-12 space-y-8">
            <h2 className="text-xl font-bold">
              {"\uD83D\uDCC1"} Alle Varianten ({gallery.length} Bilder)
            </h2>

            {Object.entries(grouped).map(([baseName, images]) => {
              const canonicalName = `${baseName}.png`;
              const isLive = activeFiles.includes(canonicalName);

              return (
                <div key={baseName}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wide">
                      {baseName}
                    </h3>
                    {isLive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#3d6b4a]/40 text-[#a8d5b8] border border-[#3d6b4a]/50">
                        LIVE
                      </span>
                    )}
                    <span className="text-xs text-white/30">
                      {images.length} Version{images.length > 1 ? "en" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {images.map((img) => (
                      <div
                        key={img.filename}
                        className="group relative rounded-xl overflow-hidden bg-white/5"
                      >
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block aspect-square relative"
                        >
                          <Image
                            src={img.url}
                            alt={img.filename}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform"
                            unoptimized
                          />
                        </a>
                        <div className="p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-white/40 truncate">
                              {new Date(img.uploadedAt).toLocaleString("de-DE", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {img.isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3d6b4a]/40 text-[#a8d5b8]">
                                AKTIV
                              </span>
                            )}
                          </div>
                          {/\d{13}/.test(img.filename) && (
                            <button
                              onClick={() => handleActivate(img.filename)}
                              disabled={activating === img.filename}
                              className="w-full py-1.5 rounded-lg bg-[#3d6b4a]/30 hover:bg-[#3d6b4a]/50 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs transition-all"
                            >
                              {activating === img.filename ? "..." : "✅ Verwenden"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

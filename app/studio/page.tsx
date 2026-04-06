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
import StudioVideos from "../components/StudioVideos";

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

  // Hero builder
  const [heroStatus, setHeroStatus] = useState<{
    background: boolean;
    hero: boolean;
    portraits: Record<string, boolean>;
    heroChars: Record<string, boolean>;
    ready: boolean;
  } | null>(null);
  const [buildingHero, setBuildingHero] = useState(false);
  const [generatingHeroChars, setGeneratingHeroChars] = useState(false);
  const [heroCharProgress, setHeroCharProgress] = useState("");
  const [heroResult, setHeroResult] = useState<{
    url: string;
    message: string;
  } | null>(null);
  const [generatingHeroFull, setGeneratingHeroFull] = useState(false);
  const [heroFullResult, setHeroFullResult] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  // Branding state
  const [brandingStatus, setBrandingStatus] = useState<{
    activeIcons: string[];
    faviconVersions: { filename: string; url: string; uploadedAt: string }[];
    logoVersions: { filename: string; url: string; uploadedAt: string }[];
    hasFavicon: boolean;
    hasLogo: boolean;
  } | null>(null);
  const [generatingBranding, setGeneratingBranding] = useState<"favicon" | "logo" | null>(null);
  const [brandingResult, setBrandingResult] = useState<{
    type: string;
    url: string;
    icons: string[];
  } | null>(null);
  const [brandingActivating, setBrandingActivating] = useState<string | null>(null);
  const [brandingMsg, setBrandingMsg] = useState("");

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

  const loadHeroStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/hero");
      if (res.ok) setHeroStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadBrandingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/branding");
      if (res.ok) setBrandingStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadGallery();
      loadHeroStatus();
      loadBrandingStatus();
    }
  }, [isAdmin, loadGallery, loadHeroStatus, loadBrandingStatus]);

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

  // Generate all hero characters with transparent backgrounds
  const handleGenerateHeroChars = async () => {
    setGeneratingHeroChars(true);
    setError("");
    const charKeys = Object.keys(CHARACTERS) as CharacterKey[];

    for (let i = 0; i < charKeys.length; i++) {
      const key = charKeys[i];
      const name = CHARACTERS[key].name;
      setHeroCharProgress(`${name} (${i + 1}/${charKeys.length})...`);

      try {
        const res = await fetch("/api/admin/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character: key, type: "hero-char" }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(`Fehler bei ${name}: ${data.error}`);
          break;
        }
      } catch {
        setError(`Netzwerkfehler bei ${name}`);
        break;
      }
    }

    setGeneratingHeroChars(false);
    setHeroCharProgress("");
    loadHeroStatus();
    loadGallery();
  };

  // Generate full hero scene (single AI image with all characters)
  const handleGenerateHeroFull = async () => {
    setGeneratingHeroFull(true);
    setHeroFullResult(null);
    setError("");
    try {
      const res = await fetch("/api/admin/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hero-full" }),
      });
      const data = await res.json();
      if (res.ok) {
        setHeroFullResult({ url: data.url, filename: data.filename });
        loadGallery();
        loadHeroStatus();
      } else {
        setError(data.error || "Fehler bei Hero-Generierung");
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setGeneratingHeroFull(false);
    }
  };

  // Build hero composite
  const handleBuildHero = async () => {
    setBuildingHero(true);
    setHeroResult(null);
    setError("");
    try {
      const res = await fetch("/api/admin/studio/hero", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setHeroResult({ url: data.url, message: data.message });
        loadGallery();
        loadHeroStatus();
      } else {
        setError(data.error || "Fehler beim Hero-Compositing");
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setBuildingHero(false);
    }
  };

  // Generate branding asset (favicon or logo)
  const handleGenerateBranding = async (type: "favicon" | "logo") => {
    setGeneratingBranding(type);
    setBrandingResult(null);
    setError("");
    try {
      const res = await fetch("/api/admin/studio/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        setBrandingResult({ type: data.type, url: data.url, icons: data.icons });
        loadBrandingStatus();
      } else {
        setError(data.error || "Fehler bei der Branding-Generierung");
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setGeneratingBranding(null);
    }
  };

  // Activate a branding version
  const handleActivateBranding = async (filename: string) => {
    setBrandingActivating(filename);
    setBrandingMsg("");
    try {
      const res = await fetch("/api/admin/studio/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (res.ok) {
        setBrandingMsg(data.message || "Aktiviert!");
        loadBrandingStatus();
      } else {
        setBrandingMsg(data.error || "Fehler");
      }
    } catch {
      setBrandingMsg("Netzwerkfehler");
    } finally {
      setBrandingActivating(null);
      setTimeout(() => setBrandingMsg(""), 4000);
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

        {/* ── Hero Builder ────────────────────────────────────────── */}
        {/* ── Hero Builder ────────────────────────────────────────── */}
        <div className="mt-12 card p-6">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            {"\uD83C\uDFDE\uFE0F"} Hero-Bild
          </h2>
          <p className="text-white/50 text-sm mb-5">
            Generiert das Hero-Bild f&uuml;r die Startseite mit allen 7 Charakteren im KoalaTree.
          </p>

          {/* Option 1: Full scene generation (recommended) */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
              Option 1: Komplette Szene (empfohlen)
            </h3>
            <p className="text-white/40 text-xs mb-3">
              Die AI generiert das gesamte Bild in einem Schritt &mdash; alle Charaktere sitzen nat&uuml;rlich
              im Baum mit passender Beleuchtung und Schatten. Sofort live auf der Website.
            </p>
            <button
              onClick={handleGenerateHeroFull}
              disabled={generatingHeroFull || generatingHeroChars || buildingHero}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3"
            >
              {generatingHeroFull ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Hero wird generiert...
                </>
              ) : (
                <>
                  {"\uD83C\uDFA8"} Hero komplett generieren (1 Bild)
                </>
              )}
            </button>
            {generatingHeroFull && (
              <p className="text-white/40 text-xs mt-2">
                Das gesamte Hero-Bild mit allen 7 Charakteren wird in einem Schritt generiert.
                Das dauert ca. 60&ndash;90 Sekunden.
              </p>
            )}

            {/* Hero full result */}
            {heroFullResult && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-[#a8d5b8] font-medium">
                    Hero generiert und sofort live!
                  </span>
                  <span className="text-xs text-white/40">{heroFullResult.filename}</span>
                </div>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black/20">
                  <Image
                    src={heroFullResult.url}
                    alt="Hero Full Scene"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 mb-6" />

          {/* Option 2: Compositing (fallback) */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-white/50 uppercase tracking-wide mb-3 hover:text-white/70 transition-colors">
              Option 2: Einzeln generieren &amp; zusammensetzen (Compositing)
            </summary>

            <div className="mt-3">
              <p className="text-white/40 text-xs mb-4">
                Generiert einzelne Charaktere mit transparentem Hintergrund und setzt sie
                per Compositing auf den KoalaTree-Hintergrund zusammen.
              </p>

              {/* Status checklist */}
              {heroStatus && (
                <div className="space-y-3 mb-5">
                  {/* Background */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    heroStatus.background ? "bg-[#3d6b4a]/20 text-[#a8d5b8]" : "bg-white/5 text-white/30"
                  }`}>
                    <span>{heroStatus.background ? "✅" : "⬜"}</span>
                    {"\uD83C\uDF33"} Hero-Hintergrund
                    {!heroStatus.background && (
                      <span className="text-amber-400/60 text-xs ml-auto">
                        Oben bei Typ &rarr; Hero-Hintergrund generieren
                      </span>
                    )}
                  </div>

                  {/* Characters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.entries(CHARACTERS) as [CharacterKey, (typeof CHARACTERS)[CharacterKey]][]).map(([key, c]) => {
                      const hasHeroChar = heroStatus.heroChars?.[key];
                      const hasPortrait = heroStatus.portraits[key];
                      const hasAny = hasHeroChar || hasPortrait;
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                            hasAny ? "bg-[#3d6b4a]/20 text-[#a8d5b8]" : "bg-white/5 text-white/30"
                          }`}
                        >
                          <span>{hasAny ? "✅" : "⬜"}</span>
                          {c.emoji} {c.name}
                          {hasHeroChar && (
                            <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded bg-[#3d6b4a]/40 text-[#a8d5b8]">
                              TRANSPARENT
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleGenerateHeroChars}
                  disabled={generatingHeroChars || buildingHero || generatingHeroFull}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#4a6fa5]/20 hover:bg-[#4a6fa5]/30 border border-[#4a6fa5]/30 text-white/80 text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {generatingHeroChars ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {heroCharProgress}
                    </>
                  ) : (
                    <>
                      ✨ Alle 7 Hero-Charaktere generieren
                    </>
                  )}
                </button>

                <button
                  onClick={handleBuildHero}
                  disabled={buildingHero || generatingHeroChars || generatingHeroFull || (heroStatus !== null && !heroStatus.background)}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  {buildingHero ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Wird zusammengesetzt...
                    </>
                  ) : (
                    <>
                      {"\uD83C\uDFDE\uFE0F"} Hero zusammensetzen
                    </>
                  )}
                </button>
              </div>

              {generatingHeroChars && (
                <p className="text-white/40 text-xs mt-2">
                  Jeder Charakter wird einzeln mit transparentem Hintergrund generiert.
                  Das dauert ca. 5&ndash;7 Minuten f&uuml;r alle 7.
                </p>
              )}

              {/* Hero composite result */}
              {heroResult && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-[#a8d5b8] font-medium">{heroResult.message}</span>
                  </div>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black/20">
                    <Image
                      src={heroResult.url}
                      alt="Hero Compositing"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* ── Branding & Icons ────────────────────────────────────── */}
        <div className="mt-12 card p-6">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            {"\u2728"} Branding &amp; Icons
          </h2>
          <p className="text-white/50 text-sm mb-5">
            Generiert Favicon, App-Icon und Logo im KoalaTree-Stil. Nach der Generierung sofort live.
          </p>

          {brandingMsg && (
            <div className="mb-4 p-3 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/50 text-[#a8d5b8] text-sm text-center">
              {brandingMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Favicon / App-Icon */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{"\uD83C\uDF33"}</span>
                <div>
                  <h3 className="text-sm font-semibold">Favicon &amp; App-Icon</h3>
                  <p className="text-white/40 text-xs">Magischer Baum, alle Gr&ouml;&szlig;en</p>
                </div>
                {brandingStatus?.hasFavicon && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#3d6b4a]/40 text-[#a8d5b8] border border-[#3d6b4a]/50">
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-white/30 text-xs mb-3">
                16px, 32px, 180px, 192px, 512px, Maskable
              </p>
              <button
                onClick={() => handleGenerateBranding("favicon")}
                disabled={generatingBranding !== null}
                className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                {generatingBranding === "favicon" ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generiere Favicon...
                  </>
                ) : (
                  <>
                    {"\uD83C\uDFA8"} Favicon generieren
                  </>
                )}
              </button>
            </div>

            {/* Logo */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{"\uD83D\uDC28"}</span>
                <div>
                  <h3 className="text-sm font-semibold">Logo</h3>
                  <p className="text-white/40 text-xs">Baum mit Koda</p>
                </div>
                {brandingStatus?.hasLogo && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#3d6b4a]/40 text-[#a8d5b8] border border-[#3d6b4a]/50">
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-white/30 text-xs mb-3">
                1024px Logo f&uuml;r NavBar, Startseite &amp; Anmeldung
              </p>
              <button
                onClick={() => handleGenerateBranding("logo")}
                disabled={generatingBranding !== null}
                className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                {generatingBranding === "logo" ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generiere Logo...
                  </>
                ) : (
                  <>
                    {"\uD83C\uDFA8"} Logo generieren
                  </>
                )}
              </button>
            </div>
          </div>

          {generatingBranding && (
            <div className="text-center py-4">
              <div className="inline-block w-8 h-8 border-3 border-white/10 border-t-[#a8d5b8] rounded-full animate-spin mb-3" />
              <p className="text-white/40 text-sm">
                {generatingBranding === "favicon"
                  ? "Favicon wird generiert und in alle Gr\u00F6\u00DFen skaliert..."
                  : "Logo wird generiert..."}
              </p>
              <p className="text-white/30 text-xs mt-1">Das dauert 30\u201360 Sekunden</p>
            </div>
          )}

          {/* Branding result preview */}
          {brandingResult && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-[#a8d5b8] font-medium">
                  {brandingResult.type === "favicon"
                    ? "Favicon & App-Icons generiert und sofort live!"
                    : "Logo generiert und sofort live!"}
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-black/20 flex-shrink-0">
                  <Image
                    src={brandingResult.url}
                    alt={`${brandingResult.type} source`}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                {brandingResult.type === "favicon" && (
                  <div className="flex-1">
                    <p className="text-white/50 text-xs mb-2">Erzeugte Icons:</p>
                    <div className="flex flex-wrap gap-2">
                      {brandingResult.icons.map((icon) => (
                        <span
                          key={icon}
                          className="text-xs px-2 py-1 rounded bg-white/5 text-white/50"
                        >
                          {icon}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Version history */}
          {brandingStatus && (brandingStatus.faviconVersions.length > 0 || brandingStatus.logoVersions.length > 0) && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-white/50 uppercase tracking-wide mb-3 hover:text-white/70 transition-colors">
                Versionen ({brandingStatus.faviconVersions.length + brandingStatus.logoVersions.length})
              </summary>
              <div className="mt-3 space-y-4">
                {/* Favicon versions */}
                {brandingStatus.faviconVersions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-white/40 uppercase mb-2">Favicon-Versionen</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {brandingStatus.faviconVersions.map((v) => (
                        <div key={v.filename} className="group/item rounded-xl overflow-hidden bg-white/5">
                          <div className="relative aspect-square">
                            <Image
                              src={v.url}
                              alt={v.filename}
                              fill
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                          <div className="p-2 space-y-1">
                            <span className="text-[10px] text-white/40 block">
                              {new Date(v.uploadedAt).toLocaleString("de-DE", {
                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                            <button
                              onClick={() => handleActivateBranding(v.filename)}
                              disabled={brandingActivating === v.filename}
                              className="w-full py-1.5 rounded-lg bg-[#3d6b4a]/30 hover:bg-[#3d6b4a]/50 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs transition-all"
                            >
                              {brandingActivating === v.filename ? "..." : "\u2705 Verwenden"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Logo versions */}
                {brandingStatus.logoVersions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-white/40 uppercase mb-2">Logo-Versionen</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {brandingStatus.logoVersions.map((v) => (
                        <div key={v.filename} className="group/item rounded-xl overflow-hidden bg-white/5">
                          <div className="relative aspect-square">
                            <Image
                              src={v.url}
                              alt={v.filename}
                              fill
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                          <div className="p-2 space-y-1">
                            <span className="text-[10px] text-white/40 block">
                              {new Date(v.uploadedAt).toLocaleString("de-DE", {
                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                            <button
                              onClick={() => handleActivateBranding(v.filename)}
                              disabled={brandingActivating === v.filename}
                              className="w-full py-1.5 rounded-lg bg-[#3d6b4a]/30 hover:bg-[#3d6b4a]/50 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs transition-all"
                            >
                              {brandingActivating === v.filename ? "..." : "\u2705 Verwenden"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
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

        {/* Marketing Videos Section */}
        <div className="mt-8 border-t border-white/10 pt-8">
          <StudioVideos />
        </div>
      </div>
    </PageTransition>
  );
}

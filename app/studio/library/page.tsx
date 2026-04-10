"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

type AssetType = "portrait" | "landscape" | "clip" | "sound" | "reference" | "actor";

interface CharacterSheet {
  front?: string;
  profile?: string;
  fullBody?: string;
}

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost?: boolean;
}

interface DigitalActor {
  id: string;
  name: string;
  description?: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings | null;
  voicePreviewUrl?: string;
  portraitAssetId?: string;
  style?: string;
  outfit?: string;
  traits?: string;
  characterSheet?: CharacterSheet | null;
  tags: string[];
  createdAt: string;
  _count?: { characters: number };
}

interface Asset {
  id: string;
  type: AssetType;
  category?: string;
  tags: string[];
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  generatedBy?: {
    model?: string;
    prompt?: string;
    blocks?: Record<string, number>;
  };
  modelId?: string;
  costCents?: number;
  version: number;
  isPrimary: boolean;
  projectId?: string;
  createdAt: string;
}

const TYPE_FILTERS: { id: AssetType | "all"; label: string; icon: string }[] = [
  { id: "all", label: "Alle", icon: "📁" },
  { id: "portrait", label: "Portraits", icon: "🎭" },
  { id: "landscape", label: "Landscapes", icon: "🏞️" },
  { id: "clip", label: "Clips", icon: "🎬" },
  { id: "sound", label: "Sounds", icon: "🔊" },
  { id: "actor", label: "Actors", icon: "🎙" },
];

// ── Actor Creation Form ─────────────────────────────────────────

interface NewActorFormProps {
  onCreated: (actor: DigitalActor) => void;
  onCancel: () => void;
  blobProxy: (url: string) => string;
}

function NewActorForm({ onCreated, onCancel, blobProxy }: NewActorFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [outfit, setOutfit] = useState("");
  const [traits, setTraits] = useState("");
  const [style, setStyle] = useState("realistic");
  const [saving, setSaving] = useState(false);
  const [actorId, setActorId] = useState<string | null>(null);

  // Voice state
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [generatedVoiceId, setGeneratedVoiceId] = useState<string | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voiceSaved, setVoiceSaved] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Portrait state
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const createActorIfNeeded = async (): Promise<string | null> => {
    if (actorId) return actorId;
    if (!name.trim()) { setError("Name ist erforderlich"); return null; }
    try {
      const res = await fetch("/api/studio/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), outfit: outfit.trim() || undefined, traits: traits.trim() || undefined, style, tags: [] }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Fehler beim Erstellen"); return null; }
      setActorId(data.actor.id);
      return data.actor.id;
    } catch {
      setError("Netzwerkfehler");
      return null;
    }
  };

  const handleDesignVoice = async () => {
    setError(null);
    const id = await createActorIfNeeded();
    if (!id) return;
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: id, description: description || name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Voice Design fehlgeschlagen"); return; }
      setGeneratedVoiceId(data.generatedVoiceId);
      setVoicePreviewUrl(data.previewUrl);
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleSaveVoice = async () => {
    if (!actorId || !generatedVoiceId) return;
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, generatedVoiceId, name, description: description || name }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Voice speichern fehlgeschlagen"); return; }
      setVoiceSaved(true);
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleGeneratePortrait = async () => {
    setError(null);
    const id = await createActorIfNeeded();
    if (!id) return;
    setPortraitLoading(true);
    try {
      const res = await fetch("/api/studio/actors/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: id, description: description || name, style }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Portrait fehlgeschlagen"); return; }
      setPortraitUrl(data.portraitUrl);
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setPortraitLoading(false);
    }
  };

  const handlePlayPreview = () => {
    if (!voicePreviewUrl) return;
    if (playingPreview && audioRef.current) {
      audioRef.current.pause();
      setPlayingPreview(false);
      return;
    }
    const audio = new Audio(blobProxy(voicePreviewUrl));
    audioRef.current = audio;
    audio.onended = () => setPlayingPreview(false);
    audio.play();
    setPlayingPreview(true);
  };

  const handleSave = async () => {
    if (!actorId) {
      setError("Bitte zuerst Stimme oder Portrait generieren");
      return;
    }
    setSaving(true);
    try {
      // Update actor with final name/description
      const res = await fetch("/api/studio/actors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actorId, updates: { name: name.trim(), description: description.trim(), outfit: outfit.trim() || undefined, traits: traits.trim() || undefined, style } }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Speichern fehlgeschlagen"); return; }
      onCreated(data.actor);
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5 mb-4">
      <h3 className="text-sm font-semibold text-[#f5eed6] mb-4">Neuer Schauspieler</h3>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="block text-[10px] text-white/40 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Max Brenner"
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[10px] text-white/40 mb-1">Beschreibung</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='z.B. "35, maennlich, rau, selbstbewusst, deutscher Akzent"'
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40 resize-none"
          />
          <p className="text-[9px] text-white/20 mt-0.5">
            Wird fuer Stimm- und Portrait-Generierung verwendet
          </p>
        </div>

        {/* Style */}
        <div>
          <label className="block text-[10px] text-white/40 mb-1">Stil</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 focus:outline-none focus:border-[#a8d5b8]/40"
          >
            <option value="realistic">Realistisch</option>
            <option value="disney-2d">Disney 2D</option>
            <option value="pixar-3d">Pixar 3D</option>
            <option value="ghibli">Ghibli</option>
          </select>
        </div>

        {/* Outfit */}
        <div>
          <label className="block text-[10px] text-white/40 mb-1">Outfit / Kleidung</label>
          <input
            type="text"
            value={outfit}
            onChange={(e) => setOutfit(e.target.value)}
            placeholder='z.B. "Schwarze Lederjacke, weisses T-Shirt, Jeans"'
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40"
          />
          <p className="text-[9px] text-white/20 mt-0.5">
            Wird in jeden Portrait-Prompt eingebaut fuer konsistentes Aussehen
          </p>
        </div>

        {/* Traits */}
        <div>
          <label className="block text-[10px] text-white/40 mb-1">Eigenschaften</label>
          <input
            type="text"
            value={traits}
            onChange={(e) => setTraits(e.target.value)}
            placeholder='z.B. "Traegt Brille, Narbe ueber linkem Auge, markantes Kinn"'
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40"
          />
          <p className="text-[9px] text-white/20 mt-0.5">
            Bleibende Merkmale die in jeder Rolle sichtbar sein sollen
          </p>
        </div>

        {/* Voice Section */}
        <div className="pt-2 border-t border-white/5">
          <p className="text-[10px] text-white/40 mb-2">Stimme</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDesignVoice}
              disabled={voiceLoading || !name.trim()}
              className="px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-300/80 text-[11px] hover:bg-purple-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {voiceLoading ? "Generiere..." : "Stimme generieren"}
            </button>

            {voicePreviewUrl && (
              <button
                onClick={handlePlayPreview}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-[11px] hover:text-white/70 transition-all"
              >
                {playingPreview ? "Pause" : "Preview"}
              </button>
            )}

            {generatedVoiceId && !voiceSaved && (
              <button
                onClick={handleSaveVoice}
                disabled={voiceLoading}
                className="px-3 py-1.5 rounded-lg bg-green-500/15 text-green-300/80 text-[11px] hover:bg-green-500/25 disabled:opacity-30 transition-all"
              >
                {voiceLoading ? "Speichere..." : "Stimme speichern"}
              </button>
            )}

            {voiceSaved && (
              <span className="text-[10px] text-green-400/60">Gespeichert</span>
            )}
          </div>
        </div>

        {/* Portrait Section */}
        <div className="pt-2 border-t border-white/5">
          <p className="text-[10px] text-white/40 mb-2">Portrait</p>
          <div className="flex items-start gap-3">
            <button
              onClick={handleGeneratePortrait}
              disabled={portraitLoading || !name.trim()}
              className="px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300/80 text-[11px] hover:bg-blue-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {portraitLoading ? "Generiere..." : "Portrait generieren"}
            </button>

            {portraitUrl && (
              <img
                src={blobProxy(portraitUrl)}
                alt="Portrait"
                className="w-16 h-16 rounded-lg object-cover border border-white/10"
              />
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !actorId}
          className="px-4 py-2 rounded-lg bg-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {saving ? "Speichere..." : "Speichern"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/5 text-white/40 text-xs hover:text-white/60 transition-all"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Actor Detail View ───────────────────────────────────────────

// ── Character Sheet Section ─────────────────────────────────────

const ANGLES: { id: "front" | "profile" | "fullBody"; label: string; desc: string }[] = [
  { id: "front", label: "Front", desc: "Kopf & Schultern, Blick zur Kamera" },
  { id: "profile", label: "Profil", desc: "Seitenansicht" },
  { id: "fullBody", label: "Ganzkoerper", desc: "Kopf bis Fuss" },
];

function CharacterSheetSection({ actor, blobProxy, onUpdate }: { actor: DigitalActor; blobProxy: (url: string) => string; onUpdate: (actor: DigitalActor) => void }) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [allProgress, setAllProgress] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const sheet = actor.characterSheet || {};

  const generateAngle = async (angle: "front" | "profile" | "fullBody"): Promise<CharacterSheet | null> => {
    const res = await fetch("/api/studio/actors/character-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorId: actor.id,
        angle,
        description: actor.description || actor.name,
        style: actor.style || "realistic",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Fehler bei ${angle}`);
    return data.characterSheet;
  };

  const handleGenerate = async (angle: "front" | "profile" | "fullBody") => {
    setGenerating(angle);
    setSheetError(null);
    try {
      const newSheet = await generateAngle(angle);
      if (newSheet) onUpdate({ ...actor, characterSheet: newSheet });
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : "Fehler");
    }
    setGenerating(null);
  };

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    setSheetError(null);

    try {
      // Step 1: Front zuerst (wird als Referenz fuer die anderen gebraucht)
      setAllProgress("1/3 Front...");
      setGenerating("front");
      const frontSheet = await generateAngle("front");
      if (frontSheet) onUpdate({ ...actor, characterSheet: frontSheet });

      // Step 2: Profil (sequenziell, vermeidet Race Condition + Rate-Limits)
      setAllProgress("2/3 Profil...");
      setGenerating("profile");
      const profileSheet = await generateAngle("profile");
      if (profileSheet) onUpdate({ ...actor, characterSheet: profileSheet });

      // Step 3: Ganzkoerper
      setAllProgress("3/3 Ganzkoerper...");
      setGenerating("fullBody");
      const fullBodySheet = await generateAngle("fullBody");
      if (fullBodySheet) onUpdate({ ...actor, characterSheet: fullBodySheet });
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : "Fehler bei Generierung");
    }

    setGenerating(null);
    setGeneratingAll(false);
    setAllProgress("");
  };

  const filledCount = ANGLES.filter((a) => sheet[a.id]).length;
  const isGenerating = generating !== null;

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-white/30">Character Sheet</span>
        <span className="text-[8px] text-white/15">{filledCount}/3</span>
        {!generatingAll && (
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating}
            className="ml-auto px-2 py-0.5 rounded bg-[#d4a853]/10 text-[#d4a853]/60 text-[8px] hover:text-[#d4a853] disabled:opacity-30 transition-all"
          >
            {filledCount > 0 ? "Alle neu generieren" : "Alle generieren"}
          </button>
        )}
      </div>

      {generatingAll && allProgress && (
        <p className="text-[9px] text-[#d4a853]/50 mb-2">{allProgress}</p>
      )}
      {sheetError && (
        <p className="text-[9px] text-red-400/70 mb-2">{sheetError}</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {ANGLES.map(({ id, label, desc }) => {
          const url = sheet[id] || null;
          const isThisGenerating = generating === id;
          return (
            <div key={id} className="text-center">
              <div className={`rounded-lg overflow-hidden bg-white/5 border border-white/5 ${id === "fullBody" ? "aspect-[2/3]" : "aspect-square"} ${isThisGenerating ? "animate-pulse" : ""}`}>
                {url ? (
                  <img src={blobProxy(url)} alt={label} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isThisGenerating ? (
                      <span className="text-[#d4a853]/30 text-[10px]">...</span>
                    ) : (
                      <span className="text-white/10 text-lg">{id === "fullBody" ? "\uD83E\uDDCD" : "\uD83D\uDC64"}</span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-[8px] text-white/30 mt-1">{label}</p>
              {!generatingAll && (
                <button
                  onClick={() => handleGenerate(id)}
                  disabled={isGenerating}
                  className="text-[8px] text-[#d4a853]/50 hover:text-[#d4a853] disabled:opacity-30 mt-0.5"
                  title={desc}
                >
                  {isThisGenerating ? "..." : url ? "Neu" : "Generieren"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!generatingAll && filledCount === 0 && (
        <p className="text-[8px] text-white/15 mt-2 text-center">
          Front wird zuerst generiert und als Referenz fuer Profil + Ganzkoerper verwendet.
        </p>
      )}
    </div>
  );
}

// ── Actor Detail View ───────────────────────────────────────────

interface ActorDetailProps {
  actor: DigitalActor;
  portraitMap: Record<string, string>;
  blobProxy: (url: string) => string;
  onClose: () => void;
  onUpdate: (actor: DigitalActor) => void;
}

function ActorDetailView({ actor, portraitMap, blobProxy, onClose, onUpdate, onDelete }: ActorDetailProps & { onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(actor.name);
  const [editDesc, setEditDesc] = useState(actor.description || "");
  const [editOutfit, setEditOutfit] = useState(actor.outfit || "");
  const [editTraits, setEditTraits] = useState(actor.traits || "");
  const [editStyle, setEditStyle] = useState(actor.style || "realistic");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);

  // Voice settings
  const [editVoiceSettings, setEditVoiceSettings] = useState<VoiceSettings>(
    (actor.voiceSettings as VoiceSettings | null) || { stability: 0.45, similarity_boost: 0.70, style: 0.50, speed: 1.0 }
  );
  const [voiceSettingsDirty, setVoiceSettingsDirty] = useState(false);
  const [savingVoiceSettings, setSavingVoiceSettings] = useState(false);

  // Voice regeneration
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [newGeneratedVoiceId, setNewGeneratedVoiceId] = useState<string | null>(null);
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);

  const portraitSrc = portraitMap[actor.id];
  const projectTags = actor.tags.filter((t) => t.startsWith("project:")).map((t) => t.replace("project:", ""));
  const otherTags = actor.tags.filter((t) => !t.startsWith("project:") && !t.startsWith("style:") && !t.startsWith("gender:"));

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/studio/actors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actor.id, updates: { name: editName.trim(), description: editDesc.trim(), outfit: editOutfit.trim() || null, traits: editTraits.trim() || null, style: editStyle } }),
      });
      const data = await res.json();
      if (res.ok) { onUpdate(data.actor); setEditing(false); }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/studio/actors?id=${actor.id}`, { method: "DELETE" });
      if (res.ok) onDelete(actor.id);
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const handleSaveVoiceSettings = async () => {
    setSavingVoiceSettings(true);
    try {
      const res = await fetch("/api/studio/actors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actor.id, updates: { voiceSettings: editVoiceSettings } }),
      });
      const data = await res.json();
      if (res.ok) { onUpdate(data.actor); setVoiceSettingsDirty(false); }
    } catch { /* ignore */ }
    setSavingVoiceSettings(false);
  };

  const updateVoiceSetting = (key: keyof VoiceSettings, value: number) => {
    setEditVoiceSettings((prev) => ({ ...prev, [key]: value }));
    setVoiceSettingsDirty(true);
  };

  const handlePlayVoice = (url: string) => {
    if (playingPreview) return;
    setPlayingPreview(true);
    const audio = new Audio(blobProxy(url));
    audio.onended = () => setPlayingPreview(false);
    audio.play();
  };

  const handleDesignNewVoice = async () => {
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: actor.id, description: actor.description || actor.name }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewGeneratedVoiceId(data.generatedVoiceId);
        setNewPreviewUrl(data.previewUrl);
      }
    } catch { /* ignore */ }
    setVoiceLoading(false);
  };

  const handleSaveNewVoice = async () => {
    if (!newGeneratedVoiceId) return;
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId: actor.id,
          generatedVoiceId: newGeneratedVoiceId,
          name: actor.name,
          description: actor.description || actor.name,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdate(data.actor);
        setNewGeneratedVoiceId(null);
        setNewPreviewUrl(null);
      }
    } catch { /* ignore */ }
    setVoiceLoading(false);
  };

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-start gap-4">
        {/* Portrait */}
        <div className="flex-shrink-0">
          {portraitSrc ? (
            <img src={blobProxy(portraitSrc)} alt={actor.name} className="w-24 h-24 rounded-xl object-cover border border-white/10" />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-white/5 flex items-center justify-center">
              <span className="text-3xl">🎙</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-white/80 focus:outline-none focus:border-[#a8d5b8]/40"
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none focus:border-[#a8d5b8]/40 resize-none"
              />
              <select
                value={editStyle}
                onChange={(e) => setEditStyle(e.target.value)}
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none focus:border-[#a8d5b8]/40"
              >
                <option value="realistic">Realistisch</option>
                <option value="disney-2d">Disney 2D</option>
                <option value="pixar-3d">Pixar 3D</option>
                <option value="ghibli">Ghibli</option>
              </select>
              <input
                type="text"
                value={editOutfit}
                onChange={(e) => setEditOutfit(e.target.value)}
                placeholder="Outfit / Kleidung"
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none focus:border-[#a8d5b8]/40"
              />
              <input
                type="text"
                value={editTraits}
                onChange={(e) => setEditTraits(e.target.value)}
                placeholder="Eigenschaften (Brille, Narbe, etc.)"
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none focus:border-[#a8d5b8]/40"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} disabled={saving} className="px-2 py-1 rounded bg-[#3d6b4a]/40 text-[#a8d5b8] text-[10px] hover:bg-[#3d6b4a]/60 disabled:opacity-30">
                  {saving ? "..." : "Speichern"}
                </button>
                <button onClick={() => setEditing(false)} className="px-2 py-1 rounded bg-white/5 text-white/40 text-[10px]">
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#f5eed6]">{actor.name}</h3>
                {actor.style && (
                  <span className="text-[8px] px-1.5 py-0.5 bg-purple-500/10 rounded text-purple-300/60">{actor.style}</span>
                )}
                <button onClick={() => setEditing(true)} className="text-[9px] text-white/20 hover:text-white/40">Bearbeiten</button>
              </div>
              {actor.description && (
                <p className="text-[11px] text-white/40 mt-0.5">{actor.description}</p>
              )}
              {actor.outfit && (
                <p className="text-[10px] text-white/25 mt-0.5">Outfit: {actor.outfit}</p>
              )}
              {actor.traits && (
                <p className="text-[10px] text-white/25 mt-0.5">Traits: {actor.traits}</p>
              )}
              {actor._count && actor._count.characters > 0 && (
                <p className="text-[9px] text-purple-300/40 mt-0.5">In {actor._count.characters} {actor._count.characters === 1 ? "Projekt" : "Projekten"} besetzt</p>
              )}
            </>
          )}

          {/* Voice status */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-white/30">Stimme:</span>
              {actor.voiceId ? (
                <span className="flex items-center gap-1 text-[10px] text-green-400/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Generiert
                </span>
              ) : (
                <span className="text-[10px] text-white/20">Keine Stimme</span>
              )}
              {actor.voicePreviewUrl && (
                <button
                  onClick={() => handlePlayVoice(actor.voicePreviewUrl!)}
                  className="px-2 py-0.5 rounded bg-white/5 text-purple-300/60 text-[10px] hover:text-purple-300"
                >
                  {playingPreview ? "..." : "Preview"}
                </button>
              )}
              <button
                onClick={handleDesignNewVoice}
                disabled={voiceLoading}
                className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300/60 text-[10px] hover:text-purple-300 disabled:opacity-30"
              >
                {voiceLoading ? "..." : "Neue Stimme generieren"}
              </button>
            </div>

            {/* New voice preview */}
            {newPreviewUrl && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlayVoice(newPreviewUrl)}
                  className="px-2 py-0.5 rounded bg-white/5 text-white/50 text-[10px]"
                >
                  Neue Preview
                </button>
                <button
                  onClick={handleSaveNewVoice}
                  disabled={voiceLoading}
                  className="px-2 py-0.5 rounded bg-green-500/10 text-green-300/60 text-[10px] hover:text-green-300 disabled:opacity-30"
                >
                  Stimme speichern
                </button>
              </div>
            )}
          </div>

          {/* Voice Settings */}
          {actor.voiceId && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-[10px] text-white/30 mb-2">Stimm-Einstellungen</p>
              <div className="space-y-2">
                {([
                  { key: "stability" as const, label: "Stabilitaet", min: 0, max: 1, step: 0.05 },
                  { key: "similarity_boost" as const, label: "Aehnlichkeit", min: 0, max: 1, step: 0.05 },
                  { key: "style" as const, label: "Ausdruck", min: 0, max: 1, step: 0.05 },
                  { key: "speed" as const, label: "Geschwindigkeit", min: 0.5, max: 2.0, step: 0.05 },
                ]).map(({ key, label, min, max, step }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[9px] text-white/25 w-20 flex-shrink-0">{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={editVoiceSettings[key] ?? (key === "speed" ? 1.0 : 0.5)}
                      onChange={(e) => updateVoiceSetting(key, parseFloat(e.target.value))}
                      className="flex-1 h-1 accent-purple-400"
                    />
                    <span className="text-[8px] text-white/20 w-8 text-right">{(editVoiceSettings[key] ?? (key === "speed" ? 1.0 : 0.5)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {voiceSettingsDirty && (
                <button
                  onClick={handleSaveVoiceSettings}
                  disabled={savingVoiceSettings}
                  className="mt-2 px-3 py-1 rounded bg-purple-500/15 text-purple-300/70 text-[10px] hover:bg-purple-500/25 disabled:opacity-30"
                >
                  {savingVoiceSettings ? "..." : "Einstellungen speichern"}
                </button>
              )}
            </div>
          )}

          {/* Character Sheet */}
          <CharacterSheetSection actor={actor} blobProxy={blobProxy} onUpdate={onUpdate} />

          {/* Tags */}
          {otherTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              <span className="text-[9px] text-white/25">Tags:</span>
              {otherTags.map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-white/30">{t}</span>
              ))}
            </div>
          )}

          {/* Projects */}
          {projectTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[9px] text-white/25">Projekte:</span>
              {projectTags.map((p) => (
                <span key={p} className="text-[9px] px-1.5 py-0.5 bg-[#3d6b4a]/20 rounded text-[#a8d5b8]/50">{p}</span>
              ))}
            </div>
          )}

          <p className="text-[8px] text-white/15 mt-2">
            Erstellt: {new Date(actor.createdAt).toLocaleDateString("de")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded-lg bg-white/5 text-white/30 text-[10px] hover:text-white/50 transition-all"
        >
          Schliessen
        </button>
        {confirmDelete ? (
          <div className="flex gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-[10px] hover:bg-red-500/30 disabled:opacity-30"
            >
              {deleting ? "..." : "Ja, loeschen"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 rounded-lg bg-white/5 text-white/30 text-[10px] hover:text-white/50"
            >
              Nein
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400/40 text-[10px] hover:text-red-400/70 transition-all"
          >
            Loeschen
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Library Page ───────────────────────────────────────────

export default function LibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [actors, setActors] = useState<DigitalActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AssetType | "all">("all");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // New state: filters
  const [searchText, setSearchText] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [styleFilter, setStyleFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");

  // Actor creation & detail
  const [showNewActorForm, setShowNewActorForm] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

  // Asset generation
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [genDescription, setGenDescription] = useState("");
  const [genStyle, setGenStyle] = useState("realistic");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Portrait lookup: assetId -> blobUrl (loaded on demand for actors)
  const [portraitMap, setPortraitMap] = useState<Record<string, string>>({});

  const loadAssets = useCallback(() => {
    setLoading(true);
    if (filter === "actor") {
      fetch("/api/studio/actors")
        .then((r) => r.json())
        .then((d) => { setActors(d.actors || []); setLoading(false); })
        .catch(() => setLoading(false));
      return;
    }
    const params = filter !== "all" ? `?type=${filter}` : "";
    fetch(`/api/studio/assets${params}`)
      .then((r) => r.json())
      .then((d) => { setAssets(d.assets || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Load portrait URLs for actors that have portraitAssetId
  useEffect(() => {
    if (filter !== "actor" || actors.length === 0) return;
    const actorsWithPortrait = actors.filter((a) => a.portraitAssetId && !portraitMap[a.id]);
    if (actorsWithPortrait.length === 0) return;

    // For actors whose portraitAssetId looks like a URL (starts with http), use directly
    // For asset IDs, fetch from the asset
    const newMap: Record<string, string> = {};
    for (const a of actorsWithPortrait) {
      if (a.portraitAssetId?.startsWith("http")) {
        newMap[a.id] = a.portraitAssetId;
      }
    }
    if (Object.keys(newMap).length > 0) {
      setPortraitMap((prev) => ({ ...prev, ...newMap }));
    }
    // Could also fetch asset URLs from API for non-http IDs, but skip for now
  }, [filter, actors, portraitMap]);

  const blobProxy = (url: string) =>
    url.includes(".blob.vercel-storage.com")
      ? `/api/studio/blob?url=${encodeURIComponent(url)}`
      : url;

  // ── Derived filter data ──────────────────────────────────────

  const allItems = filter === "actor" ? actors : assets;

  // Extract unique project/style tags from current items
  const { projectTags, styleTags } = useMemo(() => {
    const projects = new Set<string>();
    const styles = new Set<string>();
    const items = filter === "actor" ? actors : assets;
    for (const item of items) {
      const tags = "tags" in item ? (item as { tags: string[] }).tags : [];
      for (const t of tags) {
        if (t.startsWith("project:")) projects.add(t.replace("project:", ""));
        if (t.startsWith("style:")) styles.add(t.replace("style:", ""));
      }
    }
    return { projectTags: Array.from(projects).sort(), styleTags: Array.from(styles).sort() };
  }, [filter, actors, assets]);

  // Apply sub-filters
  const filteredAssets = useMemo(() => {
    let items = assets;
    if (projectFilter !== "all") {
      items = items.filter((a) => a.tags.includes(`project:${projectFilter}`));
    }
    if (styleFilter !== "all") {
      items = items.filter((a) => a.tags.includes(`style:${styleFilter}`));
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter((a) =>
        (a.category || "").toLowerCase().includes(q) ||
        (a.modelId || "").toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return items;
  }, [assets, projectFilter, styleFilter, searchText]);

  const filteredActors = useMemo(() => {
    let items = actors;
    if (projectFilter !== "all") {
      items = items.filter((a) => a.tags.includes(`project:${projectFilter}`));
    }
    if (genderFilter !== "all") {
      const tag = genderFilter === "male" ? "gender:male" : "gender:female";
      items = items.filter((a) => a.tags.includes(tag));
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return items;
  }, [actors, projectFilter, genderFilter, searchText]);

  const displayItems = filter === "actor" ? filteredActors : filteredAssets;
  const selectedActor = selectedActorId ? actors.find((a) => a.id === selectedActorId) || null : null;

  const hasSubFilters = projectTags.length > 0 || styleTags.length > 0 || filter === "actor";

  // Dynamic image height per asset type
  const imageHeight = filter === "portrait" ? "h-48" : filter === "landscape" ? "h-32" : "h-24";

  const handleGenerate = async () => {
    if (!genDescription.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/studio/library/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: filter as "portrait" | "landscape",
          description: genDescription.trim(),
          style: genStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "Generierung fehlgeschlagen");
        return;
      }
      // Reload assets and close form
      setShowGenerateForm(false);
      setGenDescription("");
      loadAssets();
    } catch {
      setGenError("Netzwerkfehler");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="text-white/30 text-sm p-8">Lade Library...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f5eed6]">Asset Library</h1>
          <p className="text-sm text-white/40">
            {filter === "actor"
              ? `${filteredActors.length} Schauspieler`
              : `${filteredAssets.length} Assets`}
          </p>
        </div>
        <div className="flex gap-2">
          {filter === "portrait" && (
            <button
              onClick={() => { setShowGenerateForm(true); setGenError(null); }}
              className="px-4 py-2 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 transition-all"
            >
              + Portrait generieren
            </button>
          )}
          {filter === "landscape" && (
            <button
              onClick={() => { setShowGenerateForm(true); setGenError(null); }}
              className="px-4 py-2 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 transition-all"
            >
              + Landscape generieren
            </button>
          )}
        </div>
      </div>

      {/* Type Filters */}
      <div className="flex gap-1.5 mb-3">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id as AssetType | "all"); setSelectedActorId(null); setShowNewActorForm(false); setShowGenerateForm(false); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${
              filter === f.id
                ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                : "text-white/30 hover:text-white/50 bg-white/5"
            }`}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Sub-Filter Row */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {/* Free-text search */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Suche nach Name, Tags, Model..."
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/30 w-52"
        />

        {/* Project filter */}
        {projectTags.length > 0 && (
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/50 focus:outline-none focus:border-[#a8d5b8]/30 appearance-none cursor-pointer"
          >
            <option value="all">Alle Projekte</option>
            {projectTags.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        {/* Style filter (for non-actor views) */}
        {filter !== "actor" && styleTags.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={() => setStyleFilter("all")}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                styleFilter === "all" ? "bg-white/10 text-white/60" : "text-white/25 hover:text-white/40"
              }`}
            >
              Alle Stile
            </button>
            {styleTags.map((s) => (
              <button
                key={s}
                onClick={() => setStyleFilter(s)}
                className={`px-2 py-1 rounded text-[10px] transition-all ${
                  styleFilter === s ? "bg-white/10 text-white/60" : "text-white/25 hover:text-white/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Gender filter (for actors) */}
        {filter === "actor" && (
          <div className="flex gap-1">
            {([["all", "Alle"], ["male", "Maennlich"], ["female", "Weiblich"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setGenderFilter(val)}
                className={`px-2 py-1 rounded text-[10px] transition-all ${
                  genderFilter === val ? "bg-white/10 text-white/60" : "text-white/25 hover:text-white/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Actors View ────────────────────────────────────────── */}
      {filter === "actor" && (
        <>
          {/* New Actor Button */}
          {!showNewActorForm && (
            <button
              onClick={() => { setShowNewActorForm(true); setSelectedActorId(null); }}
              className="mb-4 px-4 py-2.5 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 transition-all"
            >
              + Neuer Schauspieler
            </button>
          )}

          {/* New Actor Form */}
          {showNewActorForm && (
            <NewActorForm
              blobProxy={blobProxy}
              onCreated={(actor) => {
                setActors((prev) => [actor, ...prev]);
                setShowNewActorForm(false);
              }}
              onCancel={() => setShowNewActorForm(false)}
            />
          )}

          {/* Actor Detail View */}
          {selectedActor && !showNewActorForm && (
            <ActorDetailView
              actor={selectedActor}
              portraitMap={portraitMap}
              blobProxy={blobProxy}
              onClose={() => setSelectedActorId(null)}
              onUpdate={(updated) => {
                setActors((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
              }}
              onDelete={(id) => {
                setActors((prev) => prev.filter((a) => a.id !== id));
                setSelectedActorId(null);
              }}
            />
          )}

          {/* Actor Grid */}
          {filteredActors.length === 0 ? (
            <div className="card p-8 text-center text-white/30 text-sm">
              <p>Noch keine Schauspieler. Erstelle deinen ersten digitalen Schauspieler mit KI-Stimme.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredActors.map((actor) => {
                const portrait = portraitMap[actor.id];
                const isSelected = selectedActorId === actor.id;
                return (
                  <div
                    key={actor.id}
                    onClick={() => setSelectedActorId(isSelected ? null : actor.id)}
                    className={`card p-3 cursor-pointer transition-all ${
                      isSelected ? "ring-1 ring-[#a8d5b8]/40" : "hover:border-white/15"
                    }`}
                  >
                    {/* Portrait or fallback */}
                    <div className="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center mx-auto overflow-hidden">
                      {portrait ? (
                        <img src={blobProxy(portrait)} alt={actor.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🎙</span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-[#f5eed6] mt-2 text-center truncate">{actor.name}</p>

                    {actor.style && (
                      <p className="text-[7px] text-purple-300/40 text-center mt-0.5">{actor.style}</p>
                    )}

                    {actor.description && (
                      <p className="text-[9px] text-white/30 mt-0.5 text-center truncate">{actor.description}</p>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap gap-0.5 justify-center mt-1.5">
                      {actor.tags.filter((t) => !t.startsWith("project:")).slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[7px] px-1 py-0.5 bg-white/5 rounded text-white/25">{tag}</span>
                      ))}
                    </div>

                    {/* Voice + Sheet status */}
                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${actor.voiceId ? "bg-green-400" : "bg-white/10"}`} />
                        <span className="text-[8px] text-white/25">
                          {actor.voiceId ? "Stimme" : "Keine Stimme"}
                        </span>
                      </div>
                      {(() => {
                        const s = actor.characterSheet || {};
                        const count = ["front", "profile", "fullBody"].filter((a) => s[a as keyof CharacterSheet]).length;
                        return count > 0 ? (
                          <span className="text-[7px] text-[#d4a853]/40">{count}/3</span>
                        ) : null;
                      })()}
                    </div>

                    {actor.voicePreviewUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playingVoice === actor.id) {
                            setPlayingVoice(null);
                          } else {
                            setPlayingVoice(actor.id);
                            const audio = new Audio(blobProxy(actor.voicePreviewUrl!));
                            audio.onended = () => setPlayingVoice(null);
                            audio.play();
                          }
                        }}
                        className="mt-1 text-[8px] text-purple-300/60 hover:text-purple-300 block mx-auto"
                      >
                        {playingVoice === actor.id ? "..." : "Stimme anhoeren"}
                      </button>
                    )}

                    <p className="text-[7px] text-white/15 mt-1 text-center">
                      {new Date(actor.createdAt).toLocaleDateString("de")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Generate Form (Portrait / Landscape) ─────────────── */}
      {showGenerateForm && (filter === "portrait" || filter === "landscape") && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-[#f5eed6] mb-4">
            {filter === "portrait" ? "Neues Portrait generieren" : "Neues Landscape generieren"}
          </h3>

          {genError && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
              {genError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-white/40 mb-1">Beschreibung</label>
              <textarea
                value={genDescription}
                onChange={(e) => setGenDescription(e.target.value)}
                placeholder={
                  filter === "portrait"
                    ? 'z.B. "35, maennlich, kurzes Haar, Narbe an der Stirn, Rennfahrer"'
                    : 'z.B. "Rennstrecke bei Regen, Nacht, Flutlicht"'
                }
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40 resize-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-white/40 mb-1">Style</label>
              <select
                value={genStyle}
                onChange={(e) => setGenStyle(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60 focus:outline-none focus:border-[#a8d5b8]/30 appearance-none cursor-pointer"
              >
                <option value="realistic">Realistisch</option>
                <option value="disney-2d">Disney 2D</option>
                <option value="pixar-3d">Pixar 3D</option>
                <option value="ghibli">Ghibli</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
            <button
              onClick={handleGenerate}
              disabled={generating || !genDescription.trim()}
              className="px-4 py-2 rounded-lg bg-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {generating ? "Generiere..." : "Generieren"}
            </button>
            <button
              onClick={() => { setShowGenerateForm(false); setGenError(null); }}
              className="px-4 py-2 rounded-lg bg-white/5 text-white/40 text-xs hover:text-white/60 transition-all"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* ── Asset Grid ─────────────────────────────────────────── */}
      {filter !== "actor" && (filteredAssets.length === 0 ? (
        <div className="card p-8 text-center text-white/30 text-sm">
          <p>Noch keine Assets. Generiere Portraits, Landscapes oder Clips in der Engine.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setSelectedAsset(selectedAsset?.id === asset.id ? null : asset)}
              className={`card overflow-hidden cursor-pointer transition-all ${
                selectedAsset?.id === asset.id ? "ring-1 ring-[#a8d5b8]/40" : "hover:border-white/15"
              }`}
            >
              {/* Thumbnail */}
              {asset.mimeType.startsWith("image/") ? (
                <img
                  src={blobProxy(asset.blobUrl)}
                  alt=""
                  className={`w-full ${imageHeight} object-cover ${filter === "portrait" ? "object-top" : ""}`}
                />
              ) : asset.mimeType.startsWith("video/") ? (
                <video src={blobProxy(asset.blobUrl)} muted preload="metadata" className={`w-full ${imageHeight} object-cover bg-black/30`} />
              ) : (
                <div className={`w-full ${imageHeight} bg-white/5 flex items-center justify-center text-2xl`}>
                  {asset.type === "sound" ? "🔊" : "📄"}
                </div>
              )}

              {/* Info */}
              <div className="p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-white/30">{asset.type}</span>
                  {asset.isPrimary && <span className="text-[7px] text-[#a8d5b8]">aktiv</span>}
                </div>
                {asset.category && (
                  <p className="text-[9px] text-white/40 mt-1 truncate">{asset.category}</p>
                )}
                <p className="text-[8px] text-white/20 mt-0.5">
                  v{asset.version} · {(asset.sizeBytes / 1024).toFixed(0)}KB
                  {asset.costCents ? ` · $${(asset.costCents / 100).toFixed(2)}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Selected Asset Detail */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedAsset(null)}>
          <div className="card max-w-lg w-full max-h-[80vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            {/* Preview */}
            {selectedAsset.mimeType.startsWith("image/") ? (
              <img src={blobProxy(selectedAsset.blobUrl)} alt="" className="w-full rounded-lg mb-3" />
            ) : selectedAsset.mimeType.startsWith("video/") ? (
              <video src={blobProxy(selectedAsset.blobUrl)} controls className="w-full rounded-lg mb-3" />
            ) : selectedAsset.mimeType.startsWith("audio/") ? (
              <audio src={blobProxy(selectedAsset.blobUrl)} controls className="w-full mb-3" />
            ) : null}

            {/* Metadata */}
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-white/30">Typ</span>
                <span className="text-white/60">{selectedAsset.type}</span>
              </div>
              {selectedAsset.category && (
                <div className="flex justify-between">
                  <span className="text-white/30">Kategorie</span>
                  <span className="text-white/60">{selectedAsset.category}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-white/30">Version</span>
                <span className="text-white/60">{selectedAsset.version}</span>
              </div>
              {selectedAsset.width && (
                <div className="flex justify-between">
                  <span className="text-white/30">Groesse</span>
                  <span className="text-white/60">{selectedAsset.width}x{selectedAsset.height}</span>
                </div>
              )}
              {selectedAsset.durationSec && (
                <div className="flex justify-between">
                  <span className="text-white/30">Dauer</span>
                  <span className="text-white/60">{selectedAsset.durationSec.toFixed(1)}s</span>
                </div>
              )}
              {selectedAsset.costCents && (
                <div className="flex justify-between">
                  <span className="text-white/30">Kosten</span>
                  <span className="text-white/60">${(selectedAsset.costCents / 100).toFixed(2)}</span>
                </div>
              )}
              {selectedAsset.modelId && (
                <div className="flex justify-between">
                  <span className="text-white/30">Model</span>
                  <span className="text-white/60">{selectedAsset.modelId}</span>
                </div>
              )}

              {/* Provenance */}
              {selectedAsset.generatedBy && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <p className="text-white/30 mb-1">Provenance</p>
                  {selectedAsset.generatedBy.model && (
                    <p className="text-white/40">Model: {selectedAsset.generatedBy.model}</p>
                  )}
                  {selectedAsset.generatedBy.prompt && (
                    <p className="text-white/30 mt-1 text-[9px] bg-white/5 rounded p-2 max-h-20 overflow-y-auto">
                      {selectedAsset.generatedBy.prompt}
                    </p>
                  )}
                  {selectedAsset.generatedBy.blocks && Object.keys(selectedAsset.generatedBy.blocks).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(selectedAsset.generatedBy.blocks).map(([slug, ver]) => (
                        <span key={slug} className="text-[7px] px-1.5 py-0.5 bg-white/5 rounded text-white/30">
                          {slug} v{ver}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="text-[8px] text-white/15 mt-2">
                {new Date(selectedAsset.createdAt).toLocaleString("de")}
              </p>
            </div>

            <button
              onClick={() => setSelectedAsset(null)}
              className="mt-3 w-full py-2 rounded-lg bg-white/5 text-white/40 text-xs hover:text-white/60"
            >
              Schliessen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

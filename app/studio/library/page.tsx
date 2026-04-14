"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ActorSheetComponent from "@/app/components/ActorSheet";
import VoiceSheetComponent from "@/app/components/VoiceSheet";
import { Card, Badge, EmptyState, ActionButton, AudioPreview } from "@/app/components/ui";
import { useToast } from "@/app/components/Toasts";

type AssetType = "portrait" | "landscape" | "clip" | "sound" | "reference" | "actor" | "music";
type LibraryCategory = "actors" | "voices" | "locations" | "props" | "music" | "clips";

interface Voice {
  id: string;
  name: string;
  description?: string;
  voiceId: string;
  voiceSettings?: VoiceSettings | null;
  previewUrl?: string;
  category?: string;
  tags: string[];
  createdAt: string;
  _count?: { actors: number };
}

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
  voiceDescription?: string;
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

const CATEGORIES: { id: LibraryCategory; label: string; icon: string }[] = [
  { id: "actors", label: "Actors", icon: "\uD83C\uDFAD" },
  { id: "voices", label: "Voices", icon: "\uD83C\uDFA4" },
  { id: "locations", label: "Locations", icon: "\uD83D\uDCCD" },
  { id: "props", label: "Props", icon: "\uD83C\uDFAA" },
  { id: "music", label: "Music", icon: "\uD83C\uDFB5" },
  { id: "clips", label: "Clips", icon: "\uD83C\uDFAC" },
];

// ── Actor Creation Form ─────────────────────────────────────────

interface NewActorFormProps {
  onCreated: (actor: DigitalActor) => void;
  onCancel: () => void;
  blobProxy: (url: string) => string;
}

function NewActorForm({ onCreated, onCancel, blobProxy }: NewActorFormProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [outfit, setOutfit] = useState("");
  const [traits, setTraits] = useState("");
  const [style, setStyle] = useState("realistic");
  const [saving, setSaving] = useState(false);
  const [actorId, setActorId] = useState<string | null>(null);

  // Voice state
  const [voiceDescription, setVoiceDescription] = useState("");
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
        body: JSON.stringify({ name: name.trim(), description: description.trim(), voiceDescription: voiceDescription.trim() || undefined, outfit: outfit.trim() || undefined, traits: traits.trim() || undefined, style, tags: [] }),
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
        body: JSON.stringify({ actorId: id, description: voiceDescription || `${description || name}, spricht Deutsch` }),
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
    const tid = toast.loading("Portrait wird generiert...");
    try {
      const res = await fetch("/api/studio/actors/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: id, description: description || name, style }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Portrait fehlgeschlagen", tid); setError(data.error || "Portrait fehlgeschlagen"); return; }
      setPortraitUrl(data.portraitUrl);
      toast.success("Portrait fertig!", tid);
    } catch {
      toast.error("Netzwerkfehler", tid);
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
          <div className="mb-2">
            <label className="block text-[10px] text-white/30 mb-1">Stimm-Beschreibung (fuer AI Voice Design)</label>
            <input
              type="text"
              value={voiceDescription}
              onChange={(e) => setVoiceDescription(e.target.value)}
              placeholder='z.B. "Tiefe maennliche Stimme, warm, ruhig, weiser Erzaehler" oder "Junge weibliche Stimme, energisch, frech"'
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-purple-500/40"
            />
            <p className="text-[9px] text-white/20 mt-0.5">
              Beschreibe wie die Stimme klingen soll — nicht das Aussehen. Je genauer, desto besser.
            </p>
          </div>
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
  const toast = useToast();
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [allProgress, setAllProgress] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const sheet = actor.characterSheet || {};

  const generateAngle = async (angle: "front" | "profile" | "fullBody"): Promise<{ characterSheet: CharacterSheet; portraitUrl?: string } | null> => {
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
    // Return both characterSheet and portraitUrl for front angle
    return { characterSheet: data.characterSheet, portraitUrl: angle === "front" ? data.portraitUrl : undefined };
  };

  const handleGenerate = async (angle: "front" | "profile" | "fullBody") => {
    setGenerating(angle);
    setSheetError(null);
    const labels = { front: "Frontal", profile: "Profil", fullBody: "Ganzkörper" };
    const tid = toast.loading(`${labels[angle]}-Bild wird generiert...`);
    try {
      const result = await generateAngle(angle);
      if (result?.characterSheet) {
        const updates: Partial<DigitalActor> = { characterSheet: result.characterSheet };
        if (result.portraitUrl) updates.portraitAssetId = result.portraitUrl;
        onUpdate({ ...actor, ...updates });
        toast.success(`${labels[angle]}-Bild fertig!`, tid);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler";
      setSheetError(msg);
      toast.error(msg, tid);
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
      const frontResult = await generateAngle("front");
      if (frontResult?.characterSheet) {
        const updates: Partial<DigitalActor> = { characterSheet: frontResult.characterSheet };
        if (frontResult.portraitUrl) updates.portraitAssetId = frontResult.portraitUrl;
        onUpdate({ ...actor, ...updates });
      }

      // Step 2: Profil
      setAllProgress("2/3 Profil...");
      setGenerating("profile");
      const profileResult = await generateAngle("profile");
      if (profileResult?.characterSheet) onUpdate({ ...actor, characterSheet: profileResult.characterSheet });

      // Step 3: Ganzkoerper
      setAllProgress("3/3 Ganzkoerper...");
      setGenerating("fullBody");
      const fullBodyResult = await generateAngle("fullBody");
      if (fullBodyResult?.characterSheet) onUpdate({ ...actor, characterSheet: fullBodyResult.characterSheet });
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
  const toast = useToast();
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

  // Voice description for regeneration
  const [editVoiceDesc, setEditVoiceDesc] = useState(actor.voiceDescription || "");

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
    const tid = toast.loading("Speichere...");
    try {
      const res = await fetch("/api/studio/actors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actor.id, updates: { name: editName.trim(), description: editDesc.trim(), voiceDescription: editVoiceDesc.trim() || null, outfit: editOutfit.trim() || null, traits: editTraits.trim() || null, style: editStyle } }),
      });
      const data = await res.json();
      if (res.ok) { onUpdate(data.actor); setEditing(false); toast.success("Gespeichert!", tid); }
      else toast.error(data.error || "Speichern fehlgeschlagen", tid);
    } catch { toast.error("Netzwerkfehler", tid); }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const tid = toast.loading("Actor wird geloescht...");
    try {
      const res = await fetch(`/api/studio/actors?id=${actor.id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Actor geloescht", tid); onDelete(actor.id); }
      else toast.error("Loeschen fehlgeschlagen", tid);
    } catch { toast.error("Netzwerkfehler", tid); }
    setDeleting(false);
  };

  const handleSaveVoiceSettings = async () => {
    setSavingVoiceSettings(true);
    const tid = toast.loading("Stimm-Einstellungen speichern...");
    try {
      const res = await fetch("/api/studio/actors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actor.id, updates: { voiceSettings: editVoiceSettings } }),
      });
      const data = await res.json();
      if (res.ok) { onUpdate(data.actor); setVoiceSettingsDirty(false); toast.success("Gespeichert!", tid); }
      else toast.error("Fehler", tid);
    } catch { toast.error("Netzwerkfehler", tid); }
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
    const tid = toast.loading("Stimme wird generiert...");
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: actor.id, description: editVoiceDesc || actor.voiceDescription || `${actor.description || actor.name}, spricht Deutsch` }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewGeneratedVoiceId(data.generatedVoiceId);
        setNewPreviewUrl(data.previewUrl);
        toast.success("Stimme generiert — jetzt anhoeren und speichern", tid);
      } else toast.error(data.error || "Stimm-Generierung fehlgeschlagen", tid);
    } catch { toast.error("Netzwerkfehler", tid); }
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
                  {(actor as { libraryVoice?: { name: string } }).libraryVoice?.name || actor.voiceDescription?.slice(0, 30) || actor.voiceId.slice(0, 8) + "..."}
                </span>
              ) : (
                <span className="text-[10px] text-white/20">Keine Stimme</span>
              )}
              {(actor.voicePreviewUrl || actor.voiceId) && (
                <button
                  onClick={() => {
                    const url = actor.voicePreviewUrl;
                    if (url) handlePlayVoice(url);
                    else toast.info("Kein Voice-Preview verfuegbar");
                  }}
                  className="px-2 py-0.5 rounded bg-white/5 text-purple-300/60 text-[10px] hover:text-purple-300"
                >
                  {playingPreview ? "▶ ..." : "▶ Anhoeren"}
                </button>
              )}
              <button
                onClick={handleDesignNewVoice}
                disabled={voiceLoading || !editVoiceDesc.trim()}
                className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300/60 text-[10px] hover:text-purple-300 disabled:opacity-30"
              >
                {voiceLoading ? "..." : "Stimme generieren"}
              </button>
            </div>

            {/* Voice description editor */}
            <div className="mt-2">
              <input
                type="text"
                value={editVoiceDesc}
                onChange={(e) => setEditVoiceDesc(e.target.value)}
                placeholder='Stimm-Beschreibung: z.B. "Tiefe maennliche Stimme, warm, ruhig"'
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] text-white/60 focus:outline-none focus:border-purple-500/40 placeholder:text-white/15"
              />
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

// ── Landscape Generator ─────────────────────────────────────────

const LANDSCAPE_STYLES = [
  { value: "pixar-3d", label: "Pixar 3D" },
  { value: "disney-2d", label: "Disney 2D" },
  { value: "ghibli", label: "Ghibli" },
  { value: "realistic", label: "Realistisch" },
  { value: "storybook", label: "Bilderbuch" },
];

const LANDSCAPE_MOODS = [
  { value: "warm", label: "Warm & Golden" },
  { value: "dark", label: "Dunkel & Mystisch" },
  { value: "bright", label: "Hell & Froehlich" },
  { value: "dramatic", label: "Dramatisch" },
  { value: "calm", label: "Ruhig & Friedlich" },
];

function LandscapeGenerator({ blobProxy, onCreated }: { blobProxy: (u: string) => string; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [style, setStyle] = useState("pixar-3d");
  const [mood, setMood] = useState("warm");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!name.trim()) { setError("Name/Beschreibung erforderlich"); return; }
    setGenerating(true);
    setError(null);
    try {
      const styleLabel = LANDSCAPE_STYLES.find((s) => s.value === style)?.label || style;
      const moodLabel = LANDSCAPE_MOODS.find((m) => m.value === mood)?.label || mood;

      const res = await fetch("/api/studio/library/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "landscape",
          description: name.trim(),
          style,
          name: name.trim(),
          tags: [style, mood, ...name.toLowerCase().split(/\s+/).filter((w) => w.length > 3)],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Fehler"); return; }
      setShowForm(false);
      setName("");
      onCreated();
    } catch { setError("Netzwerkfehler"); }
    setGenerating(false);
  };

  return (
    <div className="mb-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-[#d4a853]/20 border border-[#d4a853]/30 text-[#d4a853] text-xs font-medium hover:bg-[#d4a853]/30 transition-all"
        >
          + Neues Landscape
        </button>
      ) : (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-[#f5eed6]">Neues Landscape</h4>

          {error && <p className="text-[10px] text-red-400">{error}</p>}

          <div>
            <label className="text-[10px] text-white/40 block mb-1">Beschreibung</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Verzauberter Wald bei Sonnenuntergang"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#d4a853]/40"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">Stil</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80">
                {LANDSCAPE_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">Stimmung</label>
              <select value={mood} onChange={(e) => setMood(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80">
                {LANDSCAPE_MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={generate} disabled={generating || !name.trim()} className="px-4 py-2 rounded-lg bg-[#d4a853]/20 text-[#d4a853] text-xs font-medium hover:bg-[#d4a853]/30 disabled:opacity-30">
              {generating ? "Generiert..." : "Generieren"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/30 text-xs hover:text-white/50">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Location Generator ──────────────────────────────────────────

const LOCATION_TYPES = [
  { value: "indoor", label: "Innenraum" },
  { value: "outdoor", label: "Aussenbereich" },
  { value: "fantasy", label: "Fantasy-Welt" },
  { value: "urban", label: "Stadt/Urban" },
  { value: "nature", label: "Natur" },
];

function LocationGenerator({ blobProxy, onCreated }: { blobProxy: (u: string) => string; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("pixar-3d");
  const [mood, setMood] = useState("warm");
  const [locationType, setLocationType] = useState("outdoor");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!name.trim()) { setError("Name erforderlich"); return; }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/library/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "landscape",
          category: "location",
          description: `${name.trim()}${description.trim() ? ": " + description.trim() : ""}`,
          style,
          name: name.trim(),
          tags: [`style:${style}`, `mood:${mood}`, `location:${locationType}`, ...name.toLowerCase().split(/\s+/).filter((w) => w.length > 3)],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Fehler"); return; }
      setShowForm(false);
      setName("");
      setDescription("");
      onCreated();
    } catch { setError("Netzwerkfehler"); }
    setGenerating(false);
  };

  return (
    <div className="mb-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 transition-all"
        >
          + Neue Location
        </button>
      ) : (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-[#f5eed6]">Neue Location / Set</h4>

          {error && <p className="text-[10px] text-red-400">{error}</p>}

          <div>
            <label className="text-[10px] text-white/40 block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Verzauberter Wald, Rennstrecke Monaco, Piratenschiff"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40"
            />
          </div>

          <div>
            <label className="text-[10px] text-white/40 block mb-1">Beschreibung (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="z.B. Lichtung mit moosbedecktem Baumstamm, Bach im Hintergrund, Herbstlaub"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#a8d5b8]/40 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">Typ</label>
              <select value={locationType} onChange={(e) => setLocationType(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80">
                {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">Stil</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80">
                {LANDSCAPE_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-white/40 block mb-1">Stimmung</label>
              <select value={mood} onChange={(e) => setMood(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80">
                {LANDSCAPE_MOODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={generate} disabled={generating || !name.trim()} className="px-4 py-2 rounded-lg bg-[#3d6b4a]/30 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/40 disabled:opacity-30">
              {generating ? "Generiert..." : "Location generieren"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/30 text-xs hover:text-white/50">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Props Generator ─────────────────────────────────────────────

// Auto-generate smart tags from name + description
function generateSmartTags(name: string, description: string, style: string): string[] {
  const tags = new Set<string>();
  tags.add(`style:${style}`);
  tags.add("prop");

  const text = `${name} ${description}`.toLowerCase();

  // Type detection
  if (/schwert|axt|bogen|speer|dolch|waffe/.test(text)) tags.add("typ:waffe");
  if (/auto|wagen|fahrzeug|motorrad|fahrrad|boot|schiff/.test(text)) tags.add("typ:fahrzeug");
  if (/jacke|kleid|hose|helm|ruestung|mantel|hut|schuh/.test(text)) tags.add("typ:kleidung");
  if (/kelch|becher|tasse|flasche|krug/.test(text)) tags.add("typ:gefaess");
  if (/ring|kette|amulett|schmuck|krone/.test(text)) tags.add("typ:schmuck");
  if (/buch|karte|brief|schriftrolle|dokument/.test(text)) tags.add("typ:dokument");
  if (/surfboard|surfbrett|board/.test(text)) tags.add("typ:sport");

  // Material detection
  if (/gold|golden/.test(text)) { tags.add("material:gold"); tags.add("farbe:gold"); }
  if (/silber/.test(text)) { tags.add("material:silber"); tags.add("farbe:silber"); }
  if (/holz|hoelzern/.test(text)) tags.add("material:holz");
  if (/metall|stahl|eisen/.test(text)) tags.add("material:metall");
  if (/stein|fels/.test(text)) tags.add("material:stein");
  if (/kristall|glas/.test(text)) tags.add("material:kristall");
  if (/leder/.test(text)) tags.add("material:leder");

  // Color detection
  if (/rot|rote/.test(text)) tags.add("farbe:rot");
  if (/blau|blaue/.test(text)) tags.add("farbe:blau");
  if (/gruen|gruene/.test(text)) tags.add("farbe:gruen");
  if (/schwarz/.test(text)) tags.add("farbe:schwarz");
  if (/weiss/.test(text)) tags.add("farbe:weiss");

  // Epoch detection
  if (/mittelalter|ritter|burg/.test(text)) tags.add("epoche:mittelalter");
  if (/modern|zeitgenoessisch/.test(text)) tags.add("epoche:modern");
  if (/fantasy|magisch|zauber/.test(text)) tags.add("epoche:fantasy");
  if (/scifi|futuristisch|laser/.test(text)) tags.add("epoche:scifi");

  return Array.from(tags);
}

function PropsGenerator({ blobProxy, onCreated }: { blobProxy: (u: string) => string; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("pixar-3d");
  const [tags, setTags] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [qualityCheck, setQualityCheck] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enhancedInfo, setEnhancedInfo] = useState<{ reasoning: string; warnings: string[] } | null>(null);

  // Auto-update tags when name/description changes
  useEffect(() => {
    if (name.trim()) {
      setTags(generateSmartTags(name, description, style));
    }
  }, [name, description, style]);

  const generate = async () => {
    if (!name.trim()) { setError("Name erforderlich"); return; }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/library/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reference",
          category: "prop",
          description: `${name.trim()}${description.trim() ? ": " + description.trim() : ""}`,
          style,
          name: name.trim(),
          tags,
          qualityCheck,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Fehler"); return; }
      // Show enhancement info
      if (data.enhanced) {
        setEnhancedInfo(data.enhanced);
      }
      if (data.validation && !data.validation.passed) {
        console.log("[Props] Quality issues:", data.validation.issues);
      }
      setShowForm(false);
      setName("");
      setDescription("");
      setTags([]);
      setEnhancedInfo(null);
      onCreated();
    } catch { setError("Netzwerkfehler"); }
    setGenerating(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "reference");
      formData.append("category", "prop");
      formData.append("name", name.trim() || file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/studio/assets", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        // Apply tags
        if (tags.length > 0) {
          await fetch(`/api/studio/assets/${data.asset.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags }),
          });
        }
        setShowForm(false);
        setName("");
        setDescription("");
        setTags([]);
        onCreated();
      } else { setError("Upload fehlgeschlagen"); }
    } catch { setError("Netzwerkfehler"); }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div className="mb-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-[#d4a853]/20 border border-[#d4a853]/30 text-[#d4a853] text-xs font-medium hover:bg-[#d4a853]/30 transition-all"
        >
          + Neues Prop / Requisit
        </button>
      ) : (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-[#f5eed6]">Neues Prop / Requisit</h4>

          {error && <p className="text-[10px] text-red-400">{error}</p>}

          <div>
            <label className="text-[10px] text-white/40 block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Goldener Kelch, Altes Holzschwert, Roter Sportwagen"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#d4a853]/40"
            />
          </div>

          <div>
            <label className="text-[10px] text-white/40 block mb-1">Beschreibung (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="z.B. Verzierte goldene Gravuren, leuchtender Edelstein im Deckel"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#d4a853]/40 resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-white/40 block mb-1">Stil</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80">
              {LANDSCAPE_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Auto-generated tags (editable) */}
          {tags.length > 0 && (
            <div>
              <label className="text-[10px] text-white/40 block mb-1">Auto-Tags (klick zum Entfernen)</label>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded text-white/40 hover:bg-red-500/15 hover:text-red-300 transition-all"
                  >
                    {tag} &times;
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality Check Toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={qualityCheck}
                onChange={(e) => setQualityCheck(e.target.checked)}
                className="w-3 h-3 rounded accent-[#d4a853]"
              />
              <span className="text-[9px] text-white/30">Qualitaets-Check (AI prueft Ergebnis)</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={generate} disabled={generating || uploading || !name.trim()} className="px-4 py-2 rounded-lg bg-[#d4a853]/20 text-[#d4a853] text-xs font-medium hover:bg-[#d4a853]/30 disabled:opacity-30">
              {generating ? (qualityCheck ? "Generiert + prueft..." : "Generiert...") : "AI generieren"}
            </button>
            <label className={`px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              uploading ? "bg-white/5 text-white/20" : "bg-white/10 text-white/50 hover:text-white/70 hover:bg-white/15"
            }`}>
              {uploading ? "Laedt..." : "Bild hochladen"}
              <input type="file" accept="image/*" onChange={handleUpload} disabled={generating || uploading} className="hidden" />
            </label>
            <button onClick={() => { setShowForm(false); setTags([]); setEnhancedInfo(null); }} className="px-4 py-2 rounded-lg bg-white/5 text-white/30 text-xs hover:text-white/50">
              Abbrechen
            </button>
          </div>

          <p className="text-[8px] text-white/15">Prompt wird automatisch von AI verbessert fuer bessere Ergebnisse</p>
        </div>
      )}
    </div>
  );
}

// ── Music Uploader ──────────────────────────────────────────────

function MusicUploader({ onUploaded }: { onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "sound");
    formData.append("category", "music");
    formData.append("name", file.name.replace(/\.[^.]+$/, ""));
    try {
      const res = await fetch("/api/studio/assets", { method: "POST", body: formData });
      if (res.ok) {
        onUploaded();
      }
    } catch { /* */ }
    setUploading(false);
    setUploadName("");
    // Reset file input
    e.target.value = "";
  };

  return (
    <div className="mb-4 flex items-center gap-3">
      <label className={`px-4 py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer inline-block ${
        uploading
          ? "bg-[#d4a853]/10 border-[#d4a853]/20 text-[#d4a853]/50"
          : "bg-[#d4a853]/20 border-[#d4a853]/30 text-[#d4a853] hover:bg-[#d4a853]/30"
      }`}>
        {uploading ? "Laedt hoch..." : "+ Musik hochladen"}
        <input type="file" accept="audio/*" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {uploading && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] text-white/30 truncate max-w-[200px]">{uploadName}</span>
        </div>
      )}
    </div>
  );
}

// ── Asset Detail Modal (Edit/Delete/Upload) ────────────────────

function AssetDetailModal({ asset, blobProxy, onClose, onUpdate, onDelete }: {
  asset: Asset;
  blobProxy: (url: string) => string;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [editName, setEditName] = useState((asset as { name?: string }).name || "");
  const [editTags, setEditTags] = useState<string[]>(asset.tags || []);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState(asset.generatedBy?.prompt || "");
  const [allTags, setAllTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load tag suggestions
  useEffect(() => {
    fetch("/api/studio/assets/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags || []))
      .catch(() => {});
  }, []);

  const saveChanges = async () => {
    setSaving(true);
    try {
      await fetch(`/api/studio/assets/${asset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() || undefined, tags: editTags }),
      });
      onUpdate();
    } catch { /* */ }
    setSaving(false);
  };

  const deleteAsset = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/studio/assets/${asset.id}`, { method: "DELETE" });
      onDelete();
    } catch { /* */ }
    setDeleting(false);
  };

  const handleUploadReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Create new asset with same metadata, then delete old
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", asset.type);
      formData.append("category", asset.category || "");
      formData.append("name", editName || file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/studio/assets", { method: "POST", body: formData });
      if (res.ok) {
        // Update tags on new asset
        const data = await res.json();
        if (editTags.length > 0) {
          await fetch(`/api/studio/assets/${data.asset.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: editTags }),
          });
        }
        // Delete old asset
        await fetch(`/api/studio/assets/${asset.id}`, { method: "DELETE" });
        onUpdate();
      }
    } catch { /* */ }
    setUploading(false);
  };

  const handleRegenerate = async () => {
    if (!regenPrompt.trim()) return;
    setRegenerating(true);
    try {
      // Determine style from tags
      const styleTag = editTags.find((t) => t.startsWith("style:"));
      const style = styleTag ? styleTag.replace("style:", "") : "pixar-3d";

      const res = await fetch("/api/studio/library/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: asset.type,
          category: asset.category || undefined,
          description: regenPrompt,
          style,
          name: editName || undefined,
          tags: editTags,
        }),
      });
      if (res.ok) {
        // Delete old asset
        await fetch(`/api/studio/assets/${asset.id}`, { method: "DELETE" });
        onUpdate();
      }
    } catch { /* */ }
    setRegenerating(false);
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !editTags.includes(t)) {
      setEditTags([...editTags, t]);
    }
    setNewTag("");
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => {
    setEditTags(editTags.filter((t) => t !== tag));
  };

  // Filter suggestions
  const suggestions = newTag.length > 0
    ? allTags.filter((t) => t.tag.includes(newTag.toLowerCase()) && !editTags.includes(t.tag)).slice(0, 8)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Preview */}
        <div className="relative">
          {asset.mimeType.startsWith("image/") ? (
            <img src={blobProxy(asset.blobUrl)} alt="" className="w-full rounded-t-2xl max-h-[300px] object-cover" />
          ) : asset.mimeType.startsWith("video/") ? (
            <video src={blobProxy(asset.blobUrl)} controls className="w-full rounded-t-2xl" />
          ) : asset.mimeType.startsWith("audio/") ? (
            <div className="p-6 bg-white/[0.02] rounded-t-2xl">
              <audio src={blobProxy(asset.blobUrl)} controls className="w-full" />
            </div>
          ) : null}

          {/* Action overlays */}
          {asset.mimeType.startsWith("image/") && (
            <div className="absolute bottom-2 right-2 flex gap-1.5">
              <button
                onClick={() => setShowRegenerate(!showRegenerate)}
                disabled={regenerating}
                className="px-2.5 py-1 rounded-lg bg-black/60 text-[#d4a853]/70 text-[9px] hover:bg-black/80 hover:text-[#d4a853] transition-all disabled:opacity-30"
              >
                {regenerating ? "Generiert..." : "Neu generieren"}
              </button>
              <label className="px-2.5 py-1 rounded-lg bg-black/60 text-white/60 text-[9px] cursor-pointer hover:bg-black/80 hover:text-white transition-all">
                {uploading ? "Laedt..." : "Hochladen"}
                <input type="file" accept="image/*" onChange={handleUploadReplace} disabled={uploading} className="hidden" />
              </label>
            </div>
          )}
        </div>

        {/* Regenerate with prompt editor */}
        {showRegenerate && (
          <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5">
            <label className="text-[9px] text-white/25 uppercase tracking-wider block mb-1">Prompt bearbeiten + neu generieren</label>
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/60 focus:outline-none focus:border-[#d4a853]/30 resize-none font-mono"
              placeholder="Beschreibe das Bild das generiert werden soll..."
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRegenerate}
                disabled={regenerating || !regenPrompt.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#d4a853]/20 text-[#d4a853] text-[10px] font-medium hover:bg-[#d4a853]/30 disabled:opacity-30"
              >
                {regenerating ? "Generiert..." : "AI generieren"}
              </button>
              <button
                onClick={() => setShowRegenerate(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 text-white/30 text-[10px] hover:text-white/50"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Editable Name */}
          <div>
            <label className="text-[9px] text-white/25 uppercase tracking-wider block mb-1">Name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 focus:outline-none focus:border-[#d4a853]/40"
              placeholder="Asset-Name"
            />
          </div>

          {/* Tag Editor */}
          <div>
            <label className="text-[9px] text-white/25 uppercase tracking-wider block mb-1">Tags</label>
            {/* Current tags as chips */}
            <div className="flex flex-wrap gap-1 mb-2">
              {editTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 bg-white/10 rounded text-white/50">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-white/25 hover:text-red-300 ml-0.5">&times;</button>
                </span>
              ))}
              {editTags.length === 0 && <span className="text-[9px] text-white/15">Keine Tags</span>}
            </div>
            {/* Add tag input with autocomplete */}
            <div className="relative">
              <input
                value={newTag}
                onChange={(e) => { setNewTag(e.target.value); setShowSuggestions(true); }}
                onKeyDown={(e) => { if (e.key === "Enter" && newTag.trim()) { e.preventDefault(); addTag(newTag); } }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Tag hinzufuegen... (Enter)"
                className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/60 focus:outline-none focus:border-[#d4a853]/30 placeholder:text-white/15"
              />
              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#222] border border-white/10 rounded-lg overflow-hidden z-10 max-h-32 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.tag}
                      onClick={() => addTag(s.tag)}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white/70 flex justify-between"
                    >
                      <span>{s.tag}</span>
                      <span className="text-white/15">{s.count}x</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Metadata (compact) */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-white/25 pt-2 border-t border-white/5">
            <span>{asset.type}</span>
            {asset.category && <span>{asset.category}</span>}
            {asset.width && <span>{asset.width}x{asset.height}</span>}
            <span>{(asset.sizeBytes / 1024).toFixed(0)}KB</span>
            {asset.costCents ? <span>${(asset.costCents / 100).toFixed(2)}</span> : null}
            {asset.modelId && <span>{asset.modelId}</span>}
            <span>{new Date(asset.createdAt).toLocaleDateString("de")}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#3d6b4a]/30 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 disabled:opacity-30"
            >
              {saving ? "Speichert..." : "Speichern"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 text-white/40 text-xs hover:text-white/60"
            >
              Schliessen
            </button>
            <div className="flex-1" />
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 rounded-lg text-red-400/40 text-[10px] hover:text-red-300 hover:bg-red-500/10 transition-all"
              >
                Loeschen
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-red-300/50">Sicher?</span>
                <button
                  onClick={deleteAsset}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-[10px] font-medium hover:bg-red-500/30 disabled:opacity-30"
                >
                  {deleting ? "..." : "Ja, loeschen"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-[10px] text-white/25 hover:text-white/50"
                >
                  Nein
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Voice Emotion Tester ────────────────────────────────────────

const EMOTIONS = [
  { id: "neutral", label: "Normal" },
  { id: "happy", label: "Freudig" },
  { id: "sad", label: "Traurig" },
  { id: "scared", label: "Angst" },
  { id: "angry", label: "Wuetend" },
  { id: "excited", label: "Aufgeregt" },
  { id: "whisper", label: "Fluestern" },
];

function VoiceEmotionTester({ voiceId, previewUrl, blobProxy }: { voiceId: string; previewUrl?: string; blobProxy: (u: string) => string }) {
  const [testingEmotion, setTestingEmotion] = useState<string | null>(null);
  const [emotionAudios, setEmotionAudios] = useState<Record<string, string>>({});
  const [activeEmotion, setActiveEmotion] = useState<string | null>(null);

  const testEmotion = async (emotion: string) => {
    if (emotionAudios[emotion]) { setActiveEmotion(emotion); return; }
    setTestingEmotion(emotion);
    try {
      const res = await fetch("/api/studio/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, emotion }),
      });
      const data = await res.json();
      if (res.ok && data.audioUrl) {
        setEmotionAudios((prev) => ({ ...prev, [emotion]: data.audioUrl }));
        setActiveEmotion(emotion);
      }
    } catch { /* */ }
    setTestingEmotion(null);
  };

  const activeUrl = activeEmotion ? emotionAudios[activeEmotion] : previewUrl;

  const resolveUrl = (url: string) => {
    if (url.includes(".blob.vercel-storage.com")) return blobProxy(url);
    if (url.startsWith("http")) return url;
    return blobProxy(url);
  };

  return (
    <div className="mt-2 space-y-1.5">
      {/* Loading indicator */}
      {testingEmotion && (
        <div className="flex items-center gap-2 py-1.5 px-2 bg-purple-500/10 rounded-lg">
          <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] text-purple-300/60">Generiere {EMOTIONS.find((e) => e.id === testingEmotion)?.label}...</span>
        </div>
      )}

      {/* Audio player */}
      {activeUrl && !testingEmotion && (
        <audio
          key={activeUrl}
          controls
          autoPlay={!!activeEmotion}
          src={resolveUrl(activeUrl)}
          className="w-full h-8"
        />
      )}

      {/* "Anhoeren" button for voices without any preview */}
      {!activeUrl && !activeEmotion && !testingEmotion && (
        <button
          onClick={() => testEmotion("neutral")}
          className="w-full text-[10px] py-2 bg-purple-500/15 text-purple-300/60 rounded-lg hover:text-purple-300 hover:bg-purple-500/25 transition-all"
        >
          Anhoeren
        </button>
      )}

      {/* Emotion buttons */}
      <div className="flex flex-wrap gap-1">
        {EMOTIONS.map((e) => (
          <button
            key={e.id}
            onClick={() => testEmotion(e.id)}
            disabled={testingEmotion !== null}
            className={`text-[10px] px-2.5 py-1 rounded-lg transition-all ${
              activeEmotion === e.id
                ? "bg-[#d4a853]/30 text-[#d4a853] font-medium"
                : emotionAudios[e.id]
                ? "bg-white/10 text-white/50 hover:text-white/70"
                : "bg-white/5 text-white/25 hover:text-white/40 hover:bg-white/10"
            } ${testingEmotion === e.id ? "animate-pulse" : ""} disabled:opacity-30`}
          >
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Voices View (with filters) ──────────────────────────────────

const VOICE_FILTERS = [
  { id: "all", label: "Alle" },
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
  { id: "narrator", label: "Erzaehler" },
  { id: "character", label: "Charakter" },
  { id: "child", label: "Kind" },
  { id: "maennlich", label: "Maennlich" },
  { id: "weiblich", label: "Weiblich" },
];

function VoicesView({ voices, blobProxy, onImport }: { voices: Voice[]; blobProxy: (u: string) => string; onImport: () => void }) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showSharedVoices, setShowSharedVoices] = useState(false);
  const [sharedVoices, setSharedVoices] = useState<Array<{ voiceId: string; name: string; previewUrl?: string; age?: string; gender?: string; descriptive?: string; useCase?: string }>>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedGender, setSharedGender] = useState<string>("");
  const [sharedAge, setSharedAge] = useState<string>("");
  const [sharedUseCase, setSharedUseCase] = useState<string>("");
  const [sharedLang, setSharedLang] = useState("de");

  const searchShared = async () => {
    setSharedLoading(true);
    const params = new URLSearchParams({ source: "shared", language: sharedLang });
    if (sharedGender) params.set("gender", sharedGender);
    if (sharedAge) params.set("age", sharedAge);
    if (sharedUseCase) params.set("use_case", sharedUseCase);
    try {
      const res = await fetch(`/api/studio/voices/import?${params}`);
      const data = await res.json();
      setSharedVoices(data.voices || []);
    } catch { /* */ }
    setSharedLoading(false);
  };

  const importSharedVoice = async (v: { voiceId: string; name: string; previewUrl?: string; age?: string; gender?: string; descriptive?: string }) => {
    try {
      await fetch("/api/studio/voices/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voices: [{
            voiceId: v.voiceId,
            name: v.name,
            previewUrl: v.previewUrl,
            category: v.age === "young" ? "child" : v.descriptive === "wise" || v.descriptive === "calm" ? "narrator" : "character",
            tags: [sharedLang === "de" ? "deutsch" : "englisch", v.gender || "", v.age || "", v.descriptive || ""].filter(Boolean),
          }],
        }),
      });
      onImport();
    } catch { /* */ }
  };

  const toggleFilter = (id: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (id === "all") return new Set(); // "Alle" clears all filters
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const matchesFilter = (v: Voice, filterId: string): boolean => {
    if (filterId === "de") return v.tags.some((t) => ["de", "deutsch"].includes(t.toLowerCase()));
    if (filterId === "en") return v.tags.some((t) => ["en", "englisch"].includes(t.toLowerCase()));
    return v.category === filterId || v.tags.some((t) => t.toLowerCase() === filterId.toLowerCase());
  };

  const filtered = activeFilters.size === 0
    ? voices
    : voices.filter((v) => Array.from(activeFilters).every((f) => matchesFilter(v, f)));

  return (
    <>
      {/* Import Button */}
      <div className="mb-4">
        <button
          onClick={async () => {
            try {
              const res = await fetch("/api/studio/voices/import");
              const data = await res.json();
              const toImport = (data.voices || [])
                .filter((v: { alreadyImported: boolean }) => !v.alreadyImported)
                .map((v: { voiceId: string; name: string; previewUrl?: string; libraryCategory: string; libraryTags: string[]; language: string }) => ({
                  voiceId: v.voiceId, name: v.name, previewUrl: v.previewUrl, category: v.libraryCategory, tags: [...v.libraryTags, v.language],
                }));
              if (toImport.length === 0) { alert("Alle Stimmen sind bereits importiert."); return; }
              const importRes = await fetch("/api/studio/voices/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voices: toImport }),
              });
              const importData = await importRes.json();
              alert(`${importData.count} Stimmen importiert!`);
              if (importData.count > 0) onImport();
            } catch { /* */ }
          }}
          className="px-4 py-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-all"
        >
          Eigene Stimmen importieren
        </button>
        <button
          onClick={() => setShowSharedVoices(true)}
          className="px-4 py-2.5 rounded-xl bg-[#d4a853]/20 border border-[#d4a853]/30 text-[#d4a853] text-xs font-medium hover:bg-[#d4a853]/30 transition-all"
        >
          Weitere Stimmen entdecken (1000+)
        </button>
      </div>

      {/* Filter Buttons (multi-select) */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => toggleFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${
            activeFilters.size === 0
              ? "bg-[#d4a853]/20 text-[#d4a853] font-medium"
              : "bg-white/5 text-white/30 hover:text-white/50"
          }`}
        >
          Alle ({voices.length})
        </button>
        {VOICE_FILTERS.filter((f) => f.id !== "all").map((f) => {
          const isActive = activeFilters.has(f.id);
          const count = voices.filter((v) => matchesFilter(v, f.id)).length;
          return (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${
                isActive
                  ? "bg-[#d4a853]/20 text-[#d4a853] font-medium ring-1 ring-[#d4a853]/30"
                  : "bg-white/5 text-white/30 hover:text-white/50"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <span className="text-[10px] text-white/20 self-center ml-1">{filtered.length} Ergebnisse</span>
        )}
      </div>

      {/* Shared Voice Browser Modal */}
      {showSharedVoices && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowSharedVoices(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#f5eed6]">{"\uD83C\uDF0D"} Stimmen-Bibliothek (1000+)</h3>
              <button onClick={() => setShowSharedVoices(false)} className="text-white/30 hover:text-white/60 text-lg">&times;</button>
            </div>
            {/* Filters */}
            <div className="px-5 py-3 border-b border-white/5 flex flex-wrap gap-2 items-center">
              <select value={sharedLang} onChange={(e) => setSharedLang(e.target.value)} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70">
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="fr">Francais</option>
                <option value="es">Espanol</option>
                <option value="it">Italiano</option>
                <option value="ja">Japanese</option>
              </select>
              <select value={sharedGender} onChange={(e) => setSharedGender(e.target.value)} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70">
                <option value="">Alle Geschlechter</option>
                <option value="female">Weiblich</option>
                <option value="male">Maennlich</option>
                <option value="neutral">Neutral</option>
              </select>
              <select value={sharedAge} onChange={(e) => setSharedAge(e.target.value)} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70">
                <option value="">Alle Alter</option>
                <option value="young">Jung / Kind</option>
                <option value="middle_aged">Mittleres Alter</option>
                <option value="old">Alt / Senior</option>
              </select>
              <select value={sharedUseCase} onChange={(e) => setSharedUseCase(e.target.value)} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/70">
                <option value="">Alle Typen</option>
                <option value="narrative_story">Erzaehler</option>
                <option value="characters_animation">Cartoon / Kind</option>
                <option value="conversational">Konversation</option>
                <option value="informative_educational">Bildung</option>
                <option value="social_media">Social Media</option>
              </select>
              <button onClick={searchShared} disabled={sharedLoading} className="px-3 py-1.5 bg-[#d4a853]/20 text-[#d4a853] rounded-lg text-xs font-medium hover:bg-[#d4a853]/30 disabled:opacity-30">
                {sharedLoading ? "Suche..." : "Suchen"}
              </button>
            </div>
            {/* Results */}
            <div className="flex-1 overflow-y-auto p-5">
              {sharedVoices.length === 0 ? (
                <p className="text-center text-white/30 text-sm py-8">
                  {sharedLoading ? "Suche..." : "Waehle Filter und klicke Suchen"}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sharedVoices.map((v) => (
                    <div key={v.voiceId} className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-[#f5eed6] truncate flex-1">{v.name}</p>
                        <button
                          onClick={() => importSharedVoice(v)}
                          className="text-[9px] px-2.5 py-1 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30 font-medium flex-shrink-0 ml-2"
                        >
                          Importieren
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {v.age && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30">{v.age}</span>}
                        {v.descriptive && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30">{v.descriptive}</span>}
                        {v.useCase && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300/40">{v.useCase}</span>}
                      </div>
                      {v.previewUrl && (
                        <audio controls src={v.previewUrl} className="w-full h-7" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Voice Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-white/20 text-sm">
          Keine Stimmen fuer diesen Filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((voice) => (
            <div
              key={voice.id}
              className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:border-white/15 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">{
                    voice.category === "narrator" ? "\uD83D\uDCD6" :
                    voice.category === "child" ? "\uD83E\uDDD2" :
                    voice.category === "character" ? "\uD83C\uDFAD" : "\uD83C\uDFA4"
                  }</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#f5eed6]">{voice.name}</p>
                  {/* All tags visible */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {voice.tags.map((t) => (
                      <span
                        key={t}
                        onClick={() => {
                          const matchingFilter = VOICE_FILTERS.find((f) => f.id === t.toLowerCase() || (f.id === "de" && ["de", "deutsch"].includes(t.toLowerCase())) || (f.id === "en" && ["en", "englisch"].includes(t.toLowerCase())));
                          if (matchingFilter) toggleFilter(matchingFilter.id);
                        }}
                        className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 hover:text-white/50 cursor-pointer"
                      >
                        {t}
                      </span>
                    ))}
                    {voice.category && (
                      <span
                        onClick={() => toggleFilter(voice.category!)}
                        className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300/40 hover:text-purple-300/60 cursor-pointer"
                      >
                        {voice.category}
                      </span>
                    )}
                  </div>
                  {voice._count && voice._count.actors > 0 && (
                    <p className="text-[8px] text-purple-300/30 mt-0.5">Verwendet von {voice._count.actors} Actor(s)</p>
                  )}
                </div>
              </div>
              <VoiceEmotionTester voiceId={voice.voiceId} previewUrl={voice.previewUrl} blobProxy={blobProxy} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Main Library Page ───────────────────────────────────────────

export default function LibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [actors, setActors] = useState<DigitalActor[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AssetType | "all">("all");
  const [category, setCategory] = useState<LibraryCategory>("actors");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // New state: filters
  const [searchText, setSearchText] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [styleFilter, setStyleFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "name">("newest");
  const [tagFilter, setTagFilter] = useState<string>("all");

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
    // Map category to the right API
    if (category === "actors") {
      setFilter("actor");
      fetch("/api/studio/actors")
        .then((r) => r.json())
        .then((d) => { setActors(d.actors || []); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (category === "voices") {
      fetch("/api/studio/voices")
        .then((r) => r.json())
        .then((d) => { setVoices(d.voices || []); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (category === "locations") {
      setFilter("landscape");
      // Load ALL landscape assets (both old "standalone" and new "location" category)
      fetch("/api/studio/assets?type=landscape")
        .then((r) => r.json())
        .then((d) => { setAssets(d.assets || []); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (category === "props") {
      setFilter("reference");
      fetch("/api/studio/assets?type=reference&category=prop")
        .then((r) => r.json())
        .then((d) => { setAssets(d.assets || []); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (category === "music") {
      setFilter("sound");
      fetch("/api/studio/assets?type=sound")
        .then((r) => r.json())
        .then((d) => { setAssets(d.assets || []); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (category === "clips") {
      setFilter("clip");
      fetch("/api/studio/assets?type=clip")
        .then((r) => r.json())
        .then((d) => { setAssets(d.assets || []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [category]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Load portrait URLs for actors that have portraitAssetId
  useEffect(() => {
    if (category !== "actors" || actors.length === 0) return;
    const needsPortrait = actors.filter((a) => (a.portraitAssetId || a.characterSheet?.front) && !portraitMap[a.id]);
    if (needsPortrait.length === 0) return;

    // For actors whose portraitAssetId looks like a URL (starts with http), use directly
    // For asset IDs, fetch from the asset
    const newMap: Record<string, string> = {};
    for (const a of actors) {
      if (portraitMap[a.id]) continue; // Already have it
      // Try portraitAssetId first, then characterSheet.front
      const url = a.portraitAssetId || a.characterSheet?.front;
      if (url?.startsWith("http")) {
        newMap[a.id] = url;
      }
    }
    if (Object.keys(newMap).length > 0) {
      setPortraitMap((prev) => ({ ...prev, ...newMap }));
    }
    // Could also fetch asset URLs from API for non-http IDs, but skip for now
  }, [category, actors, portraitMap]);

  const blobProxy = (url: string) =>
    url.includes(".blob.vercel-storage.com")
      ? `/api/studio/blob?url=${encodeURIComponent(url)}`
      : url;

  // ── Derived filter data ──────────────────────────────────────

  const allItems = category === "actors" ? actors : assets;

  // Extract unique project/style tags from current items
  const { projectTags, styleTags } = useMemo(() => {
    const projects = new Set<string>();
    const styles = new Set<string>();
    const items = category === "actors" ? actors : assets;
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
    if (tagFilter !== "all") {
      items = items.filter((a) => a.tags.includes(tagFilter));
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter((a) =>
        ((a as { name?: string }).name || "").toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q) ||
        (a.modelId || "").toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    // Sort
    if (sortBy === "name") {
      items = [...items].sort((a, b) => ((a as { name?: string }).name || "").localeCompare((b as { name?: string }).name || ""));
    }
    // "newest" is default from API (already sorted by createdAt desc)
    return items;
  }, [assets, projectFilter, styleFilter, tagFilter, searchText, sortBy]);

  // Collect unique tags from current assets for filter chips
  const assetTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets) {
      for (const t of a.tags) {
        if (!t.startsWith("project:") && !t.startsWith("style:")) {
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));
  }, [assets]);

  const filteredActors = useMemo(() => {
    let items = actors;
    if (projectFilter !== "all") {
      items = items.filter((a) => a.tags.includes(`project:${projectFilter}`));
    }
    if (genderFilter !== "all") {
      // Support both old format (gender:male) and new (maennlich)
      items = items.filter((a) => {
        if (genderFilter === "male") return a.tags.some((t) => t === "gender:male" || t === "maennlich");
        if (genderFilter === "female") return a.tags.some((t) => t === "gender:female" || t === "weiblich");
        return true;
      });
    }
    if (tagFilter !== "all") {
      items = items.filter((a) => a.tags.includes(tagFilter));
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
  }, [actors, projectFilter, genderFilter, tagFilter, searchText]);

  // Collect actor tags for filter
  const actorTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of actors) {
      for (const t of a.tags) {
        if (!t.startsWith("project:") && !t.startsWith("gender:")) {
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }));
  }, [actors]);

  const displayItems = category === "actors" ? filteredActors : filteredAssets;
  const selectedActor = selectedActorId ? actors.find((a) => a.id === selectedActorId) || null : null;

  const hasSubFilters = projectTags.length > 0 || styleTags.length > 0 || category === "actors";

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
            {category === "actors"
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

      {/* Category Navigation */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => { setCategory(c.id); setSelectedActorId(null); setShowNewActorForm(false); setShowGenerateForm(false); }}
            className={`flex-1 px-3 py-2 rounded-lg text-[11px] transition-all ${
              category === c.id
                ? "bg-[#d4a853]/20 text-[#d4a853] font-medium"
                : "text-white/30 hover:text-white/50"
            }`}
          >
            {c.icon} {c.label}
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
        {category === "actors" && (
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

        {/* Sort (for non-actor, non-voice views) */}
        {!["actors", "voices"].includes(category) && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "name")}
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/40 focus:outline-none appearance-none cursor-pointer ml-auto"
          >
            <option value="newest">Neueste</option>
            <option value="name">Name A-Z</option>
          </select>
        )}
      </div>

      {/* Tag Filter Chips (for props, locations, clips) */}
      {!["actors", "voices"].includes(category) && assetTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            onClick={() => setTagFilter("all")}
            className={`text-[9px] px-2 py-0.5 rounded transition-all ${
              tagFilter === "all" ? "bg-white/15 text-white/50" : "bg-white/5 text-white/20 hover:text-white/40"
            }`}
          >
            Alle
          </button>
          {assetTags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? "all" : tag)}
              className={`text-[9px] px-2 py-0.5 rounded transition-all ${
                tagFilter === tag ? "bg-[#d4a853]/20 text-[#d4a853]" : "bg-white/5 text-white/20 hover:text-white/40"
              }`}
            >
              {tag} <span className="text-white/10">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Actors View ────────────────────────────────────────── */}
      {category === "actors" && (
        <>
          {/* Actor Tag Filters */}
          {actorTags.length > 0 && !showNewActorForm && !selectedActorId && (
            <div className="flex flex-wrap gap-1 mb-3">
              <button onClick={() => setTagFilter("all")} className={`text-[9px] px-2 py-0.5 rounded transition-all ${tagFilter === "all" ? "bg-white/15 text-white/50" : "bg-white/5 text-white/20 hover:text-white/40"}`}>Alle</button>
              {actorTags.map(({ tag, count }) => (
                <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? "all" : tag)} className={`text-[9px] px-2 py-0.5 rounded transition-all ${tagFilter === tag ? "bg-[#d4a853]/20 text-[#d4a853]" : "bg-white/5 text-white/20 hover:text-white/40"}`}>
                  {tag} <span className="text-white/10">{count}</span>
                </button>
              ))}
            </div>
          )}

          {/* New Actor Button */}
          {!showNewActorForm && (
            <button
              onClick={() => { setShowNewActorForm(true); setSelectedActorId(null); }}
              className="mb-4 px-4 py-2.5 rounded-xl bg-[#3d6b4a]/30 border border-[#3d6b4a]/40 text-[#a8d5b8] text-xs font-medium hover:bg-[#3d6b4a]/50 transition-all"
            >
              + Neuer Schauspieler
            </button>
          )}

          {/* Actor Sheet (unified create/edit) */}
          {(showNewActorForm || selectedActor) && (
            <ActorSheetComponent
              initial={selectedActor ? {
                id: selectedActor.id,
                name: selectedActor.name,
                description: selectedActor.description || "",
                voiceDescription: selectedActor.voiceDescription || "",
                style: selectedActor.style || "realistic",
                outfit: selectedActor.outfit || "",
                traits: selectedActor.traits || "",
                voiceId: selectedActor.voiceId || undefined,
                voiceSettings: selectedActor.voiceSettings,
                voicePreviewUrl: selectedActor.voicePreviewUrl || undefined,
                portraitAssetId: selectedActor.portraitAssetId || undefined,
                characterSheet: selectedActor.characterSheet,
                _count: selectedActor._count,
              } : undefined}
              onSave={(actor) => {
                if (selectedActor) {
                  setActors((prev) => prev.map((a) => (a.id === actor.id ? { ...a, ...actor } as DigitalActor : a)));
                  if (actor.portraitAssetId?.startsWith("http")) {
                    setPortraitMap((prev) => ({ ...prev, [actor.id!]: actor.portraitAssetId! }));
                  }
                } else {
                  setActors((prev) => [actor as unknown as DigitalActor, ...prev]);
                }
                setShowNewActorForm(false);
                setSelectedActorId(null);
              }}
              onClose={() => { setShowNewActorForm(false); setSelectedActorId(null); }}
              blobProxy={blobProxy}
            />
          )}

          {/* Actor Grid — hidden when sheet is open */}
          {!showNewActorForm && !selectedActor && (filteredActors.length === 0 ? (
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
          ))}
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

      {/* ── Voices View ────────────────────────────────────────── */}
      {category === "voices" && (
        <VoicesView voices={voices} blobProxy={blobProxy} onImport={loadAssets} />
      )}

      {/* ── Location Generation ──────────────────────────────── */}
      {category === "locations" && (
        <LocationGenerator blobProxy={blobProxy} onCreated={loadAssets} />
      )}

      {/* ── Props Generation ─────────────────────────────────── */}
      {category === "props" && (
        <PropsGenerator blobProxy={blobProxy} onCreated={loadAssets} />
      )}

      {/* LandscapeGenerator removed — merged into Locations */}

      {/* ── Music Upload ──────────────────────────────────────── */}
      {category === "music" && (
        <MusicUploader onUploaded={loadAssets} />
      )}

      {/* ── Asset Grid (Landscapes, Music, Clips) ────────────────── */}
      {category !== "actors" && category !== "voices" && (() => {
        // Group assets by project for clips, by category for others
        const grouped = new Map<string, Asset[]>();
        for (const asset of filteredAssets) {
          const key = category === "clips"
            ? (asset.projectId || "Ohne Projekt")
            : (asset.category || "Allgemein");
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(asset);
        }

        if (filteredAssets.length === 0) return (
          <div className="text-center py-12 text-white/20 text-sm">
            <span className="text-4xl block mb-3">{category === "locations" ? "\uD83D\uDCCD" : category === "props" ? "\uD83C\uDFAA" : category === "music" ? "\uD83C\uDFB5" : "\uD83C\uDFAC"}</span>
            <p>Noch keine {category === "locations" ? "Locations" : category === "props" ? "Props" : category === "music" ? "Musik" : "Clips"}.</p>
          </div>
        );

        return (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([group, groupAssets]) => (
              <div key={group}>
                {grouped.size > 1 && (
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">{group}</p>
                )}
                <div className={`grid gap-3 ${category === "locations" ? "grid-cols-2 sm:grid-cols-3" : category === "music" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"}`}>
                  {groupAssets.map((asset) => (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(selectedAsset?.id === asset.id ? null : asset)}
                      className={`bg-white/[0.03] border rounded-xl overflow-hidden cursor-pointer transition-all ${
                        selectedAsset?.id === asset.id ? "border-[#d4a853]/40 ring-1 ring-[#d4a853]/20" : "border-white/5 hover:border-white/15"
                      }`}
                    >
                      {/* Thumbnail */}
                      {asset.mimeType.startsWith("image/") ? (
                        <img src={blobProxy(asset.blobUrl)} alt="" className={`w-full ${category === "locations" ? "h-32" : "h-24"} object-cover`} loading="lazy" />
                      ) : asset.mimeType.startsWith("video/") ? (
                        <video src={blobProxy(asset.blobUrl)} muted preload="metadata" className="w-full h-24 object-cover bg-black/30" />
                      ) : asset.mimeType.startsWith("audio/") ? (
                        <div className="p-3">
                          <audio controls src={blobProxy(asset.blobUrl)} className="w-full h-8 opacity-70" />
                        </div>
                      ) : (
                        <div className="w-full h-24 bg-white/5 flex items-center justify-center text-2xl">{"\uD83D\uDCC4"}</div>
                      )}
                      {/* Info */}
                      <div className="p-2">
                        {(asset as { name?: string }).name && <p className="text-[10px] text-[#f5eed6] truncate font-medium">{(asset as { name?: string }).name}</p>}
                        {asset.category && <p className="text-[8px] text-white/20 truncate">{asset.category}</p>}
                        <p className="text-[8px] text-white/15 mt-0.5">
                          {(asset.sizeBytes / 1024).toFixed(0)}KB
                          {asset.costCents ? ` · $${(asset.costCents / 100).toFixed(2)}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Selected Asset Detail + Edit */}
      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          blobProxy={blobProxy}
          onClose={() => setSelectedAsset(null)}
          onUpdate={() => { loadAssets(); setSelectedAsset(null); }}
          onDelete={() => { loadAssets(); setSelectedAsset(null); }}
        />
      )}
    </div>
  );
}

"use client";

/**
 * ActorSheet — Unified Create/Edit for Digital Actors
 *
 * Same component for new actors (empty state) and editing (pre-filled).
 * Pattern: Sheet layout with visual (portrait) left, form right.
 * Fields are always editable. CTAs next to the field they affect.
 */

import { useState, useCallback } from "react";
import {
  Sheet, Section, Field, TextInput, Select, ActionButton,
  AudioPreview, ImageSlot, Badge, Slider,
} from "@/app/components/ui";

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost?: boolean;
}

interface ActorData {
  id?: string;
  name: string;
  description: string;
  voiceDescription: string;
  style: string;
  outfit: string;
  traits: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings | null;
  voicePreviewUrl?: string;
  portraitAssetId?: string;
  characterSheet?: { front?: string; profile?: string; fullBody?: string } | null;
  libraryVoiceId?: string;
  _count?: { characters: number };
}

interface ActorSheetProps {
  /** Pre-filled data for editing. Undefined = create mode. */
  initial?: Partial<ActorData>;
  /** Called when actor is saved (created or updated) */
  onSave: (actor: ActorData) => void;
  onClose: () => void;
  blobProxy: (url: string) => string;
}

const STYLES = [
  { value: "realistic", label: "Realistisch" },
  { value: "disney-2d", label: "Disney 2D" },
  { value: "pixar-3d", label: "Pixar 3D" },
  { value: "ghibli", label: "Ghibli" },
];

export default function ActorSheet({ initial, onSave, onClose, blobProxy }: ActorSheetProps) {
  const isEdit = !!initial?.id;

  // Form state
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [voiceDescription, setVoiceDescription] = useState(initial?.voiceDescription || "");
  const [style, setStyle] = useState(initial?.style || "realistic");
  const [outfit, setOutfit] = useState(initial?.outfit || "");
  const [traits, setTraits] = useState(initial?.traits || "");

  // Voice state
  const [voiceId, setVoiceId] = useState(initial?.voiceId);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState(initial?.voicePreviewUrl);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(
    (initial?.voiceSettings as VoiceSettings) || { stability: 0.35, similarity_boost: 0.75, style: 0.65, speed: 0.95 }
  );
  const [generatedVoiceId, setGeneratedVoiceId] = useState<string | null>(null);

  // Portrait state
  const [portraitUrl, setPortraitUrl] = useState(initial?.portraitAssetId);

  // Loading states
  const [saving, setSaving] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actor ID (created on first save/voice/portrait action)
  const [actorId, setActorId] = useState(initial?.id);

  const ensureActor = useCallback(async (): Promise<string | null> => {
    if (actorId) return actorId;
    if (!name.trim()) { setError("Name ist erforderlich"); return null; }
    try {
      const res = await fetch("/api/studio/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), voiceDescription: voiceDescription.trim() || undefined, style, outfit: outfit.trim() || undefined, traits: traits.trim() || undefined, tags: [] }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return null; }
      setActorId(data.actor.id);
      return data.actor.id;
    } catch { setError("Netzwerkfehler"); return null; }
  }, [actorId, name, description, voiceDescription, style, outfit, traits]);

  const handleDesignVoice = async () => {
    setError(null);
    const id = await ensureActor();
    if (!id) return;
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: id, description: voiceDescription || `${description || name}, spricht Deutsch` }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setGeneratedVoiceId(data.generatedVoiceId);
      setVoicePreviewUrl(data.previewUrl);
    } catch { setError("Netzwerkfehler"); }
    setVoiceLoading(false);
  };

  const handleSaveVoice = async () => {
    if (!actorId || !generatedVoiceId) return;
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/studio/actors/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, generatedVoiceId, name, description: voiceDescription || name }),
      });
      const data = await res.json();
      if (res.ok) {
        setVoiceId(data.voiceId);
        setGeneratedVoiceId(null);
        if (data.actor?.voicePreviewUrl) setVoicePreviewUrl(data.actor.voicePreviewUrl);
      }
    } catch { setError("Netzwerkfehler"); }
    setVoiceLoading(false);
  };

  const handleGeneratePortrait = async () => {
    setError(null);
    const id = await ensureActor();
    if (!id) return;
    setPortraitLoading(true);
    try {
      const res = await fetch("/api/studio/actors/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: id, description: description || name, style }),
      });
      const data = await res.json();
      if (res.ok) setPortraitUrl(data.portraitUrl);
      else setError(data.error);
    } catch { setError("Netzwerkfehler"); }
    setPortraitLoading(false);
  };

  const handleSave = async () => {
    const id = await ensureActor();
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/studio/actors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          updates: {
            name: name.trim(),
            description: description.trim(),
            voiceDescription: voiceDescription.trim() || null,
            style,
            outfit: outfit.trim() || null,
            traits: traits.trim() || null,
            voiceSettings,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) onSave(data.actor);
    } catch { setError("Netzwerkfehler"); }
    setSaving(false);
  };

  return (
    <Sheet
      visual={
        <div className="w-32">
          <ImageSlot
            src={portraitUrl}
            alt={name || "Actor"}
            onGenerate={handleGeneratePortrait}
            generating={portraitLoading}
            blobProxy={blobProxy}
          />
          {initial?._count && initial._count.characters > 0 && (
            <p className="text-[9px] text-purple-300/50 text-center mt-1">
              In {initial._count.characters} {initial._count.characters === 1 ? "Projekt" : "Projekten"}
            </p>
          )}
        </div>
      }
      onClose={onClose}
    >
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
          {error}
        </div>
      )}

      {/* Identity */}
      <Section title="Identitaet">
        <Field label="Name">
          <TextInput value={name} onChange={setName} placeholder="z.B. Max Brenner" />
        </Field>
        <Field label="Beschreibung" hint="Visuelles Aussehen fuer Portrait-Generierung">
          <TextInput value={description} onChange={setDescription} placeholder="z.B. 35, maennlich, dunkle Haare, markantes Kinn" multiline />
        </Field>
        <Field label="Stil">
          <Select value={style} onChange={setStyle} options={STYLES} />
        </Field>
      </Section>

      {/* Appearance */}
      <Section title="Aussehen">
        <Field label="Outfit / Kleidung" hint="Wird in jeden Portrait-Prompt eingebaut">
          <TextInput value={outfit} onChange={setOutfit} placeholder="z.B. Schwarze Lederjacke, weisses T-Shirt, Jeans" />
        </Field>
        <Field label="Eigenschaften" hint="Bleibende Merkmale in jeder Rolle">
          <TextInput value={traits} onChange={setTraits} placeholder="z.B. Traegt Brille, Narbe, markantes Kinn" />
        </Field>
      </Section>

      {/* Voice */}
      <Section title="Stimme" action={
        voiceId ? <Badge color="green">Stimme gespeichert</Badge> : undefined
      }>
        <Field
          label="Stimm-Beschreibung"
          hint="Beschreibe wie die Stimme klingen soll — nicht das Aussehen"
          cta={
            <ActionButton onClick={handleDesignVoice} loading={voiceLoading} disabled={!voiceDescription.trim() && !description.trim()}>
              Stimme generieren
            </ActionButton>
          }
        >
          <TextInput
            value={voiceDescription}
            onChange={setVoiceDescription}
            placeholder='z.B. "Tiefe maennliche Stimme, warm, ruhig, weiser Erzaehler"'
          />
        </Field>

        {voicePreviewUrl && (
          <div className="mb-2">
            <AudioPreview url={voicePreviewUrl} blobProxy={blobProxy} label="Preview" />
          </div>
        )}

        {generatedVoiceId && !voiceId && (
          <ActionButton onClick={handleSaveVoice} loading={voiceLoading} variant="primary">
            Stimme speichern
          </ActionButton>
        )}

        {voiceId && (
          <div className="space-y-1.5 mt-2">
            <Slider label="Stabilitaet" value={voiceSettings.stability} onChange={(v) => setVoiceSettings({ ...voiceSettings, stability: v })} />
            <Slider label="Aehnlichkeit" value={voiceSettings.similarity_boost} onChange={(v) => setVoiceSettings({ ...voiceSettings, similarity_boost: v })} />
            <Slider label="Ausdruck" value={voiceSettings.style} onChange={(v) => setVoiceSettings({ ...voiceSettings, style: v })} />
            <Slider label="Tempo" value={voiceSettings.speed} onChange={(v) => setVoiceSettings({ ...voiceSettings, speed: v })} min={0.5} max={2.0} />
          </div>
        )}
      </Section>

      {/* Save */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <ActionButton onClick={handleSave} loading={saving} disabled={!name.trim()}>
          {isEdit ? "Speichern" : "Actor erstellen"}
        </ActionButton>
        <ActionButton onClick={onClose} variant="secondary">
          Abbrechen
        </ActionButton>
      </div>
    </Sheet>
  );
}

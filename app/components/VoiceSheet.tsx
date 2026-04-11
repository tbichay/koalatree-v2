"use client";

/**
 * VoiceSheet — Unified Create/Edit for Voice Library
 *
 * Same pattern as ActorSheet. Visual (waveform icon) left, form right.
 */

import { useState } from "react";
import {
  Sheet, Section, Field, TextInput, Select, ActionButton,
  AudioPreview, Badge, Slider,
} from "@/app/components/ui";

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
}

interface VoiceData {
  id?: string;
  name: string;
  description: string;
  voiceId?: string;
  voiceSettings?: VoiceSettings | null;
  previewUrl?: string;
  category?: string;
  tags: string[];
  _count?: { actors: number };
}

interface VoiceSheetProps {
  initial?: Partial<VoiceData>;
  onSave: (voice: VoiceData) => void;
  onClose: () => void;
  blobProxy: (url: string) => string;
}

const VOICE_CATEGORIES = [
  { value: "narrator", label: "Erzaehler" },
  { value: "character", label: "Charakter" },
  { value: "child", label: "Kind" },
  { value: "custom", label: "Eigene" },
];

export default function VoiceSheet({ initial, onSave, onClose, blobProxy }: VoiceSheetProps) {
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [voiceCategory, setVoiceCategory] = useState(initial?.category || "custom");
  const [previewUrl, setPreviewUrl] = useState(initial?.previewUrl);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(
    (initial?.voiceSettings as VoiceSettings) || { stability: 0.35, similarity_boost: 0.75, style: 0.65, speed: 0.95 }
  );

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test with custom text
  const [testText, setTestText] = useState("");
  const [testPlaying, setTestPlaying] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !description.trim()) { setError("Name und Beschreibung erforderlich"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category: voiceCategory,
          tags: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onSave(data.voice);
    } catch { setError("Netzwerkfehler"); }
    setCreating(false);
  };

  const handleUpdate = async () => {
    if (!initial?.id) return;
    setCreating(true);
    try {
      const res = await fetch("/api/studio/voices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initial.id,
          updates: {
            name: name.trim(),
            description: description.trim(),
            category: voiceCategory,
            voiceSettings,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) onSave(data.voice);
    } catch { setError("Netzwerkfehler"); }
    setCreating(false);
  };

  return (
    <Sheet
      visual={
        <div className="w-24 h-24 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <span className="text-3xl">{"\uD83C\uDFA4"}</span>
        </div>
      }
      onClose={onClose}
    >
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
          {error}
        </div>
      )}

      <Section title="Stimme">
        <Field label="Name">
          <TextInput value={name} onChange={setName} placeholder='z.B. "Weiser Erzaehler", "Freche Goere"' />
        </Field>
        <Field
          label="Stimm-Beschreibung"
          hint="Beschreibe Tonlage, Alter, Stimmung, Tempo — wird von AI optimiert"
        >
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder='z.B. "Tiefe warme maennliche Stimme, 65 Jahre, ruhig, weise, langsam erzaehlend"'
            multiline
          />
        </Field>
        <Field label="Kategorie">
          <Select value={voiceCategory} onChange={setVoiceCategory} options={VOICE_CATEGORIES} />
        </Field>
      </Section>

      {/* Preview */}
      {previewUrl && (
        <Section title="Preview">
          <AudioPreview url={previewUrl} blobProxy={blobProxy} />
          {initial?._count && initial._count.actors > 0 && (
            <p className="text-[9px] text-purple-300/40 mt-1">
              Verwendet von {initial._count.actors} Actor(s)
            </p>
          )}
        </Section>
      )}

      {/* Voice Settings (only for edit) */}
      {isEdit && initial?.voiceId && (
        <Section title="Einstellungen">
          <div className="space-y-1.5">
            <Slider label="Stabilitaet" value={voiceSettings.stability} onChange={(v) => setVoiceSettings({ ...voiceSettings, stability: v })} />
            <Slider label="Aehnlichkeit" value={voiceSettings.similarity_boost} onChange={(v) => setVoiceSettings({ ...voiceSettings, similarity_boost: v })} />
            <Slider label="Ausdruck" value={voiceSettings.style} onChange={(v) => setVoiceSettings({ ...voiceSettings, style: v })} />
            <Slider label="Tempo" value={voiceSettings.speed} onChange={(v) => setVoiceSettings({ ...voiceSettings, speed: v })} min={0.5} max={2.0} />
          </div>
        </Section>
      )}

      {/* Save */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <ActionButton onClick={isEdit ? handleUpdate : handleCreate} loading={creating} disabled={!name.trim() || !description.trim()}>
          {isEdit ? "Speichern" : "Stimme erstellen"}
        </ActionButton>
        <ActionButton onClick={onClose} variant="secondary">
          Abbrechen
        </ActionButton>
      </div>
    </Sheet>
  );
}

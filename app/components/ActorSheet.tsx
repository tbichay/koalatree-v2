"use client";

/**
 * ActorSheet — Unified Create/Edit for Digital Actors
 *
 * Same component for new actors (empty state) and editing (pre-filled).
 * Pattern: Sheet layout with visual (portrait) left, form right.
 * Fields are always editable. CTAs next to the field they affect.
 */

import { useState, useEffect, useCallback } from "react";
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
  /** Toast-style notification callback (since ActorSheet may be outside ToastProvider) */
  onNotify?: (type: "loading" | "success" | "error" | "info", message: string) => void;
}

import { STYLE_OPTIONS } from "@/lib/studio/visual-styles";
const STYLES = STYLE_OPTIONS.map((s) => ({ value: s.id, label: s.label }));

export default function ActorSheet({ initial, onSave, onClose, blobProxy, onNotify }: ActorSheetProps) {
  const notify = onNotify || (() => {}); // no-op if not provided
  const isEdit = !!initial?.id;

  // Form state
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [voiceDescription, setVoiceDescription] = useState(initial?.voiceDescription || "");
  const [style, setStyle] = useState(initial?.style || "realistic");
  const [outfit, setOutfit] = useState(initial?.outfit || "");
  const [traits, setTraits] = useState(initial?.traits || "");
  const [tags, setTags] = useState<string[]>((initial as { tags?: string[] })?.tags || []);
  const [newTag, setNewTag] = useState("");

  // Voice state
  const [voiceId, setVoiceId] = useState(initial?.voiceId);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState(initial?.voicePreviewUrl);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(
    (initial?.voiceSettings as VoiceSettings) || { stability: 0.35, similarity_boost: 0.75, style: 0.65, speed: 0.95 }
  );
  const [generatedVoiceId, setGeneratedVoiceId] = useState<string | null>(null);

  // Portrait state
  const [portraitUrl, setPortraitUrl] = useState(initial?.portraitAssetId);

  // Character Sheet state (front, profile, fullBody)
  const [charSheet, setCharSheet] = useState<{ front?: string; profile?: string; fullBody?: string }>(
    initial?.characterSheet || {},
  );
  const [sheetGenerating, setSheetGenerating] = useState<string | null>(null); // "front" | "profile" | "fullBody" | "all"

  // Voice picker
  const [showVoicePicker, setShowVoicePicker] = useState(false);

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
        body: JSON.stringify({ name: name.trim(), description: description.trim(), voiceDescription: voiceDescription.trim() || undefined, style, outfit: outfit.trim() || undefined, traits: traits.trim() || undefined, tags }),
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
    notify("loading", "Portrait wird generiert...");
    try {
      const res = await fetch("/api/studio/actors/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId: id, description: description || name, style }),
      });
      const data = await res.json();
      if (res.ok) { setPortraitUrl(data.portraitUrl); notify("success", "Portrait fertig!"); }
      else { setError(data.error); notify("error", data.error || "Portrait fehlgeschlagen"); }
    } catch { setError("Netzwerkfehler"); notify("error", "Netzwerkfehler"); }
    setPortraitLoading(false);
  };

  const handleGenerateSheet = async (angle: "front" | "profile" | "fullBody" | "all") => {
    setError(null);
    const id = await ensureActor();
    if (!id) return;

    const angles = angle === "all" ? ["front", "profile", "fullBody"] as const : [angle] as const;
    const labels = { front: "Front", profile: "Profil", fullBody: "Ganzkoerper" };
    setSheetGenerating(angle);
    notify("loading", angle === "all" ? "Character Sheet wird generiert..." : `${labels[angle as keyof typeof labels]} wird generiert...`);

    let success = 0;
    for (const a of angles) {
      notify("loading", `${labels[a]} wird generiert...`);
      try {
        const res = await fetch("/api/studio/actors/character-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorId: id, angle: a, description: description || name, style }),
        });
        const data = await res.json();
        if (res.ok && data.characterSheet) {
          setCharSheet((prev) => ({ ...prev, ...data.characterSheet }));
          if (a === "front" && data.portraitUrl) setPortraitUrl(data.portraitUrl);
          success++;
        } else if (!res.ok) {
          setError(data.error || `Fehler bei ${a}`);
          notify("error", `${labels[a]} fehlgeschlagen`);
        }
      } catch { setError("Netzwerkfehler"); notify("error", "Netzwerkfehler"); }
    }
    if (success > 0) notify("success", `${success} Pose${success > 1 ? "n" : ""} generiert!`);
    setSheetGenerating(null);
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
            voiceId: voiceId || undefined,
            voicePreviewUrl: voicePreviewUrl || undefined,
            style,
            outfit: outfit.trim() || null,
            traits: traits.trim() || null,
            tags,
            voiceSettings,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) { notify("success", "Actor gespeichert"); onSave(data.actor); }
      else { setError(data.error || "Speichern fehlgeschlagen"); notify("error", "Speichern fehlgeschlagen"); }
    } catch { setError("Netzwerkfehler"); notify("error", "Netzwerkfehler"); }
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

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 bg-white/10 rounded text-white/50">
              {tag}
              <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="text-white/25 hover:text-red-300">&times;</button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-[9px] text-white/15">Keine Tags</span>}
        </div>
        <div className="flex gap-1.5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                e.preventDefault();
                const t = newTag.trim().toLowerCase();
                if (!tags.includes(t)) setTags([...tags, t]);
                setNewTag("");
              }
            }}
            placeholder="Tag hinzufuegen (Enter)"
            className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] text-white/50 focus:outline-none focus:border-[#d4a853]/30 placeholder:text-white/15"
          />
          {/* Quick tag suggestions */}
          {!newTag && tags.length < 3 && (
            <div className="flex gap-0.5">
              {["maennlich", "weiblich", "kind", "deutsch", "englisch", "held", "boesewicht", "erzaehler"]
                .filter((t) => !tags.includes(t))
                .slice(0, 3)
                .map((t) => (
                  <button key={t} onClick={() => setTags([...tags, t])} className="text-[8px] px-1.5 py-0.5 bg-white/5 rounded text-white/15 hover:text-white/30">
                    +{t}
                  </button>
                ))}
            </div>
          )}
        </div>
      </Section>

      {/* Character Sheet — 3 Poses */}
      {isEdit && (
        <Section title="Character Sheet" action={
          <ActionButton
            onClick={() => handleGenerateSheet("all")}
            loading={sheetGenerating === "all"}
            variant="secondary"
            disabled={sheetGenerating !== null}
          >
            Alle generieren
          </ActionButton>
        }>
          <p className="text-[9px] text-white/20 mb-2">3 Posen fuer konsistente Video-Generierung (Kling Element Binding)</p>
          <div className="grid grid-cols-3 gap-2">
            {(["front", "profile", "fullBody"] as const).map((angle) => {
              const labels = { front: "Front", profile: "Profil", fullBody: "Ganzkoerper" };
              const url = charSheet[angle];
              const isGen = sheetGenerating === angle || sheetGenerating === "all";
              return (
                <div key={angle} className="text-center">
                  <div className="w-full aspect-[3/4] rounded-lg bg-white/5 overflow-hidden mb-1 relative">
                    {url ? (
                      <img src={blobProxy(url)} alt={labels[angle]} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {isGen ? (
                          <div className="w-4 h-4 border-2 border-[#C8A97E] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="text-white/10 text-lg">📷</span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[8px] text-white/30 mb-1">{labels[angle]}</p>
                  <button
                    onClick={() => handleGenerateSheet(angle)}
                    disabled={isGen || sheetGenerating !== null}
                    className="text-[8px] px-2 py-0.5 rounded bg-white/5 text-white/25 hover:text-white/40 hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    {url ? "Neu" : "Generieren"}
                  </button>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Voice — select from library */}
      <Section title="Stimme" action={
        voiceId ? <Badge color="green">Stimme zugewiesen</Badge> : undefined
      }>
        {voicePreviewUrl && (
          <div className="mb-2">
            <AudioPreview url={voicePreviewUrl} blobProxy={blobProxy} label="Aktuelle Stimme" />
          </div>
        )}
        <ActionButton onClick={() => setShowVoicePicker(true)} variant={voiceId ? "secondary" : "primary"}>
          {voiceId ? "Andere Stimme waehlen" : "Stimme waehlen"}
        </ActionButton>
      </Section>

      {/* Voice Picker Modal */}
      {showVoicePicker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowVoicePicker(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#f5eed6]">{"\uD83C\uDFA4"} Stimme waehlen</h3>
              <button onClick={() => setShowVoicePicker(false)} className="text-white/30 hover:text-white/60 text-lg">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <VoicePickerGrid
                onSelect={async (selectedVoiceId, selectedPreviewUrl) => {
                  console.log("[ActorSheet] Voice selected:", selectedVoiceId, selectedPreviewUrl);
                  setVoiceId(selectedVoiceId);
                  if (selectedPreviewUrl) setVoicePreviewUrl(selectedPreviewUrl);
                  setShowVoicePicker(false);

                  // Auto-save: create actor first if needed, then update voice
                  const id = actorId || await ensureActor();
                  if (id) {
                    try {
                      const updates: Record<string, unknown> = { voiceId: selectedVoiceId };
                      if (selectedPreviewUrl) updates.voicePreviewUrl = selectedPreviewUrl;
                      const res = await fetch("/api/studio/actors", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id, updates }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        // Force update local state with saved values
                        setVoiceId(data.actor.voiceId);
                        setVoicePreviewUrl(data.actor.voicePreviewUrl);
                        notify("success", "Stimme zugewiesen");
                        onSave(data.actor);
                      }
                    } catch (err) { console.error("[ActorSheet] Voice save failed:", err); notify("error", "Stimme zuweisen fehlgeschlagen"); }
                  }
                }}
                blobProxy={blobProxy}
              />
            </div>
          </div>
        </div>
      )}

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

// ── Voice Picker Grid with Multi-Filter ──────────────────────────

interface VoiceItem {
  id: string;
  name: string;
  voiceId: string;
  previewUrl?: string;
  category?: string;
  tags: string[];
}

const PICKER_FILTERS = [
  { id: "all", label: "Alle" },
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
  { id: "narrator", label: "Erzaehler" },
  { id: "character", label: "Charakter" },
  { id: "child", label: "Kind" },
  { id: "maennlich", label: "Maennlich" },
  { id: "weiblich", label: "Weiblich" },
];

function matchesVoiceFilter(v: VoiceItem, filterId: string): boolean {
  if (filterId === "de") return v.tags.some((t) => ["de", "deutsch"].includes(t.toLowerCase()));
  if (filterId === "en") return v.tags.some((t) => ["en", "englisch"].includes(t.toLowerCase()));
  return v.category === filterId || v.tags.some((t) => t.toLowerCase() === filterId.toLowerCase());
}

function VoicePickerGrid({ onSelect, blobProxy }: { onSelect: (voiceId: string, previewUrl?: string) => void; blobProxy: (u: string) => string }) {
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  const [testAudio, setTestAudio] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/studio/voices")
      .then((r) => r.json())
      .then((d) => setVoices(d.voices || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleFilter = (id: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (id === "all") return new Set();
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = activeFilters.size === 0
    ? voices
    : voices.filter((v) => Array.from(activeFilters).every((f) => matchesVoiceFilter(v, f)));

  const testVoice = async (voice: VoiceItem) => {
    if (testAudio[voice.voiceId]) return;
    setTestingVoice(voice.voiceId);
    try {
      const res = await fetch("/api/studio/voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.voiceId, emotion: "neutral" }),
      });
      const data = await res.json();
      if (data.audioUrl) setTestAudio((prev) => ({ ...prev, [voice.voiceId]: data.audioUrl }));
    } catch { /* */ }
    setTestingVoice(null);
  };

  const resolveUrl = (url: string) =>
    url.includes(".blob.vercel-storage.com") ? blobProxy(url) : url;

  if (loading) return <div className="flex justify-center py-8"><div className="w-4 h-4 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin" /></div>;

  if (voices.length === 0) return <p className="text-center text-white/30 text-sm py-8">Keine Stimmen. Importiere zuerst Stimmen in der Library.</p>;

  return (
    <div>
      {/* Multi-Filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {PICKER_FILTERS.map((f) => {
          const isActive = f.id === "all" ? activeFilters.size === 0 : activeFilters.has(f.id);
          const count = f.id === "all" ? voices.length : voices.filter((v) => matchesVoiceFilter(v, f.id)).length;
          return (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] transition-all ${
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
          <span className="text-[9px] text-white/20 self-center">{filtered.length} Ergebnisse</span>
        )}
      </div>

      {/* Voice Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
        {filtered.map((voice) => {
          const audioUrl = testAudio[voice.voiceId] || voice.previewUrl;
          return (
            <div key={voice.id} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:border-[#d4a853]/30 transition-all">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-[#f5eed6]">{voice.name}</p>
                <button
                  onClick={() => onSelect(voice.voiceId, voice.previewUrl)}
                  className="text-[9px] px-2.5 py-1 bg-[#d4a853]/20 text-[#d4a853] rounded-lg hover:bg-[#d4a853]/30 font-medium flex-shrink-0"
                >
                  Waehlen
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {voice.category && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300/50">{voice.category}</span>}
                {voice.tags.map((t) => (
                  <span key={t} className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/25">{t}</span>
                ))}
              </div>
              {audioUrl ? (
                <audio controls src={resolveUrl(audioUrl)} className="w-full h-7" />
              ) : (
                <button
                  onClick={() => testVoice(voice)}
                  disabled={testingVoice !== null}
                  className="w-full text-[10px] py-1.5 bg-purple-500/10 text-purple-300/50 rounded-lg hover:text-purple-300 disabled:opacity-30"
                >
                  {testingVoice === voice.voiceId ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="w-2.5 h-2.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      Generiert...
                    </span>
                  ) : "Anhoeren"}
              </button>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

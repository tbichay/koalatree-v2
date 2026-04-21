"use client";

/**
 * Neue Show — 2-Schritt-Flow
 *
 * Step 1: Admin schreibt Beschreibung. Zwei Cast-Modi:
 *   - "Claude waehlen lassen" (autoCast=true): Admin pickert nix,
 *     Claude schlaegt 2-4 Actors aus dem ganzen Pool vor — mit
 *     Reasoning pro Actor (existierende Beziehungen bevorzugt).
 *   - "Cast selbst waehlen" (Manual): klassischer Multi-Actor-Picker,
 *     Claude baut Draft um diese Actors herum.
 * Step 2: Draft-Preview mit allen Feldern editierbar → Save erstellt die
 *         Show (inkl. Cast + Foki) und redirectet auf /studio/shows/[slug].
 *         Auto-gewaehlte Actors koennen individuell rausgeworfen werden.
 *
 * Die Bootstrap-Antwort ist nur ein Vorschlag — alles kann vor dem Save
 * überschrieben werden. Suggested-Foki werden als Checkboxes angezeigt.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Actor {
  id: string;
  displayName: string;
  emoji: string | null;
  species: string | null;
  role: string | null;
  expertise: string[];
  defaultTone: string | null;
  ownerUserId: string | null;
  // Portrait-Quelle: Actor.portraitUrl zuerst (legacy Shows-Actors wie Koda),
  // dann characterSheet.front (migriert aus DigitalActor), dann portraitAssetId
  // wenn's eine direkte URL ist. Alle optional.
  portraitUrl: string | null;
  characterSheet: { front?: string; profile?: string; fullBody?: string } | null;
  portraitAssetId: string | null;
  // Completeness-Check (Phase 3.6): Actor ist "incomplete" wenn Voice oder
  // Persona fehlen. Der Inline-Create-Flow setzt voiceId="PENDING" als
  // Platzhalter — die Shows-Pipeline filtert solche Actors naturgemaess raus,
  // aber wir warnen im Cast-Picker bevor Admin die Show baut.
  voiceId: string;
  persona: string;
}

function resolveActorPortrait(a: Pick<Actor, "portraitUrl" | "characterSheet" | "portraitAssetId">): string | null {
  if (a.portraitUrl) return a.portraitUrl;
  if (a.characterSheet?.front) return a.characterSheet.front;
  if (a.portraitAssetId?.startsWith("http")) return a.portraitAssetId;
  return null;
}

function isActorIncomplete(a: Pick<Actor, "voiceId" | "persona">): boolean {
  const voiceOk = !!a.voiceId && a.voiceId !== "PENDING";
  const personaOk = !!a.persona && !a.persona.includes("wird auf der Edit-Seite gefuellt");
  return !voiceOk || !personaOk;
}

interface FokusTemplate {
  id: string;
  displayName: string;
  emoji: string | null;
  description: string | null;
  minAlter: number;
  maxAlter: number;
  supportedCategories: string[];
}

interface Draft {
  title: string;
  subtitle: string;
  description: string;
  category: string;
  ageBand: string | null;
  brandVoice: string;
  palette: { bg: string; ink: string; accent: string };
  suggestedFokusTemplateIds: string[];
  suggestedCastRoles: Array<{ actorId: string; role: string; reasoning: string }>;
  notesForAdmin: string;
}

const AGE_BANDS = ["3-5", "6-8", "9-12", "13+"];
const CATEGORIES = [
  { id: "kids", label: "Kids" },
  { id: "wellness", label: "Wellness" },
  { id: "knowledge", label: "Knowledge" },
  { id: "other", label: "Other" },
];

export default function NewShowPage() {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "draft">("input");

  // Step 1 state
  const [actors, setActors] = useState<Actor[]>([]);
  const [templates, setTemplates] = useState<FokusTemplate[]>([]);
  const [beschreibung, setBeschreibung] = useState("");
  // Cast-Mode: "auto" = Claude waehlt aus dem Pool, "manual" = Admin
  // pickert selbst. Default "auto" — Wizard-Flow ist der neue Haupt-Pfad
  // (Admin muss das Ensemble nicht auswendig kennen, um eine Show zu
  // entwerfen).
  const [castMode, setCastMode] = useState<"auto" | "manual">("auto");
  const [selectedActorIds, setSelectedActorIds] = useState<string[]>([]);
  const [category, setCategory] = useState("kids");
  const [ageBand, setAgeBand] = useState<string>("6-8");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedFokusIds, setSelectedFokusIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // "Gleich Trailer?" default ON — billig und macht die Show im
  // Studio-Katalog sofort horchbar. Fehler bei der Trailer-Generation
  // brechen den Redirect NICHT ab; wir landen trotzdem auf der Detail-
  // Seite und Admin kann dort manuell nachholen.
  const [generateTrailer, setGenerateTrailer] = useState(true);
  const [savePhase, setSavePhase] = useState<"idle" | "creating" | "trailer">("idle");

  // Inline Actor-Create (Phase 3.4): schnelles Erstellen ohne Wizard zu verlassen.
  // Minimales Pflicht-Set: Name. Voice/Persona kann leer bleiben — Actor wird
  // angelegt und Admin editiert anschliessend auf /studio/shows/actors/[id].
  const [showCreateActor, setShowCreateActor] = useState(false);
  const [newActorName, setNewActorName] = useState("");
  const [newActorEmoji, setNewActorEmoji] = useState("");
  const [newActorDesc, setNewActorDesc] = useState("");
  const [creatingActor, setCreatingActor] = useState(false);
  const [newActorError, setNewActorError] = useState<string | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/studio/shows/actors").then((r) => r.json()),
      fetch("/api/studio/shows/fokus-templates").then((r) => r.json()),
    ])
      .then(([a, t]) => {
        setActors(a.actors || []);
        setTemplates(t.templates || []);
      })
      .catch((e) => setError(String(e)));
  }, []);

  function toggleActor(id: string) {
    setSelectedActorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleFokus(id: string) {
    setSelectedFokusIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createInlineActor() {
    const name = newActorName.trim();
    if (!name) {
      setNewActorError("Name fehlt.");
      return;
    }
    setCreatingActor(true);
    setNewActorError(null);
    try {
      // Minimal-Defaults: POST verlangt voiceId + persona. Wir setzen Platzhalter,
      // damit der Actor in Shows-Pipeline noch nicht nutzbar ist (leerer voiceId
      // wird dort gefiltert), aber im Wizard auswaehlbar. Admin editiert danach.
      const res = await fetch("/api/studio/shows/actors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          emoji: newActorEmoji || null,
          description: newActorDesc || null,
          voiceId: "PENDING", // Admin muss auf Edit-Seite echte Voice-ID setzen
          persona: newActorDesc
            ? `${name}: ${newActorDesc}`
            : `${name} — Persona wird auf der Edit-Seite gefuellt.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erstellen fehlgeschlagen");
      const created = data.actor as Actor;
      setActors((prev) => [...prev, created]);
      setSelectedActorIds((prev) => [...prev, created.id]);
      setJustCreatedId(created.id);
      // Reset form
      setNewActorName("");
      setNewActorEmoji("");
      setNewActorDesc("");
      setShowCreateActor(false);
    } catch (e) {
      setNewActorError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingActor(false);
    }
  }

  async function onBootstrap() {
    if (!beschreibung.trim()) return setError("Beschreibung fehlt.");
    if (castMode === "manual" && selectedActorIds.length === 0) {
      return setError("Manueller Modus: mind. einen Actor waehlen.");
    }
    setError(null);
    setBootstrapping(true);
    try {
      const res = await fetch("/api/studio/shows/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          beschreibung,
          actorIds: selectedActorIds,
          autoCast: castMode === "auto",
          category,
          ageBand,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      const returnedDraft = data.draft as Draft;
      setDraft(returnedDraft);
      setSelectedFokusIds(returnedDraft.suggestedFokusTemplateIds || []);
      // autoCast-Mode: Claude hat selbst 2-4 Actor-IDs vorgeschlagen.
      // Die uebernehmen wir als initial selectedActorIds, damit der
      // Save-Flow unveraendert mit dem Array weiterarbeiten kann.
      if (castMode === "auto") {
        const claudePicked = (returnedDraft.suggestedCastRoles ?? [])
          .map((c) => c.actorId)
          .filter((id, i, a) => a.indexOf(id) === i); // dedupe
        setSelectedActorIds(claudePicked);
      }
      setStep("draft");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBootstrapping(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setSavePhase("creating");
    setError(null);
    try {
      // 1. Create Show
      const createRes = await fetch("/api/studio/shows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          category: draft.category,
          ageBand: draft.ageBand,
          brandVoice: draft.brandVoice,
          palette: draft.palette,
          actorIds: selectedActorIds,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Show-Create fehlgeschlagen");

      const slug = createData.show.slug as string;

      // 2. PATCH subtitle (not in POST body above)
      if (draft.subtitle) {
        await fetch(`/api/studio/shows/${slug}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subtitle: draft.subtitle }),
        });
      }

      // 3. Add selected Foki
      for (const fokusId of selectedFokusIds) {
        // castRoles default: lead = first selected actor
        const defaultCast = {
          lead: selectedActorIds[0] ?? null,
          support: selectedActorIds.slice(1),
        };
        await fetch(`/api/studio/shows/${slug}/foki`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fokusTemplateId: fokusId,
            castRoles: defaultCast,
          }),
        });
      }

      // 4. Assign roles per suggestedCastRoles (PATCH cast)
      if (draft.suggestedCastRoles && draft.suggestedCastRoles.length > 0) {
        await fetch(`/api/studio/shows/${slug}/cast`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cast: selectedActorIds.map((actorId, idx) => {
              const hint = draft.suggestedCastRoles.find((c) => c.actorId === actorId);
              return { actorId, role: hint?.role ?? null, orderIndex: idx };
            }),
          }),
        });
      }

      // 5. Optional: Trailer generieren (15-40s blockierend).
      //    Fehler hier werden *nicht* fatal — wir redirecten trotzdem,
      //    damit der Admin die Show sieht. Im BrandTab kann er den
      //    Trailer dann manuell nachholen.
      if (generateTrailer) {
        setSavePhase("trailer");
        try {
          const trailerRes = await fetch(`/api/studio/shows/${slug}/trailer`, {
            method: "POST",
          });
          if (!trailerRes.ok) {
            const trailerData = await trailerRes.json().catch(() => ({}));
            console.warn("[wizard] trailer failed:", trailerData.error || trailerRes.status);
          }
        } catch (trailerErr) {
          console.warn("[wizard] trailer network error:", trailerErr);
        }
      }

      router.push(`/studio/shows/${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      setSavePhase("idle");
    }
  }

  if (step === "input") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/studio/shows" className="text-white/40 hover:text-white/70 text-xs">
            ← Shows
          </Link>
          <h1 className="text-xl font-bold text-[#f5eed6] mt-2">Neue Show</h1>
          <p className="text-sm text-white/40">
            Beschreibe deine Show in ein paar Sätzen. Claude generiert dann Titel, Prompt, Palette und passende Fokus-Vorschläge.
          </p>
        </div>

        <div className="space-y-6">
          {/* Beschreibung */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">
              Beschreibung *
            </label>
            <textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={8}
              placeholder="Beispiel: Eine Wellness-Show für Erwachsene, moderiert von Luna. Fokus auf Stressabbau, Traumreisen und sanfte Meditationen. Stimmung ruhig, warm, professionell-liebevoll. Koda kann als gelegentlicher Gast weise Reflexionen einbringen."
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-4 py-3 text-sm text-white/90 placeholder-white/20 focus:border-[#C8A97E]/50 focus:outline-none resize-y"
            />
          </div>

          {/* Category + AgeBand */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">Kategorie</label>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition ${
                      category === c.id
                        ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                        : "bg-white/5 text-white/40 hover:text-white/70"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">AgeBand</label>
              <div className="flex gap-1.5 flex-wrap">
                {AGE_BANDS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAgeBand(a)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition ${
                      ageBand === a
                        ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                        : "bg-white/5 text-white/40 hover:text-white/70"
                    }`}
                  >
                    {a}
                  </button>
                ))}
                <button
                  onClick={() => setAgeBand("")}
                  className={`px-3 py-1.5 rounded-lg text-xs transition ${
                    ageBand === ""
                      ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium"
                      : "bg-white/5 text-white/40 hover:text-white/70"
                  }`}
                >
                  —
                </button>
              </div>
            </div>
          </div>

          {/* Cast-Mode Toggle */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">Cast</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCastMode("auto")}
                className={`text-left rounded-lg border p-3 transition ${
                  castMode === "auto"
                    ? "border-[#C8A97E] bg-[#C8A97E]/10"
                    : "border-white/10 bg-[#1A1A1A] hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">🎯</span>
                  <span className="text-[#f5eed6] text-sm font-medium">Claude waehlen lassen</span>
                </div>
                <div className="text-[10px] text-white/50">
                  2-4 passende Actors aus dem Pool — mit Reasoning pro Actor.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCastMode("manual")}
                className={`text-left rounded-lg border p-3 transition ${
                  castMode === "manual"
                    ? "border-[#C8A97E] bg-[#C8A97E]/10"
                    : "border-white/10 bg-[#1A1A1A] hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">👤</span>
                  <span className="text-[#f5eed6] text-sm font-medium">Cast selbst waehlen</span>
                </div>
                <div className="text-[10px] text-white/50">
                  Ich weiss schon, wen ich dabei haben will.
                </div>
              </button>
            </div>
          </div>

          {/* Actor-Picker nur im Manual-Mode */}
          {castMode === "manual" && (
            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">
                Actors * ({selectedActorIds.length} gewaehlt)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {actors.map((actor) => {
                  const selected = selectedActorIds.includes(actor.id);
                  const portrait = resolveActorPortrait(actor);
                  const incomplete = isActorIncomplete(actor);
                  return (
                    <button
                      key={actor.id}
                      onClick={() => toggleActor(actor.id)}
                      className={`text-left rounded-lg border p-3 transition ${
                        selected
                          ? "border-[#C8A97E] bg-[#C8A97E]/10"
                          : "border-white/10 bg-[#1A1A1A] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {portrait ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={portrait}
                            alt={actor.displayName}
                            className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-lg shrink-0">
                            {actor.emoji ?? "•"}
                          </span>
                        )}
                        <span className="text-[#f5eed6] font-medium text-sm truncate">{actor.displayName}</span>
                        {incomplete && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-200/80 shrink-0"
                            title="Voice oder Persona fehlt — bitte auf der Edit-Seite ergänzen, bevor diese Show generiert wird."
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/50">{actor.role ?? actor.species ?? "—"}</div>
                      <div className="text-[9px] text-white/40 mt-1 line-clamp-1">
                        {actor.expertise.slice(0, 3).join(" · ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button
            onClick={onBootstrap}
            disabled={
              bootstrapping ||
              !beschreibung.trim() ||
              (castMode === "manual" && selectedActorIds.length === 0)
            }
            className="w-full px-5 py-3 rounded-lg bg-[#C8A97E] text-[#141414] font-medium hover:bg-[#d4b88c] disabled:opacity-50 transition"
          >
            {bootstrapping
              ? "Claude generiert Draft…"
              : castMode === "auto"
              ? "Claude soll Cast + Draft waehlen"
              : "Draft generieren"}
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Draft preview
  if (!draft) return null;
  const selectedActors = actors.filter((a) => selectedActorIds.includes(a.id));

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <button
          onClick={() => setStep("input")}
          className="text-white/40 hover:text-white/70 text-xs"
        >
          ← Beschreibung ändern
        </button>
        <h1 className="text-xl font-bold text-[#f5eed6] mt-2">Draft prüfen</h1>
        <p className="text-sm text-white/40">
          Alle Felder sind editierbar. Was du hier speicherst, kann später auf der Detail-Seite weiter fine-tuned werden.
        </p>
      </div>

      {draft.notesForAdmin && (
        <div className="mb-6 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-xs text-yellow-200/80">💡 {draft.notesForAdmin}</p>
        </div>
      )}

      <div className="space-y-5">
        <DraftField
          label="Titel"
          value={draft.title}
          onChange={(v) => setDraft({ ...draft, title: v })}
        />
        <DraftField
          label="Untertitel"
          value={draft.subtitle}
          onChange={(v) => setDraft({ ...draft, subtitle: v })}
        />
        <DraftField
          label="Beschreibung"
          value={draft.description}
          onChange={(v) => setDraft({ ...draft, description: v })}
          multiline
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">Kategorie</label>
            <div className="text-sm text-[#f5eed6] px-3 py-2 bg-[#1A1A1A] rounded-lg border border-white/10 capitalize">
              {draft.category}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">AgeBand</label>
            <div className="text-sm text-[#f5eed6] px-3 py-2 bg-[#1A1A1A] rounded-lg border border-white/10">
              {draft.ageBand ?? "—"}
            </div>
          </div>
        </div>

        <DraftField
          label="Brand-Voice (Prompt-Overlay)"
          value={draft.brandVoice}
          onChange={(v) => setDraft({ ...draft, brandVoice: v })}
          multiline
          hint="Wird bei jeder Generation zusätzlich zum Fokus-Skeleton injiziert."
        />

        {/* Palette */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-2">Palette</label>
          <div className="flex items-center gap-3">
            {(["bg", "ink", "accent"] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.palette[key]}
                  onChange={(e) => setDraft({ ...draft, palette: { ...draft.palette, [key]: e.target.value } })}
                  className="w-8 h-8 rounded cursor-pointer border border-white/10"
                />
                <span className="text-[10px] text-white/50 uppercase">{key}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cast Roles — im autoCast-Mode kann man Vorschlaege wegwerfen
            oder weitere Actors nachtraeglich ergaenzen. */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-white/60">
              Cast-Rollen ({selectedActorIds.length})
            </label>
            {castMode === "auto" && (
              <span className="text-[9px] text-yellow-300/80">★ von Claude vorgeschlagen</span>
            )}
          </div>
          <div className="space-y-2">
            {selectedActors.length === 0 && (
              <p className="text-[11px] text-white/40 italic">Kein Cast ausgewaehlt.</p>
            )}
            {selectedActors.map((actor) => {
              const hint = draft.suggestedCastRoles.find((c) => c.actorId === actor.id);
              const portrait = resolveActorPortrait(actor);
              const incomplete = isActorIncomplete(actor);
              return (
                <div
                  key={actor.id}
                  className={`flex items-start gap-3 text-sm p-2.5 rounded-lg border ${
                    incomplete
                      ? "bg-yellow-500/5 border-yellow-500/30"
                      : "bg-[#1A1A1A] border-white/10"
                  }`}
                >
                  {portrait ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portrait}
                      alt={actor.displayName}
                      className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-lg shrink-0">
                      {actor.emoji ?? "•"}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#f5eed6] font-medium">{actor.displayName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                        {hint?.role ?? "—"}
                      </span>
                      {incomplete && (
                        <Link
                          href={`/studio/shows/actors/${actor.id}`}
                          target="_blank"
                          className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-200/90 hover:bg-yellow-500/30"
                          title="Voice oder Persona fehlt — zum Ergänzen klicken (öffnet Edit in neuem Tab)"
                        >
                          ⚠ unvollständig
                        </Link>
                      )}
                    </div>
                    {hint?.reasoning && (
                      <p className="text-[11px] text-white/50 mt-1">{hint.reasoning}</p>
                    )}
                    {incomplete && !hint?.reasoning && (
                      <p className="text-[11px] text-yellow-200/70 mt-1">
                        Voice und/oder Persona fehlen — die Shows-Pipeline filtert solche Actors aus der Generierung. Bitte ergänzen.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActor(actor.id)}
                    className="text-[11px] px-2 py-1 rounded text-white/50 hover:text-red-300 hover:bg-red-500/10 transition shrink-0"
                    title="Actor aus Cast entfernen"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Inline Actor-Create (Phase 3.4) — fuer Admins die einen brandneuen
              Actor brauchen, ohne den Wizard zu verlassen. Minimaler Form:
              nur Name + Emoji + Kurzbeschreibung. Voice/Persona/Portrait muss
              danach auf der Edit-Seite ergaenzt werden. */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateActor((v) => !v)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-[#C8A97E]/10 text-[#C8A97E] hover:bg-[#C8A97E]/20 transition"
            >
              {showCreateActor ? "− Abbrechen" : "+ Neuer Actor"}
            </button>
            {justCreatedId && (
              <Link
                href={`/studio/shows/actors/${justCreatedId}`}
                target="_blank"
                className="text-[11px] text-[#C8A97E] hover:underline"
              >
                ✎ „{actors.find((a) => a.id === justCreatedId)?.displayName ?? "Neu"}“ vollständig einrichten (Voice, Persona, Portrait) →
              </Link>
            )}
          </div>

          {showCreateActor && (
            <div className="mt-2 p-3 rounded-lg bg-[#1A1A1A] border border-[#C8A97E]/30 space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={newActorEmoji}
                    onChange={(e) => setNewActorEmoji(e.target.value)}
                    maxLength={2}
                    placeholder="🐨"
                    className="w-14 bg-[#141414] border border-white/10 rounded-lg px-2 py-1.5 text-center text-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newActorName}
                    onChange={(e) => setNewActorName(e.target.value)}
                    placeholder="z.B. Maya"
                    className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-white/50 mb-1">Kurz-Beschreibung (optional)</label>
                <input
                  type="text"
                  value={newActorDesc}
                  onChange={(e) => setNewActorDesc(e.target.value)}
                  placeholder="z.B. mutiger Fuchs aus dem Nordwald"
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none"
                />
              </div>
              {newActorError && (
                <div className="text-[11px] text-red-300">{newActorError}</div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={createInlineActor}
                  disabled={creatingActor || !newActorName.trim()}
                  className="px-3 py-1.5 rounded-lg bg-[#C8A97E] text-[#141414] text-xs font-medium hover:bg-[#d4b88c] disabled:opacity-50"
                >
                  {creatingActor ? "Erstellt…" : "Actor erstellen"}
                </button>
                <span className="text-[10px] text-white/40">
                  Voice, Persona &amp; Portrait fehlen noch — auf der Edit-Seite ergänzen.
                </span>
              </div>
            </div>
          )}

          {/* Actor-Adder — wenn autoCast zu wenig gewaehlt hat oder der
              Admin nachtraeglich jemanden dazu will. Nur die *nicht* schon
              gewaehlten Actors zeigen. */}
          {actors.filter((a) => !selectedActorIds.includes(a.id)).length > 0 && (
            <details className="mt-3 rounded-lg border border-white/10 bg-[#1A1A1A] p-3">
              <summary className="cursor-pointer text-[11px] text-white/50 hover:text-white/80">
                Actor hinzufuegen
              </summary>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                {actors
                  .filter((a) => !selectedActorIds.includes(a.id))
                  .map((actor) => {
                    const portrait = resolveActorPortrait(actor);
                    const incomplete = isActorIncomplete(actor);
                    return (
                    <button
                      key={actor.id}
                      type="button"
                      onClick={() => toggleActor(actor.id)}
                      className="text-left rounded-lg border border-white/10 p-2 hover:border-[#C8A97E]/60 transition"
                    >
                      <div className="flex items-center gap-1.5">
                        {portrait ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={portrait}
                            alt={actor.displayName}
                            className="w-6 h-6 rounded-full object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <span className="text-sm">{actor.emoji ?? "•"}</span>
                        )}
                        <span className="text-[#f5eed6] text-xs truncate">{actor.displayName}</span>
                        {incomplete && (
                          <span
                            className="text-[9px] text-yellow-300/80 shrink-0"
                            title="Voice/Persona fehlt"
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-white/40 mt-1 line-clamp-1">
                        {actor.role ?? actor.species ?? "—"}
                      </div>
                    </button>
                    );
                  })}
              </div>
            </details>
          )}
        </div>

        {/* Foki-Auswahl */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-2">
            Foki ({selectedFokusIds.length} aktiv)
          </label>
          <p className="text-[10px] text-white/40 mb-3">
            Von Claude vorgeschlagen sind vorausgewählt. Anpassbar.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((tpl) => {
              const selected = selectedFokusIds.includes(tpl.id);
              const suggested = draft.suggestedFokusTemplateIds.includes(tpl.id);
              return (
                <button
                  key={tpl.id}
                  onClick={() => toggleFokus(tpl.id)}
                  className={`text-left rounded-lg border p-2.5 transition ${
                    selected
                      ? "border-[#C8A97E] bg-[#C8A97E]/10"
                      : "border-white/10 bg-[#1A1A1A] hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{tpl.emoji}</span>
                    <span className="text-[#f5eed6] text-xs font-medium">{tpl.displayName}</span>
                    {suggested && <span className="text-[8px] text-yellow-300">★ empfohlen</span>}
                  </div>
                  <div className="text-[9px] text-white/40 line-clamp-2">{tpl.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trailer-Option */}
        <label className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/10 cursor-pointer hover:bg-white/[0.05]">
          <input
            type="checkbox"
            checked={generateTrailer}
            onChange={(e) => setGenerateTrailer(e.target.checked)}
            disabled={saving}
            className="mt-0.5 accent-[#C8A97E]"
          />
          <div>
            <div className="text-xs font-medium text-[#f5eed6]">
              Direkt Trailer generieren
            </div>
            <div className="text-[11px] text-white/50 mt-0.5">
              Claude schreibt ~20s Teaser-Script, ElevenLabs synthetisiert mit den Cast-Stimmen. Dauert 15-40s extra, kann im Brand-Tab spaeter nachgeholt/ersetzt werden.
            </div>
          </div>
        </label>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-4 border-t border-white/10">
          <button
            onClick={() => setStep("input")}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            Zurück
          </button>
          <button
            onClick={onSave}
            disabled={
              saving ||
              !draft.title ||
              selectedFokusIds.length === 0 ||
              selectedActorIds.length === 0
            }
            title={
              selectedActorIds.length === 0
                ? "Mindestens einen Actor im Cast lassen oder hinzufuegen"
                : selectedFokusIds.length === 0
                ? "Mindestens einen Fokus auswaehlen"
                : undefined
            }
            className="flex-1 px-5 py-2.5 rounded-lg bg-[#C8A97E] text-[#141414] font-medium text-sm hover:bg-[#d4b88c] disabled:opacity-50"
          >
            {savePhase === "creating"
              ? "Show wird angelegt…"
              : savePhase === "trailer"
              ? "Trailer wird generiert…"
              : generateTrailer
              ? "Show anlegen + Trailer"
              : "Show anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftField({
  label,
  value,
  onChange,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-2">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:border-[#C8A97E]/50 focus:outline-none"
        />
      )}
      {hint && <p className="text-[10px] text-white/30 mt-1">{hint}</p>}
    </div>
  );
}

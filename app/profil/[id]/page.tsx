"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { HoererProfil } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import AvatarUpload from "@/app/components/AvatarUpload";
import ProfilForm from "@/app/components/ProfilForm";
import KodaCheckIn from "@/app/components/KodaCheckIn";
import ProfilHistory from "@/app/components/ProfilHistory";
import PageTransition from "@/app/components/PageTransition";
import { berechneAlter } from "@/lib/utils";
import HelpAudio from "@/app/components/HelpAudio";

type Tab = "interessen" | "entwicklung" | "details" | "teilen";

const SICHTBARKEIT_OPTIONS = [
  { key: "interessen", label: "Interessen", emoji: "⭐" },
  { key: "charaktereigenschaften", label: "Eigenschaften", emoji: "💪" },
  { key: "herausforderungen", label: "Aktuelle Themen", emoji: "🌱" },
  { key: "tags", label: "Sonstige Tags", emoji: "🏷️" },
];

interface Einladung {
  id: string;
  eingeladenEmail: string;
  status: string;
  sichtbarkeit: string[];
  createdAt: string;
}

interface Zugriff {
  id: string;
  userId: string;
  rolle: string;
  sichtbarkeit: string[];
  createdAt: string;
  user: { name: string | null; email: string };
}

function TeilenTab({ profilId, profilName }: { profilId: string; profilName: string }) {
  const [email, setEmail] = useState("");
  const [sichtbarkeit, setSichtbarkeit] = useState<string[]>(["interessen", "charaktereigenschaften"]);
  const [sending, setSending] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [einladungen, setEinladungen] = useState<Einladung[]>([]);
  const [zugriffe, setZugriffe] = useState<Zugriff[]>([]);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    const [invRes, accRes] = await Promise.all([
      fetch(`/api/profile/${profilId}/invite`),
      fetch(`/api/profile/${profilId}/access`),
    ]);
    if (invRes.ok) setEinladungen(await invRes.json());
    if (accRes.ok) setZugriffe(await accRes.json());
  }, [profilId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvite = async () => {
    if (!email.includes("@")) { setError("Gültige E-Mail eingeben"); return; }
    setSending(true);
    setError(null);
    setShareUrl(null);

    const res = await fetch(`/api/profile/${profilId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sichtbarkeit }),
    });

    const data = await res.json();
    setSending(false);

    if (!res.ok) {
      setError(data.error || "Fehler beim Einladen");
      return;
    }

    setShareUrl(data.url);
    setEmail("");
    await fetchData();
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (accessId: string) => {
    if (!confirm("Zugriff wirklich entziehen?")) return;
    await fetch(`/api/profile/${profilId}/access?accessId=${accessId}`, { method: "DELETE" });
    await fetchData();
  };

  const toggleSichtbarkeit = (key: string) => {
    setSichtbarkeit((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-6">
      {/* Invite Form */}
      <div className="card p-5">
        <h3 className="text-sm font-medium text-[#f5eed6] mb-1 flex items-center gap-2">Profil teilen <HelpAudio clipId="profil-teilen" /></h3>
        <p className="text-xs text-white/40 mb-4">
          Lade jemanden ein, {profilName}s Geschichten anzuhören.
        </p>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="E-Mail-Adresse..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#4a7c59]/50 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />

          {/* Sichtbarkeit */}
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Was darf die Person sehen?</p>
            <div className="flex flex-wrap gap-2">
              {SICHTBARKEIT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => toggleSichtbarkeit(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                    sichtbarkeit.includes(opt.key)
                      ? "bg-[#4a7c59]/30 text-[#a8d5b8] border border-[#4a7c59]/40"
                      : "bg-white/5 text-white/40 border border-white/10"
                  }`}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={handleInvite}
            disabled={sending || !email}
            className="btn-primary text-sm px-5 py-2.5 w-full disabled:opacity-50"
          >
            {sending ? "Wird gesendet..." : "Einladung erstellen"}
          </button>
        </div>

        {/* Share URL */}
        {shareUrl && (
          <div className="mt-4 p-3 bg-[#4a7c59]/10 border border-[#4a7c59]/20 rounded-xl">
            <p className="text-xs text-[#a8d5b8] mb-2">Einladungs-Link erstellt:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 bg-black/20 rounded-lg text-xs text-white/70 font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg bg-[#4a7c59]/30 text-[#a8d5b8] text-xs hover:bg-[#4a7c59]/50 transition-colors shrink-0"
              >
                {copied ? "Kopiert!" : "Kopieren"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Access */}
      {zugriffe.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Personen mit Zugriff</h3>
          <div className="space-y-2">
            {zugriffe.map((z) => (
              <div key={z.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm text-white/70">{z.user.name || z.user.email}</p>
                  <p className="text-[10px] text-white/30">
                    {z.sichtbarkeit.length > 0 ? `Sieht: ${z.sichtbarkeit.join(", ")}` : "Nur Name & Stories"}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(z.id)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                >
                  Entziehen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {einladungen.filter((e) => e.status === "PENDING").length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Offene Einladungen</h3>
          <div className="space-y-2">
            {einladungen.filter((e) => e.status === "PENDING").map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm text-white/50">{e.eingeladenEmail}</p>
                  <p className="text-[10px] text-white/30">
                    Gesendet {new Date(e.createdAt).toLocaleDateString("de-DE")}
                  </p>
                </div>
                <span className="text-[10px] text-amber-400/60 px-2 py-0.5 rounded-full bg-amber-400/10">
                  Ausstehend
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilEditPage() {
  const router = useRouter();
  const params = useParams();
  const profilId = params.id as string;
  const { setActiveProfile, refreshProfiles } = useProfile();

  const [profil, setProfil] = useState<HoererProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("interessen");
  const [showHistory, setShowHistory] = useState(false);

  const fetchProfil = useCallback(async () => {
    const res = await fetch(`/api/profile/${profilId}`);
    if (res.ok) {
      const data = await res.json();
      setProfil(data);
      setActiveProfile(profilId);
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  }, [profilId, setActiveProfile, router]);

  useEffect(() => { fetchProfil(); }, [fetchProfil]);

  const handleCheckInSave = async (updates: Partial<HoererProfil>) => {
    if (!profil) return;
    await fetch(`/api/profile/${profil.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profil, ...updates }),
    });
    await fetchProfil();
    await refreshProfiles();
  };

  const handleFormSave = async (data: HoererProfil) => {
    if (!profil) return;
    await fetch(`/api/profile/${profil.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchProfil();
    await refreshProfiles();
  };

  if (loading || !profil) {
    return (
      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-2xl">
          <div className="h-8 w-40 rounded bg-white/5 shimmer mb-6" />
          <div className="h-64 rounded-xl bg-white/5 shimmer" />
        </div>
      </main>
    );
  }

  const alter = profil.geburtsdatum ? berechneAlter(profil.geburtsdatum) : profil.alter ?? 0;

  const isOwner = !profil.isShared;

  const TABS: { id: Tab; label: string; emoji: string }[] = isOwner
    ? [
        { id: "interessen", label: "Interessen", emoji: "⭐" },
        { id: "entwicklung", label: "Entwicklung", emoji: "🌱" },
        { id: "details", label: "Details", emoji: "📝" },
        { id: "teilen", label: "Teilen", emoji: "🔗" },
      ]
    : [
        { id: "interessen", label: "Übersicht", emoji: "👀" },
      ];

  return (
    <PageTransition>
      <main className="flex-1 flex flex-col items-center px-4 py-6 pb-24 md:pb-6">
        <div className="w-full max-w-2xl">

          {/* Header mit Avatar + Name */}
          <div className="flex items-center gap-4 mb-6">
            {isOwner ? (
              <AvatarUpload
                currentImage={profil.avatarUrl}
                fallback={<span className="text-2xl">{profil.geschlecht === "w" ? "👧" : profil.geschlecht === "m" ? "👦" : alter >= 18 ? "🧑" : "🧒"}</span>}
                size={64}
                onUpload={async (blob) => {
                  const formData = new FormData();
                  formData.append("file", blob, "avatar.png");
                  formData.append("type", "profile");
                  formData.append("id", profil.id);
                  const res = await fetch("/api/avatars/upload", { method: "POST", body: formData });
                  const data = await res.json();
                  if (data.url) {
                    setProfil((p) => p ? { ...p, avatarUrl: data.url + "?t=" + Date.now() } : p);
                    await refreshProfiles();
                  } else {
                    throw new Error(data.error || "Upload fehlgeschlagen");
                  }
                }}
                onRemove={async () => {
                  await fetch("/api/avatars/upload", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "profile", id: profil.id }),
                  });
                  setProfil((p) => p ? { ...p, avatarUrl: undefined } : p);
                  await refreshProfiles();
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#3d6b4a]/40 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                {profil.avatarUrl ? (
                  <img src={profil.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{profil.geschlecht === "w" ? "👧" : profil.geschlecht === "m" ? "👦" : "🧒"}</span>
                )}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-[#f5eed6]">{profil.name}</h1>
              <p className="text-white/50 text-sm">
                {alter > 0 ? `${alter} Jahre` : ""}
                {!isOwner && <span className="ml-2 text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">Geteiltes Profil</span>}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  activeTab === tab.id
                    ? "bg-[#3d6b4a]/40 text-[#a8d5b8] font-medium shadow-sm"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <span className="text-xs">{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "interessen" && isOwner && (
            <KodaCheckIn
              profil={profil}
              reason="stale-profile"
              onSave={handleCheckInSave}
              onDismiss={() => setActiveTab("details")}
            />
          )}

          {/* ZUHOERER: read-only overview */}
          {activeTab === "interessen" && !isOwner && (
            <div className="card p-5">
              <h3 className="text-sm font-medium text-[#f5eed6] mb-4">{profil.name}s Profil</h3>
              <div className="space-y-3">
                {profil.interessen.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Interessen</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profil.interessen.map((t) => (
                        <span key={t} className="px-2.5 py-1 rounded-full bg-[#4a7c59]/20 text-[#a8d5b8] text-xs">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {profil.charaktereigenschaften.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Eigenschaften</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profil.charaktereigenschaften.map((t) => (
                        <span key={t} className="px-2.5 py-1 rounded-full bg-[#4a7c59]/20 text-[#a8d5b8] text-xs">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {profil.interessen.length === 0 && profil.charaktereigenschaften.length === 0 && (
                  <p className="text-sm text-white/40">Keine sichtbaren Informationen.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "entwicklung" && (
            <div className="space-y-4">
              <div className="card p-4">
                <h3 className="text-sm font-medium text-[#f5eed6] mb-3 flex items-center gap-2">
                  <span>🌱</span> Profil-Entwicklung
                </h3>
                <p className="text-sm text-white/50 mb-4">
                  Hier siehst du, wie sich {profil.name}s Interessen und Themen über die Zeit verändert haben.
                </p>
                <button
                  onClick={() => setShowHistory(true)}
                  className="btn-primary text-sm px-5 py-2"
                >
                  Entwicklung anzeigen
                </button>
              </div>

              {/* Aktuelle Tags Übersicht */}
              <div className="card p-4">
                <h3 className="text-sm font-medium text-[#f5eed6] mb-3">Aktuelle Tags</h3>
                <div className="space-y-3">
                  {profil.interessen.length > 0 && (
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Interessen</p>
                      <div className="flex flex-wrap gap-1.5">
                        {profil.interessen.map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full bg-[#4a7c59]/20 text-[#a8d5b8] text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profil.charaktereigenschaften.length > 0 && (
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Eigenschaften</p>
                      <div className="flex flex-wrap gap-1.5">
                        {profil.charaktereigenschaften.map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full bg-[#4a7c59]/20 text-[#a8d5b8] text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(profil.herausforderungen?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Aktuelle Themen</p>
                      <div className="flex flex-wrap gap-1.5">
                        {profil.herausforderungen!.map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full bg-[#4a7c59]/20 text-[#a8d5b8] text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(profil.tags?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Sonstiges</p>
                      <div className="flex flex-wrap gap-1.5">
                        {profil.tags!.map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full bg-[#4a7c59]/20 text-[#a8d5b8] text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profil.interessen.length === 0 && profil.charaktereigenschaften.length === 0 && (
                    <p className="text-sm text-white/40">Noch keine Tags gesetzt. Wechsle zum Tab &quot;Interessen&quot; um loszulegen.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "details" && (
            <div className="space-y-4">
              <ProfilForm onSave={handleFormSave} initial={profil} />
            </div>
          )}

          {activeTab === "teilen" && isOwner && (
            <TeilenTab profilId={profil.id} profilName={profil.name} />
          )}

          {/* Zurück */}
          <div className="mt-8 text-center">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Zurück zur Übersicht
            </button>
          </div>
        </div>
      </main>

      {/* History Modal */}
      {showHistory && (
        <ProfilHistory
          profilId={profil.id}
          profilName={profil.name}
          onClose={() => setShowHistory(false)}
        />
      )}
    </PageTransition>
  );
}

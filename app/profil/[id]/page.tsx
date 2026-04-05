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

type Tab = "interessen" | "entwicklung" | "details";

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

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: "interessen", label: "Interessen", emoji: "⭐" },
    { id: "entwicklung", label: "Entwicklung", emoji: "🌱" },
    { id: "details", label: "Details", emoji: "📝" },
  ];

  return (
    <PageTransition>
      <main className="flex-1 flex flex-col items-center px-4 py-6 pb-24 md:pb-6">
        <div className="w-full max-w-2xl">

          {/* Header mit Avatar + Name */}
          <div className="flex items-center gap-4 mb-6">
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
            <div>
              <h1 className="text-2xl font-bold text-[#f5eed6]">{profil.name}</h1>
              <p className="text-white/50 text-sm">{alter > 0 ? `${alter} Jahre` : ""}</p>
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
          {activeTab === "interessen" && (
            <KodaCheckIn
              profil={profil}
              reason="stale-profile"
              onSave={handleCheckInSave}
              onDismiss={() => setActiveTab("details")}
            />
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

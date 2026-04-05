"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { HoererProfil } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import AvatarUpload from "@/app/components/AvatarUpload";
import ProfilForm from "@/app/components/ProfilForm";
import KodaCheckIn from "@/app/components/KodaCheckIn";
import PageTransition from "@/app/components/PageTransition";
import { berechneAlter } from "@/lib/utils";

export default function ProfilEditPage() {
  const router = useRouter();
  const params = useParams();
  const profilId = params.id as string;
  const { setActiveProfile, refreshProfiles } = useProfile();

  const [profil, setProfil] = useState<HoererProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(true); // Direkt Tags bearbeiten

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
    setShowForm(false);
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
              <p className="text-white/50 text-sm">{alter} Jahre</p>
              <button
                onClick={() => setShowForm(!showForm)}
                className="text-xs text-[#a8d5b8] hover:text-[#c8e5d0] transition-colors mt-1"
              >
                {showForm ? "Abbrechen" : "Name & Geburtsdatum ändern"}
              </button>
            </div>
          </div>

          {/* ProfilForm (Name/Geburtsdatum/Geschlecht) — einklappbar */}
          {showForm && (
            <div className="mb-6">
              <ProfilForm onSave={handleFormSave} initial={profil} />
            </div>
          )}

          {/* KodaCheckIn (Interessen, Traits, Challenges, Tags) — immer sichtbar */}
          {showCheckIn && (
            <KodaCheckIn
              profil={profil}
              reason="stale-profile"
              onSave={handleCheckInSave}
              onDismiss={() => setShowCheckIn(false)}
            />
          )}

          {!showCheckIn && (
            <button
              onClick={() => setShowCheckIn(true)}
              className="btn-primary text-sm px-5 py-2"
            >
              Interessen & Tags bearbeiten
            </button>
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
    </PageTransition>
  );
}

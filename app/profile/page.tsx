"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HoererProfil } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import ProfilCard from "../components/ProfilCard";
import ProfilForm from "../components/ProfilForm";
import ProfilHistory from "../components/ProfilHistory";
import PageTransition from "../components/PageTransition";
import Stars from "../components/Stars";

export default function ProfileManagementPage() {
  const router = useRouter();
  const { setActiveProfile, refreshProfiles } = useProfile();
  const [profiles, setProfiles] = useState<HoererProfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProfil, setEditProfil] = useState<HoererProfil | undefined>();
  const [historyProfil, setHistoryProfil] = useState<HoererProfil | null>(null);

  const fetchProfiles = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.ok) {
      setProfiles(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleSave = async (profil: HoererProfil) => {
    if (editProfil) {
      await fetch(`/api/profile/${editProfil.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profil),
      });
    } else {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profil),
      });
    }
    await fetchProfiles();
    await refreshProfiles();
    setShowForm(false);
    setEditProfil(undefined);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Profil und alle zugehörigen Geschichten wirklich löschen?")) return;
    await fetch(`/api/profile?id=${id}`, { method: "DELETE" });
    await fetchProfiles();
    await refreshProfiles();
  };

  const handleSelect = (profil: HoererProfil) => {
    setActiveProfile(profil.id);
    router.push(`/profil/${profil.id}`);
  };

  const handleEdit = (profil: HoererProfil) => {
    setEditProfil(profil);
    setShowForm(true);
  };

  const handleOpenCheckIn = (profil: HoererProfil) => {
    setActiveProfile(profil.id);
    router.push(`/profil/${profil.id}`);
  };

  if (loading) {
    return (
      <main className="relative flex-1 flex flex-col items-center px-4 py-8">
        <Stars />
        <div className="relative z-10 w-full max-w-2xl">
          <div className="h-8 w-48 rounded bg-white/5 shimmer mb-6" />
          <div className="space-y-3">
            <div className="h-24 rounded-xl bg-white/5 shimmer" />
            <div className="h-24 rounded-xl bg-white/5 shimmer" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <PageTransition>
        <main className="relative flex-1 flex flex-col items-center px-4 py-6 pb-24 md:pb-6">
          <Stars />
          <div className="relative z-10 w-full max-w-2xl">

            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#f5eed6]">Alle Profile</h1>
                <p className="text-white/50 text-sm mt-1">{profiles.length} {profiles.length === 1 ? "Profil" : "Profile"}</p>
              </div>
              <button
                className="btn-primary px-4 py-2 text-sm"
                onClick={() => { setEditProfil(undefined); setShowForm(true); }}
              >
                + Neues Profil
              </button>
            </div>

            {showForm && (
              <div className="mb-6">
                <ProfilForm onSave={handleSave} initial={editProfil} />
                <div className="text-center mt-4">
                  <button
                    className="text-white/60 hover:text-white/80 text-sm transition-colors"
                    onClick={() => { setShowForm(false); setEditProfil(undefined); }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {!showForm && (
              <div className="grid gap-3">
                {profiles.map((p) => (
                  <ProfilCard
                    key={p.id}
                    profil={p}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onHistory={setHistoryProfil}
                    onCheckIn={handleOpenCheckIn}
                  />
                ))}
              </div>
            )}

            {profiles.length === 0 && !showForm && (
              <div className="card p-8 text-center">
                <p className="text-white/50 text-lg mb-2">Noch keine Profile</p>
                <p className="text-white/40 text-sm mb-4">Erstelle ein Profil, damit Koda personalisierte Geschichten erzählen kann.</p>
                <button
                  className="btn-primary px-6 py-2.5 text-sm"
                  onClick={() => setShowForm(true)}
                >
                  Erstes Profil erstellen
                </button>
              </div>
            )}

            <div className="mt-8 text-center">
              <Link
                href="/dashboard"
                className="text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                Zurück zur Übersicht
              </Link>
            </div>
          </div>
        </main>
      </PageTransition>

      {historyProfil && (
        <ProfilHistory
          profilId={historyProfil.id}
          profilName={historyProfil.name}
          onClose={() => setHistoryProfil(null)}
        />
      )}
    </>
  );
}

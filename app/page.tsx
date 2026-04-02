"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { KindProfil } from "@/lib/types";
import Stars from "./components/Stars";
import ProfilForm from "./components/ProfilForm";
import ProfilCard from "./components/ProfilCard";
import Image from "next/image";

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<KindProfil[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.ok) {
      setProfile(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (profil: KindProfil) => {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profil),
    });
    await fetchProfile();
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/profile?id=${id}`, { method: "DELETE" });
    await fetchProfile();
  };

  const handleSelect = (profil: KindProfil) => {
    router.push(`/story?profilId=${profil.id}`);
  };

  if (loading) {
    return (
      <main className="relative flex-1 flex flex-col items-center justify-center">
        <Stars />
        <div className="text-white/40 text-lg">Laden...</div>
      </main>
    );
  }

  return (
    <main className="relative flex-1 flex flex-col items-center min-h-screen">
      {/* Full-bleed hero image as page background top */}
      <div className="absolute inset-0 w-full h-[70vh] z-0">
        <Image
          src="/hero.png"
          alt="KoalaTree — Der magische Eukalyptusbaum"
          fill
          className="object-cover object-top"
          priority
        />
        {/* Smooth gradient fade from hero image into page background */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a2e1a] via-[#1a2e1a]/80 to-transparent" />
      </div>

      {/* Fireflies overlay on everything */}
      <Stars />

      {/* Navigation */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
        <button
          className="text-white/60 hover:text-white/80 text-sm transition-colors backdrop-blur-sm bg-black/10 rounded-full px-3 py-1"
          onClick={() => router.push("/geschichten")}
        >
          Geschichten-Bibliothek
        </button>
        <UserButton />
      </div>

      {/* Title overlay on hero */}
      <div className="relative z-10 w-full text-center pt-[30vh]">
        <h1 className="text-6xl md:text-7xl font-bold mb-3 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
          KoalaTree
        </h1>
        <p className="text-xl md:text-2xl text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
          Dein weiser Freund im magischen Baum
        </p>
      </div>

      {/* Content area — flows seamlessly from hero */}
      <div className="relative z-10 w-full max-w-2xl px-4 pt-12 pb-16">
        <p className="text-center text-white/50 text-sm mb-10">
          Personalisierte Gute-Nacht-Geschichten, erzählt vom weisen Koala Koda
        </p>

        {showForm ? (
          <>
            <ProfilForm onSave={handleSave} />
            <div className="text-center mt-4">
              <button
                className="text-white/40 hover:text-white/60 text-sm transition-colors"
                onClick={() => setShowForm(false)}
              >
                Abbrechen
              </button>
            </div>
          </>
        ) : (
          <>
            {profile.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-white/70 mb-4">
                  Für wen soll Koda heute erzählen?
                </h2>
                <div className="grid gap-3">
                  {profile.map((p) => (
                    <ProfilCard
                      key={p.id}
                      profil={p}
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="text-center">
              <button
                className="btn-primary text-lg px-8 py-3"
                onClick={() => setShowForm(true)}
              >
                {profile.length > 0 ? "Neues Kind vorstellen" : "Los geht's — Stell dein Kind dem Koala vor"}
              </button>
              {profile.length === 0 && (
                <p className="text-white/40 text-sm mt-4">
                  Der weise Koala Koda möchte dein Kind kennenlernen, damit er die perfekte Geschichte erzählen kann.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

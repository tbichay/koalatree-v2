"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HoererProfil } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import Stars from "../components/Stars";
import AudioPlayer from "../components/AudioPlayer";
import ProfilForm from "../components/ProfilForm";
import ProfilCard from "../components/ProfilCard";
import ProfilHistory from "../components/ProfilHistory";
import KodaCheckIn from "../components/KodaCheckIn";
import { SkeletonCard } from "../components/Skeleton";
import PageTransition from "../components/PageTransition";
import { shouldShowCheckIn, CheckInReason } from "@/lib/check-in-triggers";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setActiveProfile } = useProfile();
  const [profile, setProfile] = useState<HoererProfil[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editProfil, setEditProfil] = useState<HoererProfil | undefined>();
  const [loading, setLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [hasOnboardingAudio, setHasOnboardingAudio] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [historyProfil, setHistoryProfil] = useState<HoererProfil | null>(null);
  const [checkInProfil, setCheckInProfil] = useState<{ profil: HoererProfil; reason: CheckInReason } | null>(null);
  const [checkInDismissed, setCheckInDismissed] = useState<Set<string>>(new Set());

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.ok) {
      setProfile(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();

    // Check if onboarding audio exists + admin status
    fetch("/api/admin/onboarding")
      .then((r) => r.json())
      .then((d) => {
        setHasOnboardingAudio(d.hasAudio);
        setIsAdmin(d.isAdmin || false);
      })
      .catch(() => {});

    // Check if user dismissed onboarding
    const dismissed = localStorage.getItem("onboarding-dismissed");
    if (dismissed) setOnboardingDismissed(true);

    // Auto-open form if ?new=1
    if (searchParams.get("new") === "1") {
      setShowForm(true);
      window.history.replaceState(null, "", "/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProfile]);

  // Auto-detect check-in needs when profiles load
  useEffect(() => {
    if (profile.length === 0 || showForm || checkInProfil) return;

    for (const p of profile) {
      if (checkInDismissed.has(p.id)) continue;
      const lastDismissed = localStorage.getItem(`koda-checkin-dismissed-${p.id}`);
      const reason = shouldShowCheckIn(p, lastDismissed);
      if (reason) {
        setCheckInProfil({ profil: p, reason });
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, showForm]);

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
    await fetchProfile();
    setShowForm(false);
    setEditProfil(undefined);
  };

  const handleCheckInSave = async (updates: Partial<HoererProfil>) => {
    if (!checkInProfil) return;
    const p = checkInProfil.profil;

    // Merge updates with existing profile
    await fetch(`/api/profile/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, ...updates }),
    });

    // Store current age bracket
    if (typeof window !== "undefined" && p.geburtsdatum) {
      const { berechneAlter } = await import("@/lib/utils");
      const alter = berechneAlter(p.geburtsdatum);
      const bracket = alter <= 3 ? "0-3" : alter <= 6 ? "4-6" : alter <= 10 ? "7-10" : alter <= 14 ? "11-14" : alter <= 17 ? "15-17" : "18+";
      localStorage.setItem(`koda-bracket-${p.id}`, bracket);
    }

    setCheckInProfil(null);
    await fetchProfile();
  };

  const handleCheckInDismiss = () => {
    if (!checkInProfil) return;
    const id = checkInProfil.profil.id;
    localStorage.setItem(`koda-checkin-dismissed-${id}`, new Date().toISOString());
    setCheckInDismissed((prev) => new Set(prev).add(id));
    setCheckInProfil(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Profil und alle zugehörigen Geschichten wirklich löschen?")) return;
    await fetch(`/api/profile?id=${id}`, { method: "DELETE" });
    await fetchProfile();
  };

  const handleEdit = (profil: HoererProfil) => {
    setEditProfil(profil);
    setShowForm(true);
  };

  const handleSelect = (profil: HoererProfil) => {
    setActiveProfile(profil.id);
    router.push("/story");
  };

  const handleOpenCheckIn = (profil: HoererProfil) => {
    setCheckInProfil({ profil, reason: "stale-profile" });
  };

  if (loading) {
    return (
      <main className="relative flex-1 flex flex-col items-center px-4 py-8">
        <Stars />
        <div className="relative z-10 w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="h-8 w-48 mx-auto rounded bg-white/5 shimmer mb-2" />
            <div className="h-4 w-32 mx-auto rounded bg-white/5 shimmer" />
          </div>
          <div className="mb-8 grid gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <PageTransition>
      <main className="relative flex-1 flex flex-col items-center px-4 py-8 pb-24 sm:pb-8">
        <Stars />

        <div className="relative z-10 w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 text-[#f5eed6]">
              Hörer-Profile
            </h1>
            <p className="text-white/50 text-sm">
              Für wen soll Koda heute erzählen?
            </p>
          </div>

          {/* Onboarding Story — Vorstellungsgeschichte */}
          {(hasOnboardingAudio || isAdmin) && !onboardingDismissed && !showForm && (
            <div className="mb-8 p-5 rounded-2xl bg-gradient-to-br from-[#2a4a2a]/60 to-[#1a3a2a]/60 border border-[#4a7c59]/30">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">🐨</div>
                  <div>
                    <h2 className="text-lg font-bold text-[#f5eed6]">
                      Willkommen am KoalaTree!
                    </h2>
                    <p className="text-sm text-white/40">
                      Koda und Kiki stellen sich und ihre Freunde vor
                    </p>
                  </div>
                </div>
                <button
                  className="text-white/20 hover:text-white/40 transition-colors text-xs"
                  onClick={() => {
                    setOnboardingDismissed(true);
                    localStorage.setItem("onboarding-dismissed", "true");
                  }}
                >
                  Ausblenden
                </button>
              </div>
              {hasOnboardingAudio && (
                <AudioPlayer
                  audioUrl="/api/audio/onboarding"
                  title="Willkommen am KoalaTree!"
                />
              )}
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-3">
                    <button
                      className="text-xs px-3 py-1.5 rounded bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30 transition-colors disabled:opacity-50"
                      disabled={regenerating}
                      onClick={async () => {
                        setRegenerating(true);
                        setAdminMessage("Audio wird generiert... das dauert 1-2 Minuten.");
                        try {
                          const res = await fetch("/api/admin/onboarding", { method: "POST" });
                          const data = await res.json();
                          if (res.ok) {
                            setAdminMessage("Fertig! Onboarding-Audio wurde generiert.");
                            setHasOnboardingAudio(true);
                          } else {
                            setAdminMessage(`Fehler: ${data.error}`);
                          }
                        } catch {
                          setAdminMessage("Netzwerk-Fehler");
                        }
                        setRegenerating(false);
                      }}
                    >
                      {regenerating ? "Generiere..." : hasOnboardingAudio ? "Audio neu generieren" : "Audio erstmalig generieren"}
                    </button>
                    <span className="text-[10px] text-white/20">Admin</span>
                  </div>
                  {adminMessage && (
                    <p className="text-xs text-white/40 mt-2 break-all">{adminMessage}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Onboarding wiederherstellen */}
          {hasOnboardingAudio && onboardingDismissed && !showForm && (
            <div className="mb-4 text-center">
              <button
                className="text-xs text-white/20 hover:text-white/40 transition-colors"
                onClick={() => {
                  setOnboardingDismissed(false);
                  localStorage.removeItem("onboarding-dismissed");
                }}
              >
                Vorstellungsgeschichte anzeigen
              </button>
            </div>
          )}

          {showForm ? (
            <>
              <ProfilForm onSave={handleSave} initial={editProfil} />
              <div className="text-center mt-4">
                <button
                  className="text-white/40 hover:text-white/60 text-sm transition-colors"
                  onClick={() => { setShowForm(false); setEditProfil(undefined); }}
                >
                  Abbrechen
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Koda Check-In — replaces the old stale-profile nudge */}
              {checkInProfil && !showForm && (
                <div className="mb-6">
                  <KodaCheckIn
                    profil={checkInProfil.profil}
                    reason={checkInProfil.reason}
                    onSave={handleCheckInSave}
                    onDismiss={handleCheckInDismiss}
                  />
                </div>
              )}

              {profile.length > 0 && (
                <div className="mb-8 grid gap-3">
                  {profile.map((p) => (
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

              <div className="text-center">
                <button
                  className="btn-primary text-lg px-8 py-3"
                  onClick={() => { setEditProfil(undefined); setShowForm(true); }}
                >
                  {profile.length > 0 ? "Neues Profil erstellen" : "Los geht's — Erstelle dein erstes Profil"}
                </button>
                {profile.length === 0 && (
                  <p className="text-white/40 text-sm mt-4">
                    Koda möchte dich kennenlernen, damit er die perfekte Geschichte erzählen kann.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      </PageTransition>

      {/* Profile history modal */}
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

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

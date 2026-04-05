"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HoererProfil, STORY_FORMATE, StoryFormat } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import Stars from "../components/Stars";
import WelcomeStory from "../components/WelcomeStory";
import StoryCard from "../components/StoryCard";
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
  const [recentStories, setRecentStories] = useState<Array<{
    id: string; titel?: string; format: string; audioUrl?: string;
    audioDauerSek?: number; zusammenfassung?: string; createdAt: string;
    timeline?: Array<{ characterId: string; startMs: number; endMs: number }>;
    kindProfil: { name: string; alter: number; geschlecht?: string };
  }>>([]);

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

    // Fetch recent stories
    fetch("/api/geschichten")
      .then((r) => r.json())
      .then((stories) => setRecentStories(stories.slice(0, 6)))
      .catch(() => {});

    // Auto-open form if ?new=1
    if (searchParams.get("new") === "1") {
      setShowForm(true);
      window.history.replaceState(null, "", "/dashboard");
    }

    // Handled in separate effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProfile]);

  // ?edit=ID → ProfilForm (Name/Geburtsdatum)
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && profile.length > 0 && !showForm) {
      const p = profile.find((pr) => pr.id === editId);
      if (p) {
        setEditProfil(p);
        setShowForm(true);
        window.history.replaceState(null, "", "/dashboard");
      }
    }
  }, [profile, searchParams, showForm]);

  // ?checkin=ID → KodaCheckIn (Interessen, Traits, Challenges, Tags)
  useEffect(() => {
    const checkinId = searchParams.get("checkin");
    if (checkinId && profile.length > 0 && !checkInProfil) {
      const p = profile.find((pr) => pr.id === checkinId);
      if (p) {
        setCheckInProfil({ profil: p, reason: "stale-profile" });
        window.history.replaceState(null, "", "/dashboard");
      }
    }
  }, [profile, searchParams, checkInProfil]);

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
      <main className="relative flex-1 flex flex-col items-center px-4 py-6 pb-24 md:pb-6">
        <Stars />

        <div className="relative z-10 w-full max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#f5eed6]">
              {profile.length === 0 ? "Willkommen bei KoalaTree!" : "Start"}
            </h1>
            {profile.length > 0 && (
              <p className="text-white/60 text-sm mt-1">
                Für wen soll Koda heute erzählen?
              </p>
            )}
          </div>

          {/* Onboarding Story — Vorstellungsgeschichte mit Visual Player */}
          {(hasOnboardingAudio || isAdmin) && !onboardingDismissed && !showForm && (
            <WelcomeStory
              isFirstTime={profile.length === 0}
              isAdmin={isAdmin}
              hasAudio={hasOnboardingAudio}
              onDismiss={() => {
                setOnboardingDismissed(true);
                localStorage.setItem("onboarding-dismissed", "true");
              }}
              onSkipToProfile={() => {
                setOnboardingDismissed(true);
                localStorage.setItem("onboarding-dismissed", "true");
                setShowForm(true);
              }}
              onAudioGenerated={() => setHasOnboardingAudio(true)}
            />
          )}

          {/* Onboarding wiederherstellen */}
          {hasOnboardingAudio && onboardingDismissed && !showForm && (
            <div className="mb-4 text-center">
              <button
                className="text-xs text-white/50 hover:text-white/70 transition-colors"
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
                  className="text-white/60 hover:text-white/80 text-sm transition-colors"
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

              <div className="text-center mb-8">
                <button
                  className="btn-primary px-6 py-2.5 text-sm"
                  onClick={() => { setEditProfil(undefined); setShowForm(true); }}
                >
                  {profile.length > 0 ? "Neues Profil" : "Los geht's — Erstelle dein erstes Profil"}
                </button>
                {profile.length === 0 && (
                  <p className="text-white/60 text-sm mt-4">
                    Koda möchte dich kennenlernen, damit er die perfekte Geschichte erzählen kann.
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              {profile.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <Link
                    href="/story"
                    className="card p-4 flex items-center gap-3 hover:border-[#4a7c59]/30"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#4a7c59]/20 flex items-center justify-center text-lg">✨</div>
                    <div>
                      <p className="text-sm font-medium text-[#f5eed6]">Neue Geschichte</p>
                      <p className="text-xs text-white/30">Koda erzählt</p>
                    </div>
                  </Link>
                  <Link
                    href="/geschichten"
                    className="card p-4 flex items-center gap-3 hover:border-[#4a7c59]/30"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#4a7c59]/20 flex items-center justify-center text-lg">📚</div>
                    <div>
                      <p className="text-sm font-medium text-[#f5eed6]">Bibliothek</p>
                      <p className="text-xs text-white/30">{recentStories.length > 0 ? `${recentStories.length}+ Geschichten` : "Alle anhören"}</p>
                    </div>
                  </Link>
                </div>
              )}

              {/* Zuletzt generiert */}
              {recentStories.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-[#f5eed6]">Zuletzt generiert</h2>
                    <Link href="/geschichten" className="text-xs text-[#a8d5b8] hover:text-[#c8e5d0] transition-colors">
                      Alle anzeigen
                    </Link>
                  </div>
                  <div className="space-y-1">
                    {recentStories.slice(0, 4).map((g) => (
                      <StoryCard
                        key={g.id}
                        id={g.id}
                        titel={g.titel}
                        format={g.format}
                        zusammenfassung={g.zusammenfassung}
                        audioDauerSek={g.audioDauerSek}
                        audioUrl={g.audioUrl}
                        timeline={g.timeline}
                        kindName={g.kindProfil.name}
                        createdAt={g.createdAt}
                        onPlay={() => router.push(`/geschichten`)}
                        onAddToQueue={() => {}}
                        onOpenFullView={() => router.push(`/story/result?id=${g.id}`)}
                        onDelete={() => {}}
                      />
                    ))}
                  </div>
                </div>
              )}
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

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KindProfil, StoryConfig } from "@/lib/types";
import Stars from "../components/Stars";
import StoryConfigurator from "../components/StoryConfigurator";

function StoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profilId = searchParams.get("profilId");
  const [profil, setProfil] = useState<KindProfil | null>(null);

  useEffect(() => {
    if (!profilId) {
      router.push("/");
      return;
    }
    fetch(`/api/profile/${profilId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setProfil)
      .catch(() => router.push("/"));
  }, [profilId, router]);

  const handleGenerate = (config: StoryConfig) => {
    sessionStorage.setItem("dreamweaver-config", JSON.stringify(config));
    sessionStorage.setItem("dreamweaver-profilId", profilId!);
    sessionStorage.setItem("dreamweaver-kindName", profil!.name);
    router.push("/story/result");
  };

  if (!profil) return null;

  return (
    <main className="relative flex-1 flex flex-col items-center px-4 py-12">
      <Stars />
      <div className="relative z-10 w-full max-w-2xl">
        <button
          className="text-white/40 hover:text-white/60 text-sm transition-colors mb-6"
          onClick={() => router.push("/")}
        >
          ← Zurück zur Profilauswahl
        </button>
        <StoryConfigurator
          kindProfilId={profil.id}
          kindName={profil.name}
          onGenerate={handleGenerate}
        />
      </div>
    </main>
  );
}

export default function StoryPage() {
  return (
    <Suspense>
      <StoryPageContent />
    </Suspense>
  );
}

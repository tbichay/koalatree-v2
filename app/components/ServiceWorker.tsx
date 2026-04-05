"use client";

import { useEffect, useState } from "react";

export default function ServiceWorker() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for updates every 60 seconds
          setInterval(() => reg.update(), 60 * 1000);

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener("statechange", () => {
              // New version ready — show update banner instead of auto-reload
              if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
                setShowUpdate(true);
              }
            });
          });
        })
        .catch((err) => console.warn("SW registration failed:", err));
    }
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 bg-[#2a4a2a] border border-[#4a7c59]/50 rounded-xl p-4 shadow-lg flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-[#f5eed6]">Neue Version verfügbar</p>
        <p className="text-xs text-white/60 mt-0.5">Aktualisiere für die neueste Version</p>
      </div>
      <button
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#4a7c59] text-[#f5eed6] hover:bg-[#5a8c69] transition-colors shrink-0"
        onClick={() => window.location.reload()}
      >
        Aktualisieren
      </button>
      <button
        className="text-white/30 hover:text-white/50 transition-colors text-lg leading-none"
        onClick={() => setShowUpdate(false)}
        aria-label="Schliessen"
      >
        &times;
      </button>
    </div>
  );
}

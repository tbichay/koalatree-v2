"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export default function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    // Don't show if user dismissed recently
    const dismissed = localStorage.getItem("koalatree-install-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    // Only show on iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // Also show on Android (Chrome has beforeinstallprompt, but we show manual hint too)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      // Small delay so it doesn't flash immediately
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem("koalatree-install-dismissed", Date.now().toString());
  };

  if (!show) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom">
      <div className="max-w-md mx-auto bg-[#1a2e1a] border border-white/15 rounded-2xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 relative">
            <Image src="/icons/icon-192.png" alt="KoalaTree" fill className="object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[#f5eed6] text-sm">KoalaTree installieren</h3>
            <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
              {isIOS ? (
                <>
                  Tippe auf{" "}
                  <span className="inline-flex items-center text-[#a8d5b8]">
                    Teilen
                    <svg className="w-3.5 h-3.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </span>
                  {" "}und dann <span className="text-[#a8d5b8]">&quot;Zum Home-Bildschirm&quot;</span> für Hörspiele im Hintergrund.
                </>
              ) : (
                <>
                  Installiere KoalaTree für Hörspiele im Hintergrund — auch bei gesperrtem Bildschirm.
                </>
              )}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-white/30 hover:text-white/60 transition-colors shrink-0 p-1"
            aria-label="Schließen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

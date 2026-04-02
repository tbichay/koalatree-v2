"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
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
              // New version ready — reload silently
              if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            });
          });
        })
        .catch((err) => console.warn("SW registration failed:", err));
    }
  }, []);

  return null;
}

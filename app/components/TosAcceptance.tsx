"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Speichert die ToS-Akzeptanz nach erfolgreichem Login.
 * Wird in Providers.tsx eingebunden und läuft unsichtbar.
 */
export default function TosAcceptance() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const pending = sessionStorage.getItem("pendingTosAcceptance");
    if (pending) {
      sessionStorage.removeItem("pendingTosAcceptance");
      fetch("/api/account/accept-tos", { method: "POST" }).catch(() => {});
    }
  }, [status]);

  return null;
}

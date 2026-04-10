"use client";

import { useEffect } from "react";

/**
 * Post-auth redirect page.
 *
 * Auth.js sometimes resolves callback URLs against the wrong domain
 * (e.g., redirecting koalatree.io users to koalatree.ai). This page
 * reads the intended destination from sessionStorage and redirects
 * to the correct path on the CURRENT domain.
 */
export default function AuthCompletePage() {
  useEffect(() => {
    const stored = sessionStorage.getItem("authCallbackUrl");
    sessionStorage.removeItem("authCallbackUrl");

    // Determine correct destination
    const isEngine = window.location.hostname.includes("koalatree.io");
    const fallback = isEngine ? "/studio/engine" : "/dashboard";
    const destination = stored || fallback;

    // Redirect to the correct path on the current domain
    window.location.replace(destination);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen" style={{ background: "#141414" }}>
      <div className="text-center">
        <div className="w-5 h-5 border-2 border-[#C8A97E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm" style={{ color: "#8A8A8A" }}>Anmeldung erfolgreich...</p>
      </div>
    </div>
  );
}

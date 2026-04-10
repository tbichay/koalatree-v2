"use client";

import Image from "next/image";
import Link from "next/link";
import Stars from "../../components/Stars";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  const searchParams = useSearchParams();
  // Default callback: /studio/engine on engine domain, /dashboard on kids app
  const isEngine = typeof window !== "undefined" && (
    window.location.hostname.includes("koalatree.io") ||
    new URLSearchParams(window.location.search).get("theme") === "engine"
  );
  const defaultCallback = isEngine ? "/studio/engine" : "/dashboard";
  const callbackUrl = searchParams.get("callbackUrl") ?? defaultCallback;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Prüfen ob User existiert (für ToS-Checkbox)
      setCheckingEmail(true);
      const checkRes = await fetch("/api/account/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { exists, tosAccepted: alreadyAccepted } = await checkRes.json();
      setCheckingEmail(false);

      // Neue User müssen AGB/Datenschutz akzeptieren
      if (!exists && !tosAccepted) {
        setIsNewUser(true);
        setLoading(false);
        return;
      }

      // Bestehende User die schon akzeptiert haben → direkt weiter
      if (exists && alreadyAccepted) {
        setIsNewUser(false);
      }

      const result = await signIn("resend", {
        email,
        redirect: false,
      });

      if (result?.error) {
        setError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
      } else {
        setStep("code");
      }
    } catch {
      setError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
      setCheckingEmail(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Bei neuen Usern: ToS-Akzeptanz nach Login speichern
    if (isNewUser || tosAccepted) {
      sessionStorage.setItem("pendingTosAcceptance", "true");
    }

    // Store the intended destination before auth callback
    // Auth.js might redirect to wrong domain, so we handle it ourselves
    const intendedDestination = callbackUrl;
    sessionStorage.setItem("authCallbackUrl", intendedDestination);

    const params = new URLSearchParams({
      token: code,
      email,
      // Use a relative callback that we control — our own redirect page
      callbackUrl: "/sign-in/complete",
    });
    window.location.href = `/api/auth/callback/resend?${params}`;
  }

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
      <Stars />
      <div className="relative z-10 text-center mb-8">
        <div className="mx-auto mb-4 w-48 h-28 relative">
          <Image src="/api/icons/logo.png" alt="KoalaTree" fill className="object-contain" />
        </div>
        <p className="text-white/60">
          {step === "email"
            ? "Melde dich an, um Geschichten zu hören"
            : `Code gesendet an ${email}`}
        </p>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {step === "email" ? (
          <form onSubmit={handleSendCode} className="card p-8">
            <label htmlFor="email" className="block text-sm text-white/70 mb-2">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // Reset ToS state wenn Email geändert wird
                if (isNewUser) { setIsNewUser(false); setTosAccepted(false); }
              }}
              placeholder="deine@email.de"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.08] border border-white/15 text-[#f5eed6] placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#4a7c59]/50 focus:border-[#4a7c59] transition-colors"
            />

            {/* ToS Checkbox — nur für neue User */}
            {isNewUser && (
              <label className="flex items-start gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tosAccepted}
                  onChange={(e) => setTosAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/[0.08] accent-[#4a7c59]"
                />
                <span className="text-xs text-white/50 leading-relaxed">
                  Ich akzeptiere die{" "}
                  <Link href="/agb" target="_blank" className="text-[#a8d5b8] underline">AGB</Link>
                  {" "}und{" "}
                  <Link href="/datenschutz" target="_blank" className="text-[#a8d5b8] underline">Datenschutzbestimmungen</Link>.
                </span>
              </label>
            )}

            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading || checkingEmail || (isNewUser && !tosAccepted)}
              className="w-full mt-4 py-3 rounded-xl font-semibold text-[#f5eed6] transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #4a7c59, #3d6b4a)",
                boxShadow: "0 4px 16px rgba(61,107,74,0.3)",
              }}
            >
              {checkingEmail ? "Wird geprüft..." : loading ? "Wird gesendet..." : isNewUser && !tosAccepted ? "Bitte AGB akzeptieren" : "Login-Code senden"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="card p-8">
            <label htmlFor="code" className="block text-sm text-white/70 mb-2">
              6-stelliger Code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full px-4 py-4 rounded-xl bg-white/[0.08] border border-white/15 text-[#f5eed6] text-center text-2xl tracking-[0.5em] font-mono placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[#4a7c59]/50 focus:border-[#4a7c59] transition-colors"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full mt-4 py-3 rounded-xl font-semibold text-[#f5eed6] transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #4a7c59, #3d6b4a)",
                boxShadow: "0 4px 16px rgba(61,107,74,0.3)",
              }}
            >
              {loading ? "Wird geprüft..." : "Anmelden"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              className="w-full mt-3 text-[#a8d5b8] text-sm hover:text-[#c8e5d0] transition-colors"
            >
              Anderen Code anfordern
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

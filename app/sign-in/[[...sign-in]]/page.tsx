"use client";

import Image from "next/image";
import Stars from "../../components/Stars";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const isVerify = searchParams.get("verify") === "1";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("resend", {
        email,
        callbackUrl: "/dashboard",
        redirect: false,
      });

      if (result?.error) {
        setError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
      <Stars />
      <div className="relative z-10 text-center mb-8">
        <div className="mx-auto mb-4 w-48 h-28 relative">
          <Image src="/api/icons/logo.png" alt="KoalaTree" fill className="object-contain" />
        </div>
        <p className="text-white/60">
          {isVerify || sent
            ? "Prüfe dein E-Mail-Postfach"
            : "Melde dich an, um Geschichten zu hören"}
        </p>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {sent || isVerify ? (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-4">✉️</div>
            <h2 className="text-lg font-semibold text-[#f5eed6] mb-2">
              Magic Link gesendet!
            </h2>
            <p className="text-white/60 text-sm mb-6">
              Wir haben dir einen Link per E-Mail geschickt. Klicke darauf, um dich anzumelden.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="text-[#a8d5b8] text-sm hover:text-[#c8e5d0] transition-colors"
            >
              Andere E-Mail verwenden
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-8">
            <label htmlFor="email" className="block text-sm text-white/70 mb-2">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deine@email.de"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.08] border border-white/15 text-[#f5eed6] placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#4a7c59]/50 focus:border-[#4a7c59] transition-colors"
            />
            {error && (
              <p className="text-red-400 text-sm mt-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 rounded-xl font-semibold text-[#f5eed6] transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #4a7c59, #3d6b4a)",
                boxShadow: "0 4px 16px rgba(61,107,74,0.3)",
              }}
            >
              {loading ? "Wird gesendet..." : "Magic Link senden"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

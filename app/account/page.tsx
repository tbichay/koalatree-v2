"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import PageTransition from "../components/PageTransition";
import AvatarUpload from "../components/AvatarUpload";

interface AccountData {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  tosAcceptedAt: string | null;
}

export default function AccountPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => {
        setAccount(data);
        setName(data.name || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAccount((prev) => prev ? { ...prev, ...updated } : prev);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: deleteEmail }),
      });
      if (res.ok) {
        signOut({ callbackUrl: "/" });
      } else {
        const data = await res.json();
        setDeleteError(data.error || "Löschen fehlgeschlagen");
      }
    } catch {
      setDeleteError("Netzwerk-Fehler");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-lg space-y-4">
          <div className="h-8 w-32 rounded bg-white/5 shimmer" />
          <div className="card p-6 space-y-4">
            <div className="h-10 rounded bg-white/5 shimmer" />
            <div className="h-10 rounded bg-white/5 shimmer" />
          </div>
        </div>
      </main>
    );
  }

  if (!account) return null;

  const initial = (account.name || account.email).charAt(0).toUpperCase();

  return (
    <PageTransition>
      <main className="flex-1 flex flex-col items-center px-4 py-8 pb-24 sm:pb-8">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold mb-6">Konto</h1>

          {/* Profile Section */}
          <div className="card p-6 mb-4">
            <div className="flex items-center gap-4 mb-6">
              <AvatarUpload
                currentImage={account.image}
                fallback={<span className="text-2xl font-bold">{initial}</span>}
                size={64}
                onUpload={async (blob) => {
                  const formData = new FormData();
                  formData.append("file", blob, "avatar.png");
                  formData.append("type", "user");
                  formData.append("id", account.id);
                  const res = await fetch("/api/avatars/upload", { method: "POST", body: formData });
                  const data = await res.json();
                  if (data.url) setAccount((prev) => prev ? { ...prev, image: data.url } : prev);
                }}
                onRemove={async () => {
                  await fetch("/api/avatars/upload", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "user", id: account.id }),
                  });
                  setAccount((prev) => prev ? { ...prev, image: null } : prev);
                }}
              />
              <div>
                <p className="text-[#f5eed6] font-medium">{account.name || account.email}</p>
                <p className="text-white/60 text-sm">{account.email}</p>
                <p className="text-white/25 text-xs mt-1">
                  Mitglied seit {new Date(account.createdAt).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* Name */}
            <label className="block text-sm text-white/50 mb-1.5">Anzeigename</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dein Name (optional)"
              className="w-full px-4 py-2.5 rounded-xl bg-white/[0.08] border border-white/15 text-[#f5eed6] placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#4a7c59]/50 focus:border-[#4a7c59] transition-colors text-sm"
            />

            {/* Email (read-only) */}
            <label className="block text-sm text-white/50 mb-1.5 mt-4">E-Mail</label>
            <div className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white/60 text-sm">
              {account.email}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary text-sm px-5 py-2 disabled:opacity-50"
              >
                {saving ? "Speichern..." : saveSuccess ? "Gespeichert!" : "Speichern"}
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-white/60 hover:text-white/80 transition-colors"
              >
                Abmelden
              </button>
            </div>
          </div>

          {/* Legal */}
          {account.tosAcceptedAt && (
            <div className="card p-4 mb-4">
              <p className="text-white/30 text-xs">
                AGB und Datenschutzbestimmungen akzeptiert am{" "}
                {new Date(account.tosAcceptedAt).toLocaleDateString("de-DE")}
              </p>
            </div>
          )}

          {/* Danger Zone */}
          <div className="card p-6 border-red-500/20">
            <h3 className="text-red-400 font-medium text-sm mb-2">Gefahrenzone</h3>
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                className="text-sm text-red-400/60 hover:text-red-400 transition-colors"
              >
                Account und alle Daten löschen
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/50">
                  Dies löscht deinen Account, alle Profile, alle Geschichten und alle Audio-Dateien.{" "}
                  <strong className="text-red-400">Das kann nicht rückgängig gemacht werden.</strong>
                </p>
                <label className="block text-sm text-white/50">
                  Gib deine E-Mail-Adresse ein um zu bestätigen:
                </label>
                <input
                  type="email"
                  value={deleteEmail}
                  onChange={(e) => setDeleteEmail(e.target.value)}
                  placeholder={account.email}
                  className="w-full px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-[#f5eed6] placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors text-sm"
                />
                {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting || deleteEmail.toLowerCase() !== account.email.toLowerCase()}
                    className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-30"
                  >
                    {deleting ? "Wird gelöscht..." : "Account endgültig löschen"}
                  </button>
                  <button
                    onClick={() => { setShowDelete(false); setDeleteEmail(""); setDeleteError(""); }}
                    className="text-sm text-white/60 hover:text-white/80 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}

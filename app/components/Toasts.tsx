"use client";

/**
 * KoalaTree Toast Notification System
 *
 * Standard pattern for ALL async/AI operations:
 * 1. toast.loading("Generiere...") → shows spinner
 * 2. toast.update(id, "Frame 3/7...") → updates message
 * 3. toast.success("Fertig!") → green checkmark, auto-dismiss
 * 4. toast.error("Fehler") → red X, stays until dismissed
 *
 * Usage:
 *   import { useToast, ToastContainer } from "@/app/components/Toasts";
 *
 *   function MyComponent() {
 *     const toast = useToast();
 *     const handleClick = async () => {
 *       const id = toast.loading("Generiere Storyboard...");
 *       try {
 *         await doSomething();
 *         toast.success("3 Frames generiert!", id);
 *       } catch (err) {
 *         toast.error("Generierung fehlgeschlagen", id);
 *       }
 *     };
 *   }
 *
 *   // In layout: <ToastContainer />
 */

import { createContext, useContext, useState, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────

type ToastType = "loading" | "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastAPI {
  /** Show loading spinner. Returns toast ID for updates. */
  loading: (message: string) => string;
  /** Show success (auto-dismiss after 4s). Optionally replace existing toast. */
  success: (message: string, replaceId?: string) => string;
  /** Show error (stays until dismissed). Optionally replace existing toast. */
  error: (message: string, replaceId?: string) => string;
  /** Show info (auto-dismiss after 3s). */
  info: (message: string) => string;
  /** Update message of existing toast (keeps type). */
  update: (id: string, message: string) => void;
  /** Dismiss a specific toast. */
  dismiss: (id: string) => void;
}

// ── Context ────────────────────────────────────────────────────

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string, replaceId?: string): string => {
    const id = replaceId || `toast-${++counterRef.current}`;

    setToasts((prev) => {
      // Replace existing toast if replaceId provided
      if (replaceId) {
        return prev.map((t) => (t.id === replaceId ? { ...t, type, message, createdAt: Date.now() } : t));
      }
      // Add new toast (max 5 visible)
      const next = [...prev, { id, type, message, createdAt: Date.now() }];
      return next.slice(-5);
    });

    // Auto-dismiss success/info after delay
    if (type === "success") {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    } else if (type === "info") {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    }

    return id;
  }, []);

  const api: ToastAPI = {
    loading: (msg) => addToast("loading", msg),
    success: (msg, replaceId) => addToast("success", msg, replaceId),
    error: (msg, replaceId) => addToast("error", msg, replaceId),
    info: (msg) => addToast("info", msg),
    update: (id, msg) => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message: msg } : t))),
    dismiss: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast Container — fixed at bottom */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-sm text-[12px] font-medium animate-in slide-in-from-right transition-all ${
                t.type === "loading"
                  ? "bg-[#1a1a1a]/95 border border-white/10 text-white/70"
                  : t.type === "success"
                  ? "bg-[#1a2e1a]/95 border border-[#3d6b4a]/40 text-[#a8d5b8]"
                  : t.type === "error"
                  ? "bg-[#2e1a1a]/95 border border-red-500/30 text-red-300"
                  : "bg-[#1a1a2e]/95 border border-blue-500/20 text-blue-300"
              }`}
            >
              {/* Icon */}
              {t.type === "loading" && (
                <div className="w-4 h-4 border-2 border-[#C8A97E] border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              {t.type === "success" && <span className="shrink-0">✓</span>}
              {t.type === "error" && <span className="shrink-0">✕</span>}
              {t.type === "info" && <span className="shrink-0">ℹ</span>}

              {/* Message */}
              <span className="flex-1">{t.message}</span>

              {/* Dismiss (for errors and loading) */}
              {(t.type === "error" || t.type === "loading") && (
                <button
                  onClick={() => api.dismiss(t.id)}
                  className="text-white/20 hover:text-white/50 text-sm shrink-0 ml-1"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

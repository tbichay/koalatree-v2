"use client";

/**
 * KoalaTree Engine Design System
 *
 * Shared UI components for consistent look across the platform.
 * All components follow the Engine dark theme.
 *
 * Pattern: Sheet-based workflow
 * - Every entity (Actor, Voice, Landscape) uses a Sheet layout
 * - Sheet = left visual + right form fields
 * - Fields are always inline-editable (no separate create/edit mode)
 * - CTAs sit next to the field they affect
 * - Auto-saves or explicit save button at bottom
 */

import { useState, useRef, type ReactNode } from "react";

// ── Section ──────────────────────────────────────────────────────

export function Section({ title, children, action }: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] text-white/30 uppercase tracking-wider">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Field (label + input + optional CTA) ─────────────────────────

export function Field({ label, children, hint, cta }: {
  label: string;
  children: ReactNode;
  hint?: string;
  cta?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-white/40">{label}</label>
        {cta}
      </div>
      {children}
      {hint && <p className="text-[9px] text-white/20 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── TextInput ────────────────────────────────────────────────────

export function TextInput({ value, onChange, placeholder, multiline, disabled }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const cls = "w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#d4a853]/40 disabled:opacity-40 transition-colors";
  if (multiline) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} resize-none`} disabled={disabled} />;
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} disabled={disabled} />;
}

// ── Select ───────────────────────────────────────────────────────

export function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 focus:outline-none focus:border-[#d4a853]/40">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── ButtonGroup (Pixar / Disney / Ghibli style selector) ─────────

export function ButtonGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1 bg-white/5 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-w-[60px] text-center py-1.5 rounded-md text-[10px] transition-all ${
            value === o.value
              ? "bg-[#d4a853]/20 text-[#d4a853] font-medium"
              : "text-white/30 hover:text-white/50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── ActionButton (CTA neben einem Feld) ──────────────────────────

export function ActionButton({ onClick, disabled, loading, children, variant = "primary" }: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const colors = {
    primary: "bg-[#d4a853]/20 text-[#d4a853] hover:bg-[#d4a853]/30",
    secondary: "bg-white/5 text-white/40 hover:text-white/60",
    danger: "bg-red-500/10 text-red-400/50 hover:text-red-400",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-3 py-1.5 rounded-lg text-[10px] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      {loading ? "..." : children}
    </button>
  );
}

// ── AudioPreview (inline player) ─────────────────────────────────

export function AudioPreview({ url, blobProxy, label }: {
  url: string;
  blobProxy?: (u: string) => string;
  label?: string;
}) {
  const src = blobProxy ? blobProxy(url) : url;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[9px] text-white/25">{label}</span>}
      <audio controls src={src} className="h-7 flex-1 opacity-70" />
    </div>
  );
}

// ── ImageSlot (portrait/landscape with hover overlay) ────────────

export function ImageSlot({ src, alt, onGenerate, onUpload, generating, uploading, aspectRatio = "square", blobProxy }: {
  src?: string;
  alt: string;
  onGenerate?: () => void;
  onUpload?: (file: File) => void;
  generating?: boolean;
  uploading?: boolean;
  aspectRatio?: "square" | "portrait" | "landscape";
  blobProxy?: (u: string) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const aspectCls = aspectRatio === "portrait" ? "aspect-[2/3]" : aspectRatio === "landscape" ? "aspect-video" : "aspect-square";
  const resolvedSrc = src && blobProxy ? blobProxy(src) : src;

  return (
    <div className={`relative group rounded-xl overflow-hidden bg-white/5 ${aspectCls}`}>
      {resolvedSrc ? (
        <img src={resolvedSrc} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-white/10 text-2xl">{aspectRatio === "landscape" ? "\uD83C\uDFDE\uFE0F" : "\uD83D\uDC64"}</span>
        </div>
      )}
      {/* Hover overlay with actions */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
        {onGenerate && (
          <button onClick={onGenerate} disabled={generating} className="text-[9px] px-2 py-1 bg-white/20 text-white rounded disabled:opacity-30">
            {generating ? "..." : "AI"}
          </button>
        )}
        {onUpload && (
          <>
            <button onClick={() => inputRef.current?.click()} disabled={uploading} className="text-[9px] px-2 py-1 bg-white/20 text-white rounded disabled:opacity-30">
              {uploading ? "..." : "\uD83D\uDCF7"}
            </button>
            <input ref={inputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} className="hidden" />
          </>
        )}
      </div>
    </div>
  );
}

// ── Card (clickable item in a grid) ──────────────────────────────

export function Card({ children, selected, onClick }: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white/[0.03] border rounded-xl p-3 transition-all cursor-pointer ${
        selected ? "border-[#d4a853]/40 ring-1 ring-[#d4a853]/20" : "border-white/5 hover:border-white/15"
      }`}
    >
      {children}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────

export function Badge({ children, color = "default" }: {
  children: ReactNode;
  color?: "default" | "gold" | "green" | "purple" | "red";
}) {
  const colors = {
    default: "bg-white/5 text-white/30",
    gold: "bg-[#d4a853]/15 text-[#d4a853]/70",
    green: "bg-green-500/15 text-green-400/70",
    purple: "bg-purple-500/15 text-purple-300/70",
    red: "bg-red-500/15 text-red-400/70",
  };
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${colors[color]}`}>{children}</span>
  );
}

// ── EmptyState ───────────────────────────────────────────────────

export function EmptyState({ icon, title, description, action }: {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12">
      <span className="text-4xl block mb-3">{icon}</span>
      <p className="text-sm text-white/40">{title}</p>
      {description && <p className="text-[10px] text-white/20 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Sheet (main layout: visual left + form right) ────────────────

export function Sheet({ visual, children, onClose }: {
  visual?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 sm:p-5 mb-4">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
        {visual && <div className="flex-shrink-0 mx-auto sm:mx-0">{visual}</div>}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
      {onClose && (
        <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
          <button onClick={onClose} className="text-[10px] text-white/30 hover:text-white/50">Schliessen</button>
        </div>
      )}
    </div>
  );
}

// ── Slider ───────────────────────────────────────────────────────

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/25 w-20 flex-shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-[#d4a853]"
      />
      <span className="text-[8px] text-white/20 w-8 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

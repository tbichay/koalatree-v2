"use client";

import Link from "next/link";

export default function PortraitsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#f5eed6] mb-2">🎨 Portraits</h1>
      <p className="text-white/50 text-sm mb-6">Character-Portraits generieren</p>
      <p className="text-white/30 text-sm">Wird bald hierher verschoben. Aktuell noch im alten Studio verfuegbar.</p>
      <Link href="/studio" className="text-xs text-[#a8d5b8] mt-4 inline-block">← Zurueck zum Studio</Link>
    </div>
  );
}

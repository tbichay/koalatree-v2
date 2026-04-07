"use client";

import Link from "next/link";

export default function PlaceholderPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <p className="text-white/30 text-sm">Wird bald hierher verschoben.</p>
      <Link href="/studio" className="text-xs text-[#a8d5b8] mt-4 inline-block">← Zurueck zum Studio</Link>
    </div>
  );
}

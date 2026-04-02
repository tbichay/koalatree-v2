"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Profile", emoji: "👤" },
  { href: "/story", label: "Neue Geschichte", emoji: "✨" },
  { href: "/geschichten", label: "Bibliothek", emoji: "📚" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 w-full bg-[#1a2e1a]/90 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="KoalaTree" height={36} width={120} className="object-contain" />
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  isActive
                    ? "bg-[#3d6b4a]/30 text-[#a8d5b8] font-medium"
                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <span className="sm:hidden">{item.emoji}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* User */}
        <UserButton />
      </div>
    </nav>
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Keep cache short so Studio image changes appear quickly on the website.
    // Images served via /api/images/ proxy can change any time via Studio "Verwenden".
    minimumCacheTTL: 604800, // 1 Woche — Bilder ändern sich selten
  },
};

export default nextConfig;

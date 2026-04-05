"use client";

import { usePathname } from "next/navigation";
import { ProfileProvider } from "@/lib/profile-context";
import NavBar from "./NavBar";
import TosAcceptance from "./TosAcceptance";

// Routes that should NOT show NavBar
const NO_NAV_ROUTES = ["/", "/sign-in", "/sign-up", "/impressum", "/datenschutz", "/agb", "/barrierefreiheit"];

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !NO_NAV_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(route + "/")
  );

  return (
    <ProfileProvider>
      <TosAcceptance />
      {showNav && <NavBar />}
      {children}
    </ProfileProvider>
  );
}

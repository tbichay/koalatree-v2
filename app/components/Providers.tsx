"use client";

import { usePathname } from "next/navigation";
import { ProfileProvider } from "@/lib/profile-context";
import { FullscreenProvider, useFullscreen } from "@/lib/fullscreen-context";
import NavBar from "./NavBar";
import Sidebar from "./Sidebar";
import TosAcceptance from "./TosAcceptance";

const NO_NAV_ROUTES = ["/", "/sign-in", "/sign-up", "/impressum", "/datenschutz", "/agb", "/barrierefreiheit"];

function isShareRoute(pathname: string | null): boolean {
  return !!pathname?.startsWith("/share/");
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isFullscreen } = useFullscreen();

  const showAppChrome = !NO_NAV_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(route + "/")
  ) && !isShareRoute(pathname);

  if (!showAppChrome) {
    return <>{children}</>;
  }

  // Im Fullscreen: kein Nav, kein Sidebar — nur Content
  if (isFullscreen) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <NavBar />
        {children}
      </div>
    </div>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <FullscreenProvider>
        <TosAcceptance />
        <AppLayout>{children}</AppLayout>
      </FullscreenProvider>
    </ProfileProvider>
  );
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/",
  "/sign-in",
  "/sign-up",
  "/impressum",
  "/agb",
  "/datenschutz",
  "/barrierefreiheit",
  "/api/audio/onboarding",
  "/api/images",
  "/api/icons",
  "/api/auth",
];

function isPublic(pathname: string): boolean {
  return publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// Alte Clerk-Cookies aufräumen
const STALE_PREFIXES = ["__clerk", "__client_uat", "clerk_"];

function cleanResponse(request: NextRequest, response: NextResponse): NextResponse {
  for (const cookie of request.cookies.getAll()) {
    if (STALE_PREFIXES.some((p) => cookie.name.startsWith(p)) ||
        cookie.name === "__session" || cookie.name.startsWith("__session_")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }
  return response;
}

export async function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) {
    return cleanResponse(request, NextResponse.next());
  }

  // Session-Cookie prüfen — Auth.js nutzt __Secure- Prefix auf HTTPS
  const hasSession =
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("authjs.session-token");

  if (!hasSession) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return cleanResponse(request, NextResponse.redirect(signInUrl));
  }

  return cleanResponse(request, NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

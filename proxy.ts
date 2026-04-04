import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

export async function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request });
  if (!token) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

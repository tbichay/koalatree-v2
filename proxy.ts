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

// Alte Clerk-Cookies die nach der Migration noch im Browser hängen
const CLERK_COOKIE_PREFIXES = ["__clerk", "__client_uat", "__session", "clerk_"];

function clearClerkCookies(request: NextRequest, response: NextResponse): NextResponse {
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  const clerkCookies = cookieNames.filter((name) =>
    CLERK_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );

  for (const name of clerkCookies) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}

export async function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    return clearClerkCookies(request, response);
  }

  const token = await getToken({ req: request });
  if (!token) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    const response = NextResponse.redirect(signInUrl);
    return clearClerkCookies(request, response);
  }

  const response = NextResponse.next();
  return clearClerkCookies(request, response);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

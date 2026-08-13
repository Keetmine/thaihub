import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Duplicated from lib/auth.ts (kept import-free here) so the admin check
// stays a plain string comparison, no DB round-trip needed for it.
const ADMIN_COOKIE = "admin_session";
const USER_COOKIE = "user_session";

// Routes reachable without being logged in: the marketing landing page
// (which itself renders the real event feed once you ARE logged in — see
// src/app/(public)/page.tsx) and the auth forms themselves.
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

async function hasValidUserSession(request: NextRequest): Promise<boolean> {
  const sessionId = request.cookies.get(USER_COOKIE)?.value;
  if (!sessionId) return false;

  try {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { expiresAt: true },
    });
    return !!session && session.expiresAt > new Date();
  } catch {
    // If the DB is unreachable, fail closed (treat as logged out) rather
    // than silently letting every request through.
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }

    const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
    const isValid =
      !!cookie && !!process.env.ADMIN_SESSION_SECRET && cookie === process.env.ADMIN_SESSION_SECRET;

    if (!isValid) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // API routes handle their own auth internally (they're called via
  // fetch/form-submit, not navigated to — a redirect response would just
  // confuse the caller rather than send a person anywhere).
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!(await hasValidUserSession(request))) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets, image optimization, and files served
  // straight out of /public (favicon, uploaded photos/posters/logos).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};

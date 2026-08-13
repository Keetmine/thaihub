import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Duplicated from lib/auth.ts (kept import-free here) so this stays
// bundle-safe for the Edge runtime, which can't use next/headers.
const ADMIN_COOKIE = "admin_session";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  const isValid =
    !!cookie && !!process.env.ADMIN_SESSION_SECRET && cookie === process.env.ADMIN_SESSION_SECRET;

  if (!isValid) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};

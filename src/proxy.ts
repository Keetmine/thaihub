import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kept import-free (no Prisma) on purpose: Proxy runs on every route,
// including prefetched ones, so per the Next.js docs it should only do an
// "optimistic" cookie-presence check here — no DB round-trip. Real
// authorization (validating the session against the DB) happens in the
// Data Access Layer: getCurrentUser() in src/lib/userAuth.ts, called by the
// pages/actions that actually need a verified identity.
const ADMIN_COOKIE = "admin_session";
const USER_COOKIE = "user_session";

// Routes reachable without being logged in: the marketing landing page
// (which itself renders the real event feed once you ARE logged in — see
// src/app/(public)/page.tsx) and the auth forms themselves.
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/manifest.webmanifest", "/robots.txt", "/sw.js"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }

    // Только optimistic-проверка наличия куки (без БД — proxy бежит на
    // каждый запрос); реальная валидация серверной сессии — в
    // isAdminAuthenticated(), которую вызывают admin-страницы/экшены.
    if (!request.cookies.get(ADMIN_COOKIE)?.value) {
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

  // Публичные списки мест шарятся наружу прямой ссылкой — /lists/{id}
  // пропускаем без куки, страница сама отдаёт 404/редирект по видимости
  // (сам /lists — кабинетный список СВОИХ, остаётся за логином).
  if (/^\/lists\/[^/]+$/.test(pathname)) {
    return NextResponse.next();
  }

  // Calendar-export links (event/[id]/ics) are meant to be handed to
  // external calendar apps (Google/Apple/Outlook "subscribe by URL"), which
  // fetch them directly and never carry our session cookie.
  if (pathname.startsWith("/event/") && pathname.endsWith("/ics")) {
    return NextResponse.next();
  }

  if (!request.cookies.get(USER_COOKIE)?.value) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets, image optimization, and files served
  // straight out of /public (favicon, uploaded photos/posters/logos, PWA
  // icons — the OS/browser fetches these without our session cookie).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/|icons/).*)"],
};

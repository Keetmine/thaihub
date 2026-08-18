import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import { googleRedirectUri, publicOrigin } from "@/lib/googleOauth";

// Начало входа через Google (OAuth 2.0 authorization code flow, без
// сторонних библиотек): редиректим на согласие Google со state-кукой
// против CSRF. Callback — в ./callback/route.ts. Требует
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET в env (redirect URI в консоли
// Google: {APP_URL}/api/auth/google/callback).

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=google", publicOrigin(request.nextUrl.origin)));
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(request.nextUrl.origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}

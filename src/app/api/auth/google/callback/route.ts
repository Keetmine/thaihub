import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/userAuth";
import { googleRedirectUri } from "@/lib/googleOauth";

// Callback входа через Google: сверяем state, меняем code на токены
// напрямую у Google и берём профиль из id_token. Подпись JWT не
// проверяем сознательно — токен получен только что по HTTPS от самого
// Google в обмен на code+client_secret, подменить его в этом канале
// нечем. Аккаунт ищется по googleId, затем по email (линкуем Google к
// существующему email-аккаунту), иначе создаётся новый.

type GoogleIdToken = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function fail(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login?error=google", request.url));
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail(request);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get("google_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) return fail(request);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(request.nextUrl.origin),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail(request);
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return fail(request);

  let payload: GoogleIdToken;
  try {
    payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"),
    ) as GoogleIdToken;
  } catch {
    return fail(request);
  }
  if (!payload.sub || !payload.email) return fail(request);
  const email = payload.email.toLowerCase();

  let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
  if (!user) {
    // Линкуем к существующему email-аккаунту, иначе создаём новый.
    const byEmail = await prisma.user.findUnique({ where: { email } });
    user = byEmail
      ? await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: payload.sub,
            photoUrl: byEmail.photoUrl ?? payload.picture ?? null,
          },
        })
      : await prisma.user.create({
          data: {
            googleId: payload.sub,
            email,
            name: payload.name ?? null,
            photoUrl: payload.picture ?? null,
          },
        });
  }

  await createUserSession(user.id);
  const res = NextResponse.redirect(new URL("/account", request.url));
  res.cookies.delete("google_oauth_state");
  return res;
}

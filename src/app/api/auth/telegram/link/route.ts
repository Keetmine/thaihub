import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";
import { publicOrigin } from "@/lib/googleOauth";
import { cookies } from "next/headers";
import { TELEGRAM_RELINK_COOKIE } from "@/lib/telegramRelink";

// Привязка Telegram к УЖЕ залогиненному аккаунту — отдельным адресом, а
// не параметром ?mode=link у общего колбэка: Telegram Login Widget
// возвращает свой набор полей и не сохраняет наш query, поэтому режим
// терялся, и попытка привязки создавала второй аккаунт вместо связывания.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = (suffix: string) =>
    NextResponse.redirect(new URL(`/account/settings${suffix}`, publicOrigin(url.origin)));

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", publicOrigin(url.origin)));

  const payload = verifyTelegramAuth(url.searchParams);
  if (!payload) return settings("?telegram=failed");

  const existing = await prisma.user.findUnique({ where: { telegramId: payload.id } });
  if (existing && existing.id !== user.id) {
    // Telegram занят другим аккаунтом. Молча перевесить нельзя — тот
    // аккаунт лишится входа, — поэтому сохраняем подписанные данные во
    // временную куку и показываем экран подтверждения: человек увидит,
    // что именно будет потеряно, и решит сам.
    const store = await cookies();
    store.set(TELEGRAM_RELINK_COOKIE, url.search, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/",
    });
    return NextResponse.redirect(
      new URL("/account/settings/telegram-relink", publicOrigin(url.origin)),
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId: payload.id,
      telegramUsername: payload.username,
      ...(user.photoUrl ? {} : { photoUrl: payload.photoUrl }),
    },
  });
  return settings("?telegram=linked");
}

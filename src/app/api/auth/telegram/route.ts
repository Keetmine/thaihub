import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";
import { publicOrigin } from "@/lib/googleOauth";
import { getCurrentUser } from "@/lib/userAuth";

// Колбэк Telegram Login Widget (data-auth-url): виджет редиректит сюда
// GET-запросом с профилем и подписью в query-параметрах. Проверяем
// подпись, находим/создаём пользователя по telegramId, ставим обычную
// пользовательскую сессию и уводим на главную.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = verifyTelegramAuth(url.searchParams);
  if (!payload) {
    return NextResponse.redirect(new URL("/login?error=telegram", publicOrigin(url.origin)));
  }

  const name =
    [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
    payload.username ||
    "Telegram user";

  // Режим привязки: залогиненный пользователь подключает Telegram к
  // своему аккаунту из настроек. Раньше telegramId проставлялся только
  // при входе через Telegram или оплате, поэтому зарегистрированные по
  // почте не могли получать уведомления вовсе.
  const linking = url.searchParams.get("mode") === "link";
  const currentUser = linking ? await getCurrentUser() : null;

  const existing = await prisma.user.findUnique({ where: { telegramId: payload.id } });

  if (linking && currentUser) {
    if (existing && existing.id !== currentUser.id) {
      // Этот Telegram уже принадлежит другому аккаунту — молча
      // перевесить нельзя, иначе тот человек потеряет вход.
      return NextResponse.redirect(
        new URL("/account/settings?telegram=taken", publicOrigin(url.origin)),
      );
    }
    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        telegramId: payload.id,
        telegramUsername: payload.username,
        ...(currentUser.photoUrl ? {} : { photoUrl: payload.photoUrl }),
      },
    });
    return NextResponse.redirect(
      new URL("/account/settings?telegram=linked", publicOrigin(url.origin)),
    );
  }

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        // Освежаем только телеграмные поля; имя/фото не трогаем, если
        // пользователь уже поменял их у нас руками (существующее имя
        // всегда остаётся).
        data: {
          telegramUsername: payload.username,
          ...(existing.photoUrl ? {} : { photoUrl: payload.photoUrl }),
        },
      })
    : await prisma.user.create({
        data: {
          telegramId: payload.id,
          telegramUsername: payload.username,
          name,
          photoUrl: payload.photoUrl,
        },
      });

  await createUserSession(user.id);
  return NextResponse.redirect(new URL("/", publicOrigin(url.origin)));
}

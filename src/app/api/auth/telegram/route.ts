import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";

// Колбэк Telegram Login Widget (data-auth-url): виджет редиректит сюда
// GET-запросом с профилем и подписью в query-параметрах. Проверяем
// подпись, находим/создаём пользователя по telegramId, ставим обычную
// пользовательскую сессию и уводим на главную.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = verifyTelegramAuth(url.searchParams);
  if (!payload) {
    return NextResponse.redirect(new URL("/login?error=telegram", request.url));
  }

  const name =
    [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
    payload.username ||
    "Telegram user";

  const existing = await prisma.user.findUnique({ where: { telegramId: payload.id } });
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
  return NextResponse.redirect(new URL("/", request.url));
}

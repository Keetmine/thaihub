import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";
import { publicOrigin } from "@/lib/googleOauth";
import { pluralized } from "@/lib/plural";

// Привязка Telegram к УЖЕ залогиненному аккаунту — отдельным адресом, а
// не параметром ?mode=link у общего колбэка: Telegram Login Widget
// возвращает свой набор полей и не сохраняет наш query, поэтому режим
// терялся, и попытка привязки создавала второй аккаунт вместо связывания.
/**
 * Привязка по данным виджета. Общая часть для GET (переход браузера) и
 * POST (виджет в режиме data-onauth — привязка без ухода со страницы).
 */
async function linkTelegram(params: URLSearchParams, search: string) {
  const user = await getCurrentUser();
  if (!user) return { status: "unauthorized" as const };

  const payload = verifyTelegramAuth(params);
  if (!payload) return { status: "failed" as const };

  const existing = await prisma.user.findUnique({
    where: { telegramId: payload.id },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          favoriteEvents: true,
          favoritePerformers: true,
          trips: true,
          eventAttendances: true,
        },
      },
    },
  });

  if (existing && existing.id !== user.id) {
    // Telegram занят другим аккаунтом. Молча перевесить нельзя — тот
    // аккаунт лишится входа, — поэтому возвращаем подписанные данные
    // обратно и просим подтверждения: человек увидит, что именно будет
    // потеряно, и решит сам. Куки тут не нужны — подпись проверяется
    // заново при подтверждении, а кука заставляла попап ходить на
    // сервер при открытии и закрытии.
    return {
      status: "relink" as const,
      auth: search.replace(/^\?/, ""),
      info: {
        telegramUsername: payload.username,
        otherName: existing.name,
        losses: [
          {
            n: existing._count.favoritePerformers,
            forms: ["любимый артист", "любимых артиста", "любимых артистов"] as [string, string, string],
          },
          {
            n: existing._count.favoriteEvents,
            forms: ["событие в избранном", "события в избранном", "событий в избранном"] as [string, string, string],
          },
          {
            n: existing._count.eventAttendances,
            forms: ["отметка «иду»", "отметки «иду»", "отметок «иду»"] as [string, string, string],
          },
          {
            n: existing._count.trips,
            forms: ["поездка", "поездки", "поездок"] as [string, string, string],
          },
        ]
          .filter((c) => c.n > 0)
          .map((c) => pluralized(c.n, c.forms)),
      },
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId: payload.id,
      telegramUsername: payload.username,
      ...(user.photoUrl ? {} : { photoUrl: payload.photoUrl }),
    },
  });
  return { status: "linked" as const };
}

/**
 * Виджет в режиме data-onauth шлёт данные сюда фоном — страница не
 * перезагружается, подтверждение переноса показывается попапом на
 * месте. Раньше кнопка уводила браузер на GET-колбэк и возвращала
 * назад: моргание страницы ровно там, где человек ничего не менял.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const result = await linkTelegram(params, `?${params.toString()}`);
  const httpStatus = result.status === "unauthorized" ? 401 : 200;
  return NextResponse.json(result, { status: httpStatus });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = (suffix: string) =>
    NextResponse.redirect(new URL(`/account/settings${suffix}`, publicOrigin(url.origin)));

  // Запасной путь: браузеры, где data-onauth не отработал, приходят
  // сюда обычным переходом.
  const result = await linkTelegram(url.searchParams, url.search);
  if (result.status === "unauthorized") {
    return NextResponse.redirect(new URL("/login", publicOrigin(url.origin)));
  }
  if (result.status === "failed") return settings("?telegram=failed");
  // Перенос делается попапом, а он живёт на клиенте — из серверного
  // пути его не показать. Сообщаем, что Telegram занят: человек
  // нажмёт кнопку в настройках и пройдёт перенос там.
  if (result.status === "relink") return settings("?telegram=taken");
  return settings("?telegram=linked");
}

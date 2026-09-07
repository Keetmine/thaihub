import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { touchLastSeen } from "@/lib/lastSeen";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { getLocale, localeHref } from "@/lib/i18n";

export const USER_COOKIE = "user_session";
const SESSION_DAYS = 30;

/** Экран «вы заблокированы». Живёт ВНЕ группы (public): её layout сам
 *  зовёт assertNotBanned(), и страница внутри неё зациклила бы редирект. */
export const BANNED_PATH = "/banned";

async function bannedHref(): Promise<string> {
  return localeHref(BANNED_PATH, await getLocale());
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function createUserSession(userId: string) {
  // Все четыре способа войти (пароль, регистрация, Google, Telegram)
  // заканчиваются здесь — поэтому проверка блокировки стоит в этой
  // функции, а не в каждом экшене входа: забыть её в новом способе
  // входа физически негде.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true, bannedAt: true },
  });
  if (user?.bannedAt) {
    // Сессию не заводим вовсе: заблокированному незачем носить куку.
    // Уводим не на форму входа (человек решил бы, что ошибся паролем),
    // а на экран с объяснением.
    redirect(await bannedHref());
  }

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({ data: { id, userId, expiresAt } });

  const store = await cookies();
  store.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });

  // Язык из профиля — в куку: proxy бежит на каждый запрос и в базу не
  // ходит, поэтому иначе на новом устройстве человек до самого футера
  // видел бы язык браузера, а не тот, что однажды выбрал.
  if (isLocale(user?.locale)) {
    store.set(LOCALE_COOKIE, user.locale, {
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
    });
  }
}

export async function destroyUserSession() {
  const store = await cookies();
  const id = store.get(USER_COOKIE)?.value;
  if (id) {
    await prisma.userSession.delete({ where: { id } }).catch(() => {});
  }
  store.delete(USER_COOKIE);
}

// React.cache: один запрос сессии на HTTP-запрос, сколько бы раз
// layout и страница ни спросили текущего пользователя. Отдельно от
// getCurrentUser, потому что про блокировку нужно знать и тогда, когда
// «текущего пользователя» уже нет (экран /banned): иначе понадобился бы
// второй поход в базу за той же строкой.
const loadSession = cache(async () => {
  const store = await cookies();
  const id = store.get(USER_COOKIE)?.value;
  if (!id) return null;

  const session = await prisma.userSession.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  // Удалённый аккаунт не должен «оживать» по старой сессии.
  if (session.user.deletedAt) return null;

  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await loadSession();
  if (!session) return null;

  // ЕДИНСТВЕННАЯ проверка блокировки на чтении. Она стоит здесь, а не в
  // страницах и экшенах, потому что через getCurrentUser проходит вся
  // авторизация сайта: «кто я» больше неоткуда взять (proxy читает
  // только наличие куки и в базу не ходит). Заблокированный с этой
  // минуты для всего кода — гость: страницы рисуются как анониму, все
  // экшены (сообщества, комментарии, отзывы, поездки) упираются в свою
  // же проверку «нужен вход», админские гейты не пускают в админку.
  // Сессию при бане НЕ гасим: строка остаётся живой, чтобы assertNotBanned()
  // на следующем же клике показал человеку экран с объяснением, а не
  // молча выкинул его на форму входа.
  if (session.user.bannedAt) return null;

  // Единственная точка, где известно «это живой залогиненный человек, и
  // он прямо сейчас что-то делает», — отсюда и отмечаем активность для
  // админки. Запись дросселируется по времени и уходит после ответа,
  // так что на отрисовку страницы не влияет (см. lib/lastSeen.ts).
  touchLastSeen(session.user.id, session.user.lastSeenAt);

  return session.user;
});

/** Заблокированный владелец текущей куки — или null. Нужен ровно двум
 *  местам: экрану /banned (что показать) и assertNotBanned (кого увести). */
export const getBannedViewer = cache(async () => {
  const session = await loadSession();
  return session?.user.bannedAt ? session.user : null;
});

/**
 * Увести заблокированного на экран с объяснением. Зовётся из layout
 * группы (public) — одной строкой на весь сайт: layout рендерится перед
 * любой её страницей, и обойти его, оставшись на странице, нельзя.
 *
 * Это ТОЛЬКО объяснение, а не защита: доступ уже закрыт выше, в
 * getCurrentUser. Даже если какой-то маршрут окажется вне этого layout,
 * заблокированный увидит там ровно то же, что аноним, и ничего не
 * сделает.
 */
export async function assertNotBanned(): Promise<void> {
  if (await getBannedViewer()) redirect(await bannedHref());
}

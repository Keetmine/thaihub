import type { User } from "@/generated/prisma/client";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { common as enCommon } from "@/lib/i18n/en/common";
import { common as ruCommon } from "@/lib/i18n/ru/common";

// Публичное имя и ссылка пользователя. Ник (username) уникален и служит
// адресом профиля — им удобно делиться («добавь меня»), а displayName
// (историческое поле name) показывается в интерфейсе.

type PublicUser = Pick<User, "id" | "name" | "username">;

// Словари берём напрямую, а не через getDict: тот тянет next/headers и
// закрыл бы утилиту для клиентских компонентов.
const COMMON: Record<Locale, typeof enCommon> = { en: enCommon, ru: ruCommon };

/**
 * Что показывать в интерфейсе: имя, иначе ник, иначе заглушка.
 *
 * Язык — необязательный последний аргумент (как у форматтеров в
 * src/lib/dates.ts); по умолчанию английский, потому что английский —
 * язык сайта по умолчанию, и забытый вызов должен молчаливо давать
 * его, а не русский. Публичные страницы передают язык зрителя явно.
 *
 * Удалённый аккаунт подписывается на языке зрителя по признаку
 * `deletedAt`: в базе у него лежит имя, записанное в момент удаления, а
 * читают его другие люди и на своём языке. Признак нужно выбрать в
 * запросе (`select: { deletedAt: true }`), иначе останется имя из базы.
 */
export function userDisplayName(
  user: {
    name?: string | null;
    username?: string | null;
    deletedAt?: Date | null;
  } | null,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = COMMON[locale];
  if (!user) return t.userFallback;
  if (user.deletedAt) return t.deletedAccount;
  return user.name || user.username || t.userFallback;
}

/** Адрес профиля: /users/username, с откатом на id — ник может быть ещё
 *  не задан (старые аккаунты, регистрация не доведена до конца).
 *
 *  Имени тут не просим намеренно: ссылке оно не нужно, а лишнее поле в
 *  сигнатуре заставляло вызывающих либо тащить его в select, либо
 *  собирать адрес руками — так и расползлись ссылки по id.
 */
export function userHref(user: Pick<PublicUser, "id" | "username">): string {
  return `/users/${user.username ?? user.id}`;
}

/** Ник из почты или Telegram — предзаполнение на шаге регистрации.
 *  Только латиница, цифры, точка, дефис и подчёркивание. */
export function suggestUsername(source: string): string {
  const base = source
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 24);
  return base || "user";
}

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$/;

/** Проверка ника: длина 2–24, латиница/цифры/._-, не начинается и не
 *  заканчивается разделителем. */
export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}

/** Зарезервировано под наши же маршруты и служебные слова — иначе ник
 *  вроде «settings» перекрыл бы страницу. */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "account",
  "settings",
  "login",
  "signup",
  "logout",
  "help",
  "about",
  "terms",
  "wiki",
  "search",
  "users",
  "me",
  "new",
  "edit",
  "notifications",
  "trips",
  "lists",
  "friends",
  "calendar",
  "artists",
  "dramas",
  "novels",
  "locations",
  "agencies",
  "event",
  "day",
]);

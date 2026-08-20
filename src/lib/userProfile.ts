import type { User } from "@/generated/prisma/client";

// Публичное имя и ссылка пользователя. Ник (username) уникален и служит
// адресом профиля — им удобно делиться («добавь меня»), а displayName
// (историческое поле name) показывается в интерфейсе.

type PublicUser = Pick<User, "id" | "name" | "username">;

/** Что показывать в интерфейсе: имя, иначе ник, иначе заглушка. */
export function userDisplayName(user: {
  name?: string | null;
  username?: string | null;
} | null): string {
  if (!user) return "Пользователь";
  return user.name || user.username || "Пользователь";
}

/** Адрес профиля: /users/keetmine, с откатом на id — ник может быть ещё
 *  не задан (старые аккаунты, регистрация не доведена до конца). */
export function userHref(user: PublicUser): string {
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

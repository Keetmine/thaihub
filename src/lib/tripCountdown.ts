import type { Dict } from "@/lib/i18n";
import { dayIndex } from "@/lib/tripDays";

/**
 * Обратный отсчёт до поездки (АА9, правка владельца 2026-09-23: «будем
 * отправлять каждый день до поездки, если до неё осталось меньше
 * месяца, то есть отсчёт начнётся с сообщения, что поездка через
 * месяц»). Чистая арифметика и подбор подписи — без Prisma, чтобы
 * гонять в tests/unit; рассылка — sendTripCountdowns в
 * telegramNotifications.ts, показ на странице поездки — trips/[id].
 */

/** С какого дня начинается отсчёт: первое сообщение — «ровно месяц». */
export const COUNTDOWN_START_DAYS = 30;

/**
 * Сегодняшний календарный день сервера полуночью UTC — в том же виде,
 * в каком лежат даты поездок (combineDateTime(date, "00:00")). Именно
 * локальный день (TZ контейнера — Europe/Moscow, см. docker-compose),
 * а не UTC: рассылка уходит утром по Москве, и «завтра» должно значить
 * завтра для того, кто её читает, а не для Гринвича.
 */
export function countdownToday(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Сколько дней до начала: 0 — сегодня, 1 — завтра, отрицательное —
 * уже началась. Через dayIndex, как длина поездки в tripDays.ts: у
 * старых записей дата лежит 21:00 UTC предыдущего дня, и округление к
 * суткам даёт им тот же день, что и новым.
 */
export function daysUntilTrip(startDate: Date, today: Date): number {
  return dayIndex(startDate) - dayIndex(today);
}

/**
 * Подпись дня — или null, если отсчёт ещё не начался (дальше месяца)
 * или поездка уже идёт. Подписи лежат в словаре по числу оставшихся
 * дней: у каждого дня своя, от «ровно месяц» до «сегодня!».
 *
 * `overrides` — правки текстов из админки (`/admin/notifications`),
 * ключ `countdown.<дней>`. Таблицей, а не через реестр шаблонов: тот
 * ходит в базу, а этот модуль остаётся чистым — им пользуется и
 * юнит-тест, и страница поездки.
 */
export function tripCountdownCaption(
  daysLeft: number,
  t: Dict,
  overrides?: Record<string, string>,
): string | null {
  if (!Number.isInteger(daysLeft) || daysLeft < 0 || daysLeft > COUNTDOWN_START_DAYS) return null;
  return overrides?.[`countdown.${daysLeft}`] || t.notifications.tripCountdown[daysLeft] || null;
}

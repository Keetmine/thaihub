import { dateKey } from "@/lib/dates";

/**
 * Ключ «тот же рейс»: номер рейса без регистра и пробелов плюс день
 * вылета. По нему добавление перелёта, который в поездке уже есть,
 * становится присоединением к нему, а не второй бронью (правка
 * владельца 2026-09-19: «подружка добавила свой самолёт, а если я свой
 * добавлю — будет каша, хотя рейс один»). Отели по ключу не склеиваются:
 * у отеля «название» — свободный текст, и два номера в одном отеле — две
 * разные брони.
 *
 * Чистая функция — проверяется юнит-тестом tests/unit/tripBookingKey.test.ts.
 */
export function sameFlightKey(kind: "HOTEL" | "FLIGHT", name: string, startAt: Date | null): string | null {
  if (kind !== "FLIGHT" || !startAt) return null;
  const flight = name.toUpperCase().replace(/[\s\-–—]+/g, "");
  if (!flight) return null;
  return `${flight}@${dateKey(startAt)}`;
}

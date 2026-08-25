import { plural } from "@/lib/plural";
import { ONLINE_WINDOW_MS } from "@/lib/lastSeen";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Подписи только для админки — она одноязычная русская и в словари i18n
// не выносится (см. docs/features/i18n.md).
//
// Календарный день считаем в московской зоне, а не в UTC: страница
// рендерится на сервере, и по UTC вечерний заход выглядел бы вчерашним.
// lastSeenAt — настоящий момент времени (Date.now при отметке), а не
// тайское «настенное» время каталога, поэтому обычная конвертация зон
// здесь корректна.
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEFAULT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const EXACT_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DEFAULT_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MS_IN_DAY = 24 * 60 * 60 * 1000;

/** Номер календарного дня (в МСК) — чтобы «сегодня/вчера» считались по
 *  датам, а не по «прошло 24 часа». */
function dayNumber(d: Date): number {
  const [y, m, day] = DAY_KEY_FORMAT.format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day) / MS_IN_DAY;
}

export function isOnlineNow(lastSeenAt: Date | null, now: Date = new Date()): boolean {
  return !!lastSeenAt && now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

/** «сейчас на сайте» / «сегодня» / «вчера» / «5 дней назад» / «больше
 *  месяца назад» / «ни разу» — для списка пользователей. */
export function lastSeenLabel(lastSeenAt: Date | null, now: Date = new Date()): string {
  // Пустое поле — это и «не заходил с тех пор, как отметки появились»,
  // и старые аккаунты, заведённые до неё. Отличить одно от другого
  // нельзя, поэтому подпись нейтральная.
  if (!lastSeenAt) return "ни разу";
  if (isOnlineNow(lastSeenAt, now)) return "сейчас на сайте";

  const days = dayNumber(now) - dayNumber(lastSeenAt);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days <= 30) return `${days} ${plural(days, ["день", "дня", "дней"])} назад`;
  if (days <= 365) return "больше месяца назад";
  return "больше года назад";
}

/** Точные дата и время последнего захода — карточка пользователя и
 *  подсказка на строке списка. */
export function lastSeenExact(d: Date): string {
  return `${EXACT_FORMAT.format(d).replace(/\sг\./, "")} МСК`;
}

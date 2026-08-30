import type { Locale } from "./i18n/config";

const pad = (n: number) => n.toString().padStart(2, "0");

// Подписи дат зависят от языка страницы, поэтому форматтеры принимают
// его отдельным аргументом. Параметр необязательный и по умолчанию
// русский: админка одноязычная, и её вызовы (как и вызовы из ещё не
// переведённых разделов) должны давать ровно то же, что и раньше.
// Публичные страницы передают язык зрителя явно.
//
// Английский берём в британской раскладке «день месяц год»: тот же
// порядок, что и в русской, — чипы и колонки дат не меняют ширину при
// переключении языка, а форма привычна международной аудитории.
const INTL_TAG: Record<Locale, string> = { en: "en-GB", ru: "ru-RU" };

// ВАЖНО про часовые пояса. Каждое событие MyBLHub — тайское, и в базе
// лежит тайское НАСТЕННОЕ время без зоны (19:00 значит 19:00 в Бангкоке).
// Prisma отдаёт такой timestamp как момент в UTC, поэтому единственный
// способ прочитать его обратно одинаково везде — брать UTC-компоненты.
// Локальные getHours()/getDate() давали разное на сервере (UTC) и в
// браузере (МСК): время уезжало на 3 часа, а у вечерних событий дата —
// на сутки вперёд, плюс React ругался на несовпадение разметки.
const UTC = "UTC";

// Thai (Buddhist Era) years run exactly 543 ahead of Gregorian. A native
// <input type="date"> can hand back a BE year instead of the Gregorian
// value it was given, under some browser/OS locale configurations (th-TH
// renders and round-trips its date picker in BE) — any year implausibly
// far in the future is assumed to be a leaked BE year and corrected,
// rather than trusting the browser/scraper output verbatim.
const BUDDHIST_ERA_OFFSET = 543;
function normalizeYear(year: number): number {
  return year > new Date().getFullYear() + 50 ? year - BUDDHIST_ERA_OFFSET : year;
}

/** Combines a "YYYY-MM-DD" date string and "HH:mm" time string into a
 *  local wall-clock Date — never through `new Date(isoString)`, which
 *  would reinterpret an unqualified string in the server's own timezone. */
export function combineDateTime(dateStr: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(normalizeYear(y), mo - 1, d, h, m));
}

export function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(23, 59, 59, 999);
  return r;
}

export function formatTime(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Every event in MyBLHub is a Thailand event — stored/displayed times are
// always Thai (ICT, UTC+7) wall-clock, entered as such whether typed by
// hand or scraped. Moscow (MSK, UTC+3) has no DST either, so the gap is a
// constant 4 hours — no timezone library needed, just subtract 4 hours
// from whatever formatTime() would already show.
export function formatTimeWithMsk(d: Date): string {
  const msk = new Date(d);
  msk.setUTCHours(msk.getUTCHours() - 4);
  return `${formatTime(d)} (МСК ${formatTime(msk)})`;
}

export function toMskTime(d: Date): Date {
  const msk = new Date(d);
  msk.setUTCHours(msk.getUTCHours() - 4);
  return msk;
}

/** Same idea as formatTimeWithMsk but for a start–end range, so the MSK
 *  equivalent doesn't have to be repeated per side: "18:00–21:00 (МСК
 *  14:00–17:00)". Falls back to a single time when there's no end. */
export function formatTimeRangeWithMsk(start: Date, end: Date | null): string {
  if (!end) return formatTimeWithMsk(start);
  return `${formatTime(start)}–${formatTime(end)} (МСК ${formatTime(toMskTime(start))}–${formatTime(toMskTime(end))})`;
}

// Zone-версии тех же подписей: «в скобках» — время в выбранной юзером
// таймзоне (User.timezone, настройки → Профиль), а не жёсткий МСК.
import { formatTimeInZone, tzShortLabel } from "./timezones";

export function formatTimeWithZone(d: Date, tz: string): string {
  return `${formatTime(d)} (${tzShortLabel(tz)} ${formatTimeInZone(d, tz)})`;
}

export function formatTimeRangeWithZone(start: Date, end: Date | null, tz: string): string {
  if (!end) return formatTimeWithZone(start, tz);
  return `${formatTime(start)}–${formatTime(end)} (${tzShortLabel(tz)} ${formatTimeInZone(start, tz)}–${formatTimeInZone(end, tz)})`;
}

// Compact "24 окт" / "24 Oct" form, for flat (non day-grouped) event lists
// where the row itself has to carry the date since there's no day heading
// above it.
export function formatShortDate(d: Date, locale: Locale = "ru"): string {
  return d
    .toLocaleDateString(INTL_TAG[locale], { day: "numeric", month: "short", timeZone: UTC })
    .replace(/\.$/, "");
}

/** «24 окт 2025» / «24 Oct 2025» — для подписей, где важен год.
 *  Отзывы и комментарии живут годами, и «24 окт» там врёт: непонятно,
 *  этого года или позапрошлого. Считается в UTC, как остальные даты в
 *  этом модуле. */
export function formatDateWithYear(d: Date, locale: Locale = "ru"): string {
  return (
    d
      .toLocaleDateString(INTL_TAG[locale], {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: UTC,
      })
      // Русский Intl отдаёт «22 июл. 2025 г.» — убираем хвост целиком.
      // Срезать одну последнюю точку, как в formatShortDate, тут нельзя:
      // там она принадлежит сокращению месяца и есть только когда месяц
      // последний, а с годом остаётся сиротское «2025 г».
      .replace(/\s*г\.?$/, "")
  );
}

/** Короткий месяц («окт» / «Oct») и день недели («пн» / «Mon») для
 *  дата-блока карточки события. Считаются по локальным компонентам даты
 *  — ровно как раньше делали сами карточки, логика не менялась. */
export function shortMonthName(d: Date, locale: Locale = "ru"): string {
  return d.toLocaleDateString(INTL_TAG[locale], { month: "short" }).replace(/\.$/, "");
}

const WEEKDAYS_SHORT_SUNDAY_FIRST: Record<Locale, string[]> = {
  ru: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function shortWeekdayName(d: Date, locale: Locale = "ru"): string {
  return WEEKDAYS_SHORT_SUNDAY_FIRST[locale][d.getDay()];
}

/** Combines several occurrence dates that share the same year+month into
 *  one compact list — "21, 22, 23 августа 2026" / "21, 22, 23 August
 *  2026" — with the month/year stated once, trailing the last day, which
 *  reads naturally in both languages. Dates spanning more than one month
 *  become several such groups (each still just day-numbers + its own
 *  trailing "month year") joined by ", ". Used on the event page to
 *  combine same-time multi-date occurrences into a single line instead of
 *  one full date per line. */
export function formatCombinedDateList(dates: Date[], locale: Locale = "ru"): string {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const groups: Date[][] = [];
  for (const d of sorted) {
    const lastGroup = groups[groups.length - 1];
    const lastDate = lastGroup?.[lastGroup.length - 1];
    if (
      lastDate &&
      lastDate.getUTCFullYear() === d.getUTCFullYear() &&
      lastDate.getUTCMonth() === d.getUTCMonth()
    ) {
      lastGroup.push(d);
    } else {
      groups.push([d]);
    }
  }
  return groups
    .map((group) => {
      const lastDay = group[group.length - 1];
      const monthYear = lastDay
        .toLocaleDateString(INTL_TAG[locale], {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: UTC,
        })
        .replace(/\s?г\.$/, "");
      const otherDays = group.slice(0, -1).map((d) => d.getUTCDate());
      return [...otherDays, monthYear].join(", ");
    })
    .join(", ");
}

export function formatHumanDate(d: Date, locale: Locale = "ru"): string {
  return (
    d
      .toLocaleDateString(INTL_TAG[locale], {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: UTC,
      })
      // Русский Intl добавляет « г.» — в заголовках это шум, а во фразах
      // вида «до …» его точка склеивалась с точкой предложения в «г..».
      .replace(/\s?г\.$/, "")
  );
}

/** «14 октября 2026» / «14 October 2026» — полная дата БЕЗ дня недели,
 *  для подстановки внутрь фразы: «Подписка до <даты>». formatHumanDate
 *  здесь не годится — его день недели стоит в именительном падеже и
 *  после предлога читается как «до среда, …». */
export function formatFullDate(d: Date, locale: Locale = "ru"): string {
  return d
    .toLocaleDateString(INTL_TAG[locale], {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: UTC,
    })
    .replace(/\s?г\.$/, "");
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_NAMES: Record<Locale, string[]> = { ru: MONTH_NAMES_RU, en: MONTH_NAMES_EN };

/** Названия месяцев в именительном падеже — для выпадающих списков. */
export function monthNames(locale: Locale = "ru"): string[] {
  return MONTH_NAMES[locale];
}

export function monthLabel(year: number, month: number, locale: Locale = "ru"): string {
  return `${MONTH_NAMES[locale][month]} ${year}`;
}

const WEEKDAY_NAMES_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export { WEEKDAY_NAMES_RU };

const WEEKDAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SHORT_MONTHS_RU = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const SHORT_MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Короткие названия месяцев — выпадашка выбора месяца в календаре. */
export function shortMonthNames(locale: Locale = "ru"): string[] {
  return locale === "en" ? SHORT_MONTHS_EN : SHORT_MONTHS_RU;
}

/** Шапка сетки месяца, с понедельника — как её строит getMonthGrid. */
export function weekdayNames(locale: Locale = "ru"): string[] {
  return locale === "en" ? WEEKDAY_NAMES_EN : WEEKDAY_NAMES_RU;
}

/** Returns a grid of Date objects (6 weeks x 7 days) covering the given month, Monday-first. */
export function getMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const gridStart = addDays(firstOfMonth, -firstWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

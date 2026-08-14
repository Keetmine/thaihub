const pad = (n: number) => n.toString().padStart(2, "0");

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
  return new Date(normalizeYear(y), mo - 1, d, h, m);
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Every event in ThaiHub is a Thailand event — stored/displayed times are
// always Thai (ICT, UTC+7) wall-clock, entered as such whether typed by
// hand or scraped. Moscow (MSK, UTC+3) has no DST either, so the gap is a
// constant 4 hours — no timezone library needed, just subtract 4 hours
// from whatever formatTime() would already show.
export function formatTimeWithMsk(d: Date): string {
  const msk = new Date(d);
  msk.setHours(msk.getHours() - 4);
  return `${formatTime(d)} (МСК ${formatTime(msk)})`;
}

export function toMskTime(d: Date): Date {
  const msk = new Date(d);
  msk.setHours(msk.getHours() - 4);
  return msk;
}

/** Same idea as formatTimeWithMsk but for a start–end range, so the MSK
 *  equivalent doesn't have to be repeated per side: "18:00–21:00 (МСК
 *  14:00–17:00)". Falls back to a single time when there's no end. */
export function formatTimeRangeWithMsk(start: Date, end: Date | null): string {
  if (!end) return formatTimeWithMsk(start);
  return `${formatTime(start)}–${formatTime(end)} (МСК ${formatTime(toMskTime(start))}–${formatTime(toMskTime(end))})`;
}

// Compact "24 окт" form, for flat (non day-grouped) event lists where the
// row itself has to carry the date since there's no day heading above it.
export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(/\.$/, "");
}

export function formatHumanDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
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

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_RU[month]} ${year}`;
}

const WEEKDAY_NAMES_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export { WEEKDAY_NAMES_RU };

/** Returns a grid of Date objects (6 weeks x 7 days) covering the given month, Monday-first. */
export function getMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // Mon=0..Sun=6
  const gridStart = addDays(firstOfMonth, -firstWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

const pad = (n: number) => n.toString().padStart(2, "0");

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

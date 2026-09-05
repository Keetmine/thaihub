// Счётчики по поездкам для статистики профиля и ачивок — чистая функция
// без Prisma, чтобы её можно было гонять в tests/unit. Какие поездки
// сюда попадают (свои + принятые совместные), решает computeUserStats.

const DAY = 24 * 60 * 60 * 1000;

export type TripRange = { startDate: Date; endDate: Date };

export type TripDayStats = {
  /** Все поездки: свои и те, куда позвали и где инвайт принят. */
  trips: number;
  /** Самая длинная одна поездка, дней (без объединения). */
  longestTripDays: number;
  /** Прожитые дни в Таиланде: только завершённые поездки, перекрытия
   *  считаются один раз. */
  daysInThailand: number;
};

/** Порядковый номер суток. Даты поездки в базе лежат полуночью (у старых
 *  записей — 21:00 предыдущего дня по UTC, создавались в локальной зоне);
 *  округление к ближайшим суткам даёт одинаковый индекс для обоих
 *  форматов, поэтому длина «с 4-го по 19-е» всегда 16, как и раньше
 *  считалось через round(diff)+1. */
const dayIndex = (d: Date) => Math.round(d.getTime() / DAY);

/** Длина одной поездки в днях, обе границы включительно. */
export function tripDays(t: TripRange): number {
  return Math.max(0, dayIndex(t.endDate) - dayIndex(t.startDate) + 1);
}

/**
 * Дни, покрытые хотя бы одной из поездок (объединение диапазонов).
 * Совместная поездка подруги обычно совпадает с собственной по датам
 * (одна и та же неделя, свои планы у каждой): суммировать их — считать
 * одни и те же дни дважды.
 */
export function unionTripDays(ranges: TripRange[]): number {
  const sorted = ranges
    .map((r) => ({ from: dayIndex(r.startDate), to: dayIndex(r.endDate) }))
    .filter((r) => r.to >= r.from)
    .sort((a, b) => a.from - b.from);
  let total = 0;
  let cur: { from: number; to: number } | null = null;
  for (const r of sorted) {
    if (cur && r.from <= cur.to + 1) {
      // Пересечение или стык день-в-день — продлеваем текущий отрезок.
      cur.to = Math.max(cur.to, r.to);
    } else {
      if (cur) total += cur.to - cur.from + 1;
      cur = { ...r };
    }
  }
  if (cur) total += cur.to - cur.from + 1;
  return total;
}

/**
 * Свод по поездкам. «Дней в Таиланде» — только по ЗАВЕРШЁННЫМ: текущая
 * засчитается целиком после возвращения, будущие не считаются вовсе
 * (иначе метрика прожитого опыта показывала бы ещё не прожитые дни).
 * Число поездок и самая длинная — по всем, включая будущие: ачивка
 * «Первая поездка» выдаётся за факт планирования.
 */
export function tripDayStats(trips: TripRange[], now: Date): TripDayStats {
  const completed = trips.filter((t) => t.endDate < now);
  return {
    trips: trips.length,
    longestTripDays: trips.length ? Math.max(...trips.map(tripDays)) : 0,
    daysInThailand: unionTripDays(completed),
  };
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  addMonths,
  dateKey,
  getMonthGrid,
  monthLabel,
  WEEKDAY_NAMES_RU,
} from "@/lib/dates";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) - 1 : now.getMonth();

  const gridDays = getMonthGrid(year, month);
  const rangeStart = gridDays[0];
  const rangeEnd = gridDays[gridDays.length - 1];
  rangeEnd.setHours(23, 59, 59, 999);

  const events = await prisma.event.findMany({
    where: { startsAt: { gte: rangeStart, lte: rangeEnd } },
    include: { performers: { include: { performer: true } } },
    orderBy: { startsAt: "asc" },
  });

  const eventsByDay = new Map<string, typeof events>();
  for (const ev of events) {
    const key = dateKey(ev.startsAt);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(ev);
  }

  const prev = addMonths(new Date(year, month, 1), -1);
  const next = addMonths(new Date(year, month, 1), 1);
  const todayKey = dateKey(now);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <span className="eyebrow">Афиша событий</span>
          <h1 className="display-1-tight text-capitalize mt-2 mb-0" style={{ fontSize: "2.75rem" }}>
            {monthLabel(year, month)}
          </h1>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link
            href={`/calendar?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`}
            className="btn btn-ghost btn-sm"
          >
            ← Пред.
          </Link>
          <Link href="/calendar" className="btn btn-ghost btn-sm">
            Сегодня
          </Link>
          <Link
            href={`/calendar?year=${next.getFullYear()}&month=${next.getMonth() + 1}`}
            className="btn btn-ghost btn-sm"
          >
            След. →
          </Link>
        </div>
      </div>

      <div className="d-none d-sm-grid calendar-grid mb-2" style={{ gap: "0.5rem" }}>
        {WEEKDAY_NAMES_RU.map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {gridDays.map((day) => {
          const key = dateKey(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === month;
          const isToday = key === todayKey;
          return (
            <Link
              href={`/day/${key}`}
              key={key}
              className={`calendar-cell ${inMonth ? "" : "outside-month"}`}
            >
              <span className={`calendar-day-num ${isToday ? "today" : ""}`}>
                {day.getDate()}
              </span>
              <div className="d-flex flex-column gap-1">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span key={ev.id} className="event-chip" title={ev.title}>
                    {ev.title}
                  </span>
                ))}
                {dayEvents.length > 3 && (
                  <span className="small text-secondary d-none d-sm-inline">
                    +{dayEvents.length - 3} ещё
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

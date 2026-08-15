import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  addMonths,
  dateKey,
  getMonthGrid,
  monthLabel,
  WEEKDAY_NAMES_RU,
} from "@/lib/dates";
import { getCurrentUser } from "@/lib/userAuth";
import { getGoingEventIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import PremiumUpsell from "@/components/PremiumUpsell";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();

  // Календарь — платная функция (см. PremiumUpsell / /admin/users).
  const gateUser = await getCurrentUser();
  if (!gateUser?.isPremium) {
    return (
      <div>
        <span className="eyebrow">Афиша событий</span>
        <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
          Календарь
        </h1>
        <PremiumUpsell feature="Календарь" />
      </div>
    );
  }
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) - 1 : now.getMonth();
  // Default is "all" (every event) — ?view=mine narrows to events I'm going to.
  const showAll = params.view !== "mine";

  const gridDays = getMonthGrid(year, month);
  const rangeStart = gridDays[0];
  const rangeEnd = gridDays[gridDays.length - 1];
  rangeEnd.setHours(23, 59, 59, 999);

  const currentUser = gateUser;

  const occurrences = await prisma.eventOccurrence.findMany({
    where: {
      startsAt: { gte: rangeStart, lte: rangeEnd },
      ...(!showAll && currentUser
        ? { event: { attendees: { some: { userId: currentUser.id } } } }
        : {}),
    },
    include: { event: { include: { performers: { include: { performer: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const events = occurrences.map(flattenOccurrence);

  const eventsByDay = new Map<string, typeof events>();
  for (const ev of events) {
    const key = dateKey(ev.startsAt);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(ev);
  }

  // In "all events" view, distinguish events the user is going to. In
  // "mine" view every visible event already qualifies, so skip the lookup.
  const goingIds = showAll
    ? await getGoingEventIds(events.map((ev) => ev.id), currentUser?.id)
    : new Set(events.map((ev) => ev.id));

  const prev = addMonths(new Date(year, month, 1), -1);
  const next = addMonths(new Date(year, month, 1), 1);
  const todayKey = dateKey(now);

  const viewQuery = showAll ? "" : "&view=mine";

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <span className="eyebrow">Афиша событий</span>
          <h1 className="display-1-tight text-capitalize mt-3 mb-0" style={{ fontSize: "2.75rem" }}>
            {monthLabel(year, month)}
          </h1>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link
            href={`/calendar?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            ← Пред.
          </Link>
          <Link href={`/calendar${showAll ? "" : "?view=mine"}`} className="btn btn-ghost btn-sm">
            Сегодня
          </Link>
          <Link
            href={`/calendar?year=${next.getFullYear()}&month=${next.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            След. →
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <div className="mode-toggle">
          <Link
            href={`/calendar?year=${year}&month=${month + 1}`}
            prefetch={false}
            className={`mode-toggle-option ${showAll ? "active" : ""}`}
          >
            Все события
          </Link>
          <Link
            href={`/calendar?year=${year}&month=${month + 1}&view=mine`}
            prefetch={false}
            className={`mode-toggle-option ${!showAll ? "active" : ""}`}
          >
            Мои события
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
                  <span
                    key={ev.occurrenceId}
                    className={`event-chip ${goingIds.has(ev.id) ? "event-chip-going" : ""}`}
                    title={ev.title}
                  >
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

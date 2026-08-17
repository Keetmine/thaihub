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
import { getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import PremiumUpsell from "@/components/PremiumUpsell";
import MonthYearJump from "./MonthYearJump";
import { isPremiumActive } from "@/lib/premium";
import LetterAvatar from "@/components/LetterAvatar";
import { performerHref } from "@/lib/performerSlug";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();

  // Календарь — платная функция (см. PremiumUpsell / /admin/users).
  const gateUser = await getCurrentUser();
  if (!isPremiumActive(gateUser)) {
    return (
      <div>
        <Link href="/" className="eyebrow text-decoration-none">
          ← Все события
        </Link>
        <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
          Календарь
        </h1>
        <PremiumUpsell feature="Календарь" />
      </div>
    );
  }
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) - 1 : now.getMonth();
  // Default is "all" (every event) — ?view=mine narrows to events I'm going
  // to, ?view=birthdays switches to the performers-birthday calendar.
  const showBirthdays = params.view === "birthdays";
  const showAll = !showBirthdays && params.view !== "mine";

  const gridDays = getMonthGrid(year, month);
  const rangeStart = gridDays[0];
  const rangeEnd = gridDays[gridDays.length - 1];
  rangeEnd.setHours(23, 59, 59, 999);

  const currentUser = gateUser;

  // Дни рождения: исполнители с датой рождения, СОСТОЯЩИЕ в агентствах
  // (без фильтра сетку заполняли тысячи случайных актёров из импортов),
  // в месяцах, попадающих в сетку (на краях — до трёх месяцев).
  type BirthdayRow = { id: string; name: string; slug: string | null; photoUrl: string | null; birthDate: Date };
  const birthdaysByDay = new Map<string, BirthdayRow[]>();
  if (showBirthdays) {
    const monthsInGrid = [...new Set(gridDays.map((d) => d.getMonth() + 1))];
    const rows = await prisma.$queryRaw<BirthdayRow[]>`
      SELECT id, name, slug, "photoUrl", "birthDate"
      FROM "Performer"
      WHERE "birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM "birthDate") = ANY(${monthsInGrid})
        AND EXISTS (
          SELECT 1 FROM "PerformerAgency" pa WHERE pa."performerId" = "Performer".id
        )
      ORDER BY name ASC
    `;
    for (const r of rows) {
      const key = `${String(r.birthDate.getMonth() + 1).padStart(2, "0")}-${String(r.birthDate.getDate()).padStart(2, "0")}`;
      if (!birthdaysByDay.has(key)) birthdaysByDay.set(key, []);
      birthdaysByDay.get(key)!.push(r);
    }
  }

  const occurrences = showBirthdays ? [] : await prisma.eventOccurrence.findMany({
    where: {
      startsAt: { gte: rangeStart, lte: rangeEnd },
      // «Мои события» — по отметкам на конкретные даты.
      ...(!showAll && currentUser
        ? { attendances: { some: { userId: currentUser.id } } }
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
    ? await getGoingOccurrenceIds(events.map((ev) => ev.occurrenceId), currentUser?.id)
    : new Set(events.map((ev) => ev.occurrenceId));

  const prev = addMonths(new Date(year, month, 1), -1);
  const next = addMonths(new Date(year, month, 1), 1);
  const todayKey = dateKey(now);

  const viewQuery = showBirthdays ? "&view=birthdays" : showAll ? "" : "&view=mine";

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <Link href="/" className="eyebrow text-decoration-none">
            ← Все события
          </Link>
          <h1 className="display-1-tight text-capitalize mt-3 mb-0" style={{ fontSize: "2.75rem" }}>
            {monthLabel(year, month)}
          </h1>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <MonthYearJump year={year} month={month} viewQuery={viewQuery} />
          <Link
            href={`/calendar?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            ← Пред.
          </Link>
          <Link
            href={`/calendar${viewQuery ? `?${viewQuery.slice(1)}` : ""}`}
            className="btn btn-ghost btn-sm"
          >
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
            className={`mode-toggle-option ${!showAll && !showBirthdays ? "active" : ""}`}
          >
            Мои события
          </Link>
          <Link
            href={`/calendar?year=${year}&month=${month + 1}&view=birthdays`}
            prefetch={false}
            className={`mode-toggle-option ${showBirthdays ? "active" : ""}`}
          >
            Дни рождения
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
          const inMonth = day.getMonth() === month;
          const isToday = key === todayKey;

          if (showBirthdays) {
            const bdayKey = `${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
            const celebrants = birthdaysByDay.get(bdayKey) ?? [];
            return (
              <div key={key} className={`calendar-cell ${inMonth ? "" : "outside-month"}`}>
                <span className={`calendar-day-num ${isToday ? "today" : ""}`}>
                  {day.getDate()}
                </span>
                <div className="d-flex flex-column gap-1">
                  {celebrants.slice(0, 3).map((p) => (
                    <Link
                      key={p.id}
                      href={performerHref(p)}
                      className="event-chip d-inline-flex align-items-center gap-1 text-decoration-none"
                      title={`${p.name} — ${day.getFullYear() - p.birthDate.getFullYear()} лет`}
                    >
                      <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={1.1} />
                      <span className="text-truncate">{p.name}</span>
                    </Link>
                  ))}
                  {celebrants.length > 3 && (
                    <span className="small text-secondary d-none d-sm-inline">
                      +{celebrants.length - 3} ещё
                    </span>
                  )}
                </div>
              </div>
            );
          }

          const dayEvents = eventsByDay.get(key) ?? [];
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
                    className={`event-chip ${goingIds.has(ev.occurrenceId) ? "event-chip-going" : ""}`}
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

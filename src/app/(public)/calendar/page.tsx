import AppLink from "@/components/AppLink";
import { prisma } from "@/lib/prisma";
import {
  addMonths,
  dateKey,
  getMonthGrid,
  monthLabel,
  weekdayNames,
} from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/userAuth";
import { getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import PremiumUpsell from "@/components/PremiumUpsell";
import MonthYearJump from "./MonthYearJump";
import { isPremiumActive } from "@/lib/premium";
import LetterAvatar from "@/components/LetterAvatar";
import { performerHref } from "@/lib/performerSlug";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.events.calendar.metaTitle,
    description: t.events.calendar.metaDescription,
    path: "/calendar",
  });
}


// Страница читает язык из заголовка запроса (getT), поэтому кэшировать
// её на сборке нельзя — рендерим на каждый запрос.
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>;
}) {
  const { locale, t } = await getT();
  const params = await searchParams;
  const now = new Date();

  // Календарь — платная функция (см. PremiumUpsell / /admin/users).
  const gateUser = await getCurrentUser();
  if (!isPremiumActive(gateUser)) {
    return (
      <div>
        <AppLink href="/" className="eyebrow text-decoration-none">
          {t.events.calendar.backToEvents}
        </AppLink>
        <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
          {t.events.calendar.title}
        </h1>
        <PremiumUpsell feature={t.events.calendar.paywallFeature} />
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
    // Слим-выборка исполнителей: сетке месяца нужны только id/name/slug,
    // полные строки Performer (с био) раздували ответ на весь месяц.
    include: {
      event: {
        include: {
          performers: {
            include: { performer: { select: { id: true, name: true, slug: true } } },
          },
        },
      },
    },
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
          <AppLink href="/" className="eyebrow text-decoration-none">
            {t.events.calendar.backToEvents}
          </AppLink>
          <h1 className="display-1-tight text-capitalize mt-3 mb-0" style={{ fontSize: "2.75rem" }}>
            {monthLabel(year, month, locale)}
          </h1>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <MonthYearJump year={year} month={month} viewQuery={viewQuery} />
          <AppLink
            href={`/calendar?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            {t.events.calendar.prev}
          </AppLink>
          <AppLink
            href={`/calendar${viewQuery ? `?${viewQuery.slice(1)}` : ""}`}
            className="btn btn-ghost btn-sm"
          >
            {t.events.calendar.today}
          </AppLink>
          <AppLink
            href={`/calendar?year=${next.getFullYear()}&month=${next.getMonth() + 1}${viewQuery}`}
            className="btn btn-ghost btn-sm"
          >
            {t.events.calendar.next}
          </AppLink>
        </div>
      </div>

      <div className="mb-4">
        <div className="mode-toggle">
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}`}
            prefetch={false}
            className={`mode-toggle-option ${showAll ? "active" : ""}`}
          >
            {t.events.calendar.viewAll}
          </AppLink>
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}&view=mine`}
            prefetch={false}
            className={`mode-toggle-option ${!showAll && !showBirthdays ? "active" : ""}`}
          >
            {t.events.calendar.viewMine}
          </AppLink>
          <AppLink
            href={`/calendar?year=${year}&month=${month + 1}&view=birthdays`}
            prefetch={false}
            className={`mode-toggle-option ${showBirthdays ? "active" : ""}`}
          >
            {t.events.calendar.viewBirthdays}
          </AppLink>
        </div>
      </div>

      <div className="d-none d-sm-grid calendar-grid mb-2" style={{ gap: "0.5rem" }}>
        {weekdayNames(locale).map((d) => (
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
                    <AppLink
                      key={p.id}
                      href={performerHref(p)}
                      className="event-chip d-inline-flex align-items-center gap-1 text-decoration-none"
                      title={t.events.calendar.birthdayTitle(
                        p.name,
                        day.getFullYear() - p.birthDate.getFullYear(),
                      )}
                    >
                      <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={1.1} />
                      <span className="text-truncate">{p.name}</span>
                    </AppLink>
                  ))}
                  {celebrants.length > 3 && (
                    <span className="small text-secondary d-none d-sm-inline">
                      {t.events.calendar.more(celebrants.length - 3)}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <AppLink
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
                    {t.events.calendar.more(dayEvents.length - 3)}
                  </span>
                )}
              </div>
            </AppLink>
          );
        })}
      </div>
    </div>
  );
}


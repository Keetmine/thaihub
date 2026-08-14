import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { dateKey, endOfDay, formatHumanDate, parseDateKey, startOfDay } from "@/lib/dates";
import EventAgendaRow from "@/components/EventAgendaRow";
import NameSearchBox from "@/components/NameSearchBox";
import { getFavoritedEventIds, getGoingEventIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByEvent } from "@/lib/friends";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getCurrentUser } from "@/lib/userAuth";
import { CalendarIcon } from "@/components/icons";
import LandingPage from "./LandingPage";

export const dynamic = "force-dynamic";

function groupByDay<T extends { startsAt: Date }>(events: T[]) {
  const eventsByDay = new Map<string, T[]>();
  for (const ev of events) {
    const key = dateKey(ev.startsAt);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(ev);
  }
  return eventsByDay;
}

type EventFilter = "all" | "going" | "favorited";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; from?: string; to?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return <LandingPage />;
  }

  const { filter: rawFilter, from: rawFrom, to: rawTo, q: rawQ } = await searchParams;
  const filter: EventFilter =
    rawFilter === "going" ? "going" : rawFilter === "favorited" ? "favorited" : "all";
  const q = (rawQ ?? "").trim();

  const isValidDateKey = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = isValidDateKey(rawFrom) ? rawFrom! : "";
  const to = isValidDateKey(rawTo) ? rawTo! : "";
  const hasDateRange = Boolean(from || to);
  // Carried through onto the filter toggle links so switching Все/Иду/
  // Избранное doesn't drop an active date range or search term.
  const rangeQuery = `${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const today = startOfDay(new Date());

  const eventInclude = { event: { include: { performers: { include: { performer: true } } } } };
  type OccurrenceRow = Prisma.EventOccurrenceGetPayload<{ include: typeof eventInclude }>;

  const titleFilter = q ? { event: { title: { contains: q, mode: "insensitive" as const } } } : {};

  // With an explicit date range, show everything in it as one ascending
  // list — the upcoming/archive split stops being meaningful once you've
  // picked a specific window (e.g. a past trip you want to revisit).
  const [upcomingOccurrences, pastOccurrences]: [OccurrenceRow[], OccurrenceRow[]] = hasDateRange
    ? [
        await prisma.eventOccurrence.findMany({
          where: {
            startsAt: {
              gte: from ? startOfDay(parseDateKey(from)) : undefined,
              lte: to ? endOfDay(parseDateKey(to)) : undefined,
            },
            ...titleFilter,
          },
          include: eventInclude,
          orderBy: { startsAt: "asc" },
        }),
        [],
      ]
    : await Promise.all([
        prisma.eventOccurrence.findMany({
          where: { startsAt: { gte: today }, ...titleFilter },
          include: eventInclude,
          orderBy: { startsAt: "asc" },
        }),
        prisma.eventOccurrence.findMany({
          where: { startsAt: { lt: today }, ...titleFilter },
          include: eventInclude,
          orderBy: { startsAt: "desc" },
        }),
      ]);
  const upcomingAll = upcomingOccurrences.map(flattenOccurrence);
  const pastAll = pastOccurrences.map(flattenOccurrence);

  const allIds = [...upcomingAll, ...pastAll].map((ev) => ev.id);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(allIds, user.id),
    getGoingEventIds(allIds, user.id),
    getFriendIds(user.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByEvent(allIds, friendIds);

  const matchesFilter = (id: string) =>
    filter === "all" ? true : filter === "going" ? goingIds.has(id) : favoritedIds.has(id);

  const upcoming = upcomingAll.filter((ev) => matchesFilter(ev.id));
  const past = pastAll.filter((ev) => matchesFilter(ev.id));
  const upcomingByDay = groupByDay(upcoming);
  const pastByDay = groupByDay(past);

  return (
    <div>
      <div className="dot-grid pb-1">
        <span className="eyebrow">Афиша событий</span>
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
          <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
            Все события
          </h1>
          <Link
            href="/calendar"
            className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
          >
            <CalendarIcon />
            Посмотреть в календаре
          </Link>
        </div>
      </div>

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={`/?filter=all${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "all" ? "active" : ""}`}
          >
            Все события
          </Link>
          <Link
            href={`/?filter=going${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "going" ? "active" : ""}`}
          >
            Я иду
          </Link>
          <Link
            href={`/?filter=favorited${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "favorited" ? "active" : ""}`}
          >
            Избранное
          </Link>
        </div>
        <NameSearchBox
          action="/"
          q={q}
          placeholder="Поиск по названию…"
          hiddenFields={{
            ...(filter !== "all" ? { filter } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          }}
          className=""
        />
      </div>

      <form className="d-flex flex-wrap align-items-end gap-2 mb-4">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <div>
          <label className="form-label small text-secondary mb-1">С даты</label>
          <input type="date" name="from" defaultValue={from} className="form-control form-control-sm" />
        </div>
        <div>
          <label className="form-label small text-secondary mb-1">По дату</label>
          <input type="date" name="to" defaultValue={to} className="form-control form-control-sm" />
        </div>
        <button type="submit" className="btn btn-outline-secondary btn-sm">
          Показать
        </button>
        {hasDateRange && (
          <Link href={`/?filter=${filter}`} prefetch={false} className="btn btn-ghost btn-sm">
            Сбросить даты
          </Link>
        )}
      </form>

      {hasDateRange && (
        <p className="small text-secondary mb-3">
          {upcomingAll.length === 0
            ? "В этом диапазоне дат событий нет."
            : `Событий в диапазоне: ${upcomingAll.length}.`}
        </p>
      )}

      {upcomingByDay.size === 0 ? (
        hasDateRange ? null : (
          <p className="text-secondary">
            {q ? "Ничего не найдено." : "Предстоящих событий пока нет."}
          </p>
        )
      ) : (
        <div className="d-flex flex-column gap-4">
          {Array.from(upcomingByDay.entries()).map(([key, dayEvents]) => (
            <section key={key}>
              <Link href={`/day/${key}`} className="day-group-heading mb-2">
                {formatHumanDate(parseDateKey(key))}
              </Link>
              <div className="d-flex flex-column gap-2 mt-2">
                {dayEvents.map((ev) => (
                  <EventAgendaRow key={ev.occurrenceId} event={ev} isFavorited={favoritedIds.has(ev.id)} isGoing={goingIds.has(ev.id)} friendsGoing={friendsGoingByEvent.get(ev.id) ?? []} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {pastByDay.size > 0 && (
        <div className="mt-4 pt-3">
          <h2
            className="small text-secondary text-uppercase mb-3"
            style={{ letterSpacing: "0.08em" }}
          >
            Архив событий
          </h2>
          <div className="d-flex flex-column gap-4 opacity-75">
            {Array.from(pastByDay.entries()).map(([key, dayEvents]) => (
              <section key={key}>
                <Link href={`/day/${key}`} className="day-group-heading mb-2">
                  {formatHumanDate(parseDateKey(key))}
                </Link>
                <div className="d-flex flex-column gap-2 mt-2">
                  {dayEvents.map((ev) => (
                    <EventAgendaRow key={ev.occurrenceId} event={ev} isFavorited={favoritedIds.has(ev.id)} isGoing={goingIds.has(ev.id)} friendsGoing={friendsGoingByEvent.get(ev.id) ?? []} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

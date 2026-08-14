import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, parseDateKey, startOfDay } from "@/lib/dates";
import EventAgendaRow from "@/components/EventAgendaRow";
import { getFavoritedEventIds, getGoingEventIds } from "@/lib/favorites";
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
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return <LandingPage />;
  }

  const { filter: rawFilter } = await searchParams;
  const filter: EventFilter =
    rawFilter === "going" ? "going" : rawFilter === "favorited" ? "favorited" : "all";

  const today = startOfDay(new Date());

  const [upcomingAll, pastAll] = await Promise.all([
    prisma.event.findMany({
      where: { startsAt: { gte: today } },
      include: { performers: { include: { performer: true } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.event.findMany({
      where: { startsAt: { lt: today } },
      include: { performers: { include: { performer: true } } },
      orderBy: { startsAt: "desc" },
    }),
  ]);

  const allIds = [...upcomingAll, ...pastAll].map((ev) => ev.id);
  const [favoritedIds, goingIds] = await Promise.all([
    getFavoritedEventIds(allIds, user.id),
    getGoingEventIds(allIds, user.id),
  ]);

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

      <div className="mode-toggle mb-4">
        <Link
          href="/"
          prefetch={false}
          className={`mode-toggle-option ${filter === "all" ? "active" : ""}`}
        >
          Все события
        </Link>
        <Link
          href="/?filter=going"
          prefetch={false}
          className={`mode-toggle-option ${filter === "going" ? "active" : ""}`}
        >
          Я иду
        </Link>
        <Link
          href="/?filter=favorited"
          prefetch={false}
          className={`mode-toggle-option ${filter === "favorited" ? "active" : ""}`}
        >
          Избранное
        </Link>
      </div>

      {upcomingByDay.size === 0 ? (
        <p className="text-secondary">Предстоящих событий пока нет.</p>
      ) : (
        <div className="d-flex flex-column gap-4">
          {Array.from(upcomingByDay.entries()).map(([key, dayEvents]) => (
            <section key={key}>
              <Link href={`/day/${key}`} className="day-group-heading mb-2">
                {formatHumanDate(parseDateKey(key))}
              </Link>
              <div className="d-flex flex-column gap-2 mt-2">
                {dayEvents.map((ev) => (
                  <EventAgendaRow key={ev.id} event={ev} isFavorited={favoritedIds.has(ev.id)} isGoing={goingIds.has(ev.id)} />
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
                    <EventAgendaRow key={ev.id} event={ev} isFavorited={favoritedIds.has(ev.id)} isGoing={goingIds.has(ev.id)} />
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

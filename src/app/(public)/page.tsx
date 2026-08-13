import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, parseDateKey, startOfDay } from "@/lib/dates";
import EventAgendaRow from "@/components/EventAgendaRow";
import { getFavoritedEventIds } from "@/lib/favorites";
import { getCurrentUser } from "@/lib/userAuth";
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

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return <LandingPage />;
  }

  const today = startOfDay(new Date());

  const [upcoming, past] = await Promise.all([
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

  const upcomingByDay = groupByDay(upcoming);
  const pastByDay = groupByDay(past);
  const favoritedIds = await getFavoritedEventIds([...upcoming, ...past].map((ev) => ev.id));

  return (
    <div>
      <div className="dot-grid pb-1">
        <span className="eyebrow">Афиша событий</span>
        <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
          Все события
        </h1>
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
                  <EventAgendaRow key={ev.id} event={ev} isFavorited={favoritedIds.has(ev.id)} />
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
                    <EventAgendaRow key={ev.id} event={ev} isFavorited={favoritedIds.has(ev.id)} />
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

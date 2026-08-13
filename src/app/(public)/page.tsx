import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, parseDateKey, startOfDay } from "@/lib/dates";
import EventAgendaRow from "@/components/EventAgendaRow";

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

  return (
    <div>
      <div className="dot-grid pb-1">
        <span className="eyebrow">Афиша событий</span>
        <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.5rem" }}>
          Все события
        </h1>
      </div>

      {upcomingByDay.size === 0 ? (
        <p className="text-secondary">Предстоящих событий пока нет.</p>
      ) : (
        <div className="d-flex flex-column gap-5" style={{ maxWidth: "42rem" }}>
          {Array.from(upcomingByDay.entries()).map(([key, dayEvents]) => (
            <section key={key}>
              <Link href={`/day/${key}`} className="day-group-heading mb-3">
                {formatHumanDate(parseDateKey(key))}
              </Link>
              <div className="d-flex flex-column gap-2 mt-3">
                {dayEvents.map((ev) => (
                  <EventAgendaRow key={ev.id} event={ev} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {pastByDay.size > 0 && (
        <div className="mt-5 pt-4" style={{ maxWidth: "42rem" }}>
          <h2
            className="small text-secondary text-uppercase mb-4"
            style={{ letterSpacing: "0.08em" }}
          >
            Архив событий
          </h2>
          <div className="d-flex flex-column gap-5 opacity-75">
            {Array.from(pastByDay.entries()).map(([key, dayEvents]) => (
              <section key={key}>
                <Link href={`/day/${key}`} className="day-group-heading mb-3">
                  {formatHumanDate(parseDateKey(key))}
                </Link>
                <div className="d-flex flex-column gap-2 mt-3">
                  {dayEvents.map((ev) => (
                    <EventAgendaRow key={ev.id} event={ev} />
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

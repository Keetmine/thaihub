import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateKey, formatHumanDate, parseDateKey, startOfDay } from "@/lib/dates";
import EventAgendaRow from "@/components/EventAgendaRow";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: startOfDay(new Date()) } },
    include: { performers: { include: { performer: true } } },
    orderBy: { startsAt: "asc" },
  });

  const eventsByDay = new Map<string, typeof events>();
  for (const ev of events) {
    const key = dateKey(ev.startsAt);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(ev);
  }

  return (
    <div>
      <span className="eyebrow">Афиша событий</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.5rem" }}>
        Все события
      </h1>

      {eventsByDay.size === 0 ? (
        <p className="text-secondary">Предстоящих событий пока нет.</p>
      ) : (
        <div className="d-flex flex-column gap-5" style={{ maxWidth: "42rem" }}>
          {Array.from(eventsByDay.entries()).map(([key, dayEvents]) => (
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
    </div>
  );
}

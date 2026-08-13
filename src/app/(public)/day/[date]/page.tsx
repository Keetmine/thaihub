import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  dateKey,
  endOfDay,
  formatHumanDate,
  parseDateKey,
  startOfDay,
} from "@/lib/dates";
import EventAgendaRow from "@/components/EventAgendaRow";
import { getFavoritedEventIds } from "@/lib/favorites";

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const day = parseDateKey(date);
  if (Number.isNaN(day.getTime())) notFound();

  const events = await prisma.event.findMany({
    where: { startsAt: { gte: startOfDay(day), lte: endOfDay(day) } },
    include: { performers: { include: { performer: true } } },
    orderBy: { startsAt: "asc" },
  });

  const prevKey = dateKey(addDays(day, -1));
  const nextKey = dateKey(addDays(day, 1));
  const favoritedIds = await getFavoritedEventIds(events.map((ev) => ev.id));

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <Link href="/calendar" className="eyebrow text-decoration-none">
            ← К календарю
          </Link>
          <h1 className="display-1-tight text-capitalize mt-3 mb-0" style={{ fontSize: "2.25rem" }}>
            {formatHumanDate(day)}
          </h1>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link href={`/day/${prevKey}`} className="btn btn-ghost btn-sm">
            ← Пред. день
          </Link>
          <Link href={`/day/${nextKey}`} className="btn btn-ghost btn-sm">
            След. день →
          </Link>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-secondary">На этот день событий нет.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {events.map((ev) => (
            <EventAgendaRow key={ev.id} event={ev} isFavorited={favoritedIds.has(ev.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

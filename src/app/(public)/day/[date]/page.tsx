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
import EventCard from "@/components/EventCard";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getCurrentUser } from "@/lib/userAuth";
import PremiumUpsell from "@/components/PremiumUpsell";
import { isPremiumActive } from "@/lib/premium";

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const day = parseDateKey(date);
  if (Number.isNaN(day.getTime())) notFound();

  // Дневной вид — часть календаря, т.е. платной функции.
  const currentUser = await getCurrentUser();
  if (!isPremiumActive(currentUser)) {
    return (
      <div>
        <Link href="/calendar" className="eyebrow text-decoration-none">
          ← К календарю
        </Link>
        <h1 className="display-1-tight text-capitalize mt-3 mb-5" style={{ fontSize: "2.25rem" }}>
          {formatHumanDate(day)}
        </h1>
        <PremiumUpsell feature="Календарь" />
      </div>
    );
  }

  const occurrences = await prisma.eventOccurrence.findMany({
    where: { startsAt: { gte: startOfDay(day), lte: endOfDay(day) } },
    include: { event: { include: { performers: { include: { performer: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const events = occurrences.map(flattenOccurrence);

  const prevKey = dateKey(addDays(day, -1));
  const nextKey = dateKey(addDays(day, 1));
  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, currentUser?.id),
    getGoingOccurrenceIds(occIds, currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occIds, friendIds);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-5">
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
        <div className="d-flex flex-column gap-3">
          {events.map((ev) => (
            <EventCard
              key={ev.occurrenceId}
              event={ev}
              isFavorited={favoritedIds.has(ev.id)}
              isGoing={goingIds.has(ev.occurrenceId)}
              friendsGoing={friendsGoingByEvent.get(ev.occurrenceId) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/dates";

// Общий подсчёт статистики пользователя — питает и вкладку «Статистика»
// (Д1), и условия ачивок (Д2). Всё считается из уже собираемых данных:
// посещения, локации, watch-статусы, поездки, друзья.

export type UserStats = {
  attendedEvents: number;
  upcomingEvents: number;
  uniqueVenues: number;
  performersSeenLive: number;
  topPerformers: { id: string; name: string; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  completedDramas: number;
  anyStatusDramas: number;
  trips: number;
  longestTripDays: number;
  daysInThailand: number;
  friends: number;
  eventsByYear: { year: number; count: number }[];
  // Флаги для ачивок
  wentWithThreeFriends: boolean;
  earlyBird: boolean;
  doubleDay: boolean;
  marathonWeek: boolean;
};

export async function computeUserStats(userId: string): Promise<UserStats> {
  const now = new Date();

  const [attendances, visits, completedDramas, anyStatusDramas, trips, friendships] =
    await Promise.all([
      prisma.eventAttendance.findMany({
        where: { userId },
        include: {
          event: {
            include: {
              occurrences: { orderBy: { startsAt: "asc" } },
              performers: { include: { performer: { select: { id: true, name: true, photoUrl: true } } } },
              attendees: { select: { userId: true } },
            },
          },
        },
      }),
      prisma.locationVisit.findMany({
        where: { userId },
        include: { location: { select: { id: true, name: true, latitude: true, longitude: true } } },
      }),
      prisma.dramaWatchStatus.count({ where: { userId, status: "COMPLETED" } }),
      prisma.dramaWatchStatus.count({ where: { userId } }),
      prisma.trip.findMany({ where: { userId } }),
      prisma.friendship.count({
        where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      }),
    ]);

  // «Посещено» = события, у которых последняя дата уже прошла.
  const attended = attendances.filter((a) => {
    const last = a.event.occurrences[a.event.occurrences.length - 1];
    return last && last.startsAt < now;
  });
  const upcoming = attendances.length - attended.length;

  const venues = new Set(attended.map((a) => a.event.venue.trim().toLowerCase()));

  const performerCounts = new Map<string, { id: string; name: string; photoUrl: string | null; count: number }>();
  for (const a of attended) {
    for (const { performer } of a.event.performers) {
      const cur = performerCounts.get(performer.id);
      if (cur) cur.count += 1;
      else performerCounts.set(performer.id, { ...performer, count: 1 });
    }
  }
  const topPerformers = Array.from(performerCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const byYear = new Map<number, number>();
  const attendedDays: string[] = [];
  for (const a of attended) {
    const first = a.event.occurrences[0];
    if (!first) continue;
    byYear.set(first.startsAt.getFullYear(), (byYear.get(first.startsAt.getFullYear()) ?? 0) + 1);
    attendedDays.push(dateKey(first.startsAt));
  }

  // «Дубль» — два посещённых события с первой датой в один день.
  const doubleDay = attendedDays.length !== new Set(attendedDays).size;

  // «Марафон» — 3 посещённых события в пределах 7 дней.
  const sortedTimes = attended
    .map((a) => a.event.occurrences[0]?.startsAt.getTime() ?? 0)
    .filter(Boolean)
    .sort((a, b) => a - b);
  let marathonWeek = false;
  for (let i = 0; i + 2 < sortedTimes.length; i++) {
    if (sortedTimes[i + 2] - sortedTimes[i] <= 7 * 24 * 60 * 60 * 1000) {
      marathonWeek = true;
      break;
    }
  }

  // «Компанией» — событие, куда шли ≥3 друзей... точнее: ≥3 других
  // посетителей-друзей не проверяем по дружбе (дорого) — считаем «шли
  // втроём+» по общему числу отметившихся, включая юзера: 4+.
  const wentWithThreeFriends = attended.some((a) => a.event.attendees.length >= 4);

  // «Ранняя пташка» — отметка «иду» раньше даты открытия продаж.
  const earlyBird = attendances.some(
    (a) => a.event.presaleAt && a.createdAt < a.event.presaleAt,
  );

  const tripDays = (t: (typeof trips)[number]) =>
    Math.round((t.endDate.getTime() - t.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const pastOrCurrentTrips = trips.filter((t) => t.startDate <= now);

  return {
    attendedEvents: attended.length,
    upcomingEvents: upcoming,
    uniqueVenues: venues.size,
    performersSeenLive: performerCounts.size,
    topPerformers,
    visitedLocations: visits.length,
    visitedLocationPins: visits
      .filter((v) => v.location.latitude != null && v.location.longitude != null)
      .map((v) => ({
        id: v.location.id,
        name: v.location.name,
        latitude: v.location.latitude!,
        longitude: v.location.longitude!,
      })),
    completedDramas,
    anyStatusDramas,
    trips: trips.length,
    longestTripDays: trips.length ? Math.max(...trips.map(tripDays)) : 0,
    daysInThailand: pastOrCurrentTrips.reduce((sum, t) => sum + tripDays(t), 0),
    friends: friendships,
    eventsByYear: Array.from(byYear.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
    wentWithThreeFriends,
    earlyBird,
    doubleDay,
    marathonWeek,
  };
}

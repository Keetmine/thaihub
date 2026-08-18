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
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
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
          occurrence: { include: { attendances: { select: { userId: true } } } },
          event: {
            include: {
              performers: { include: { performer: { select: { id: true, name: true, slug: true, photoUrl: true } } } },
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

  // «Иду» теперь per-дата: «посещено» — прошедшие отмеченные даты,
  // событие считается один раз даже при нескольких отмеченных днях.
  const attendedRows = attendances.filter((a) => a.occurrence.startsAt < now);
  const attendedEventIds = new Set(attendedRows.map((a) => a.eventId));
  const attended = Array.from(
    new Map(attendedRows.map((a) => [a.eventId, a])).values(),
  );
  const upcoming = new Set(
    attendances.filter((a) => a.occurrence.startsAt >= now).map((a) => a.eventId),
  ).size;

  const venues = new Set(attended.map((a) => a.event.venue.trim().toLowerCase()));

  const performerCounts = new Map<string, { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }>();
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
    const d = a.occurrence.startsAt;
    byYear.set(d.getFullYear(), (byYear.get(d.getFullYear()) ?? 0) + 1);
  }
  // «Дубль» — два РАЗНЫХ посещённых события в один день.
  for (const a of attendedRows) attendedDays.push(`${a.eventId}|${dateKey(a.occurrence.startsAt)}`);
  const dayToEvents = new Map<string, Set<string>>();
  for (const a of attendedRows) {
    const k = dateKey(a.occurrence.startsAt);
    if (!dayToEvents.has(k)) dayToEvents.set(k, new Set());
    dayToEvents.get(k)!.add(a.eventId);
  }

  const doubleDay = Array.from(dayToEvents.values()).some((set) => set.size >= 2);

  // «Марафон» — 3 посещённые даты в пределах 7 дней.
  const sortedTimes = attendedRows
    .map((a) => a.occurrence.startsAt.getTime())
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
  const wentWithThreeFriends = attendedRows.some((a) => a.occurrence.attendances.length >= 4);

  // «Ранняя пташка» — отметка «иду» раньше даты открытия продаж.
  const earlyBird = attendances.some(
    (a) => a.event.presaleAt && a.createdAt < a.event.presaleAt,
  );

  const tripDays = (t: (typeof trips)[number]) =>
    Math.round((t.endDate.getTime() - t.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  // «Дней в Таиланде» — только по ЗАВЕРШЁННЫМ поездкам: текущая
  // засчитается целиком после возвращения, будущие не считаются вовсе
  // (иначе метрика прожитого опыта показывала бы ещё не прожитые дни).
  const completedTrips = trips.filter((t) => t.endDate < now);

  return {
    attendedEvents: attendedEventIds.size,
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
    daysInThailand: completedTrips.reduce((sum, t) => sum + tripDays(t), 0),
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

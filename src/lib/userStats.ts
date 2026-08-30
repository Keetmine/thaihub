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
  /** Что именно стоит за счётчиками «вживую» — списки под кликабельными
   *  плитками профиля: голое число вызывало вопрос «а какие?». Дата —
   *  ISO-строкой: список уезжает в клиентский компонент как есть. */
  attendedEventsList: { id: string; slug: string | null; title: string; date: string }[];
  seenPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  completedDramas: number;
  anyStatusDramas: number;
  /** Серии и часы у экрана: по episodesWatched (у «просмотрено» без
   *  прогресса — по числу серий сериала) и длительности серии с MDL. */
  episodesWatched: number;
  hoursWatched: number;
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

  const [attendances, visits, completedDramas, watchRows, trips, friendships] =
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
      // Все статусы целиком, а не count: из них же считаются серии и
      // часы у экрана.
      prisma.dramaWatchStatus.findMany({
        where: { userId },
        select: {
          status: true,
          episodesWatched: true,
          drama: { select: { episodes: true, duration: true } },
        },
      }),
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

  // Ручные отметки «видела вживую»: концерты до регистрации на сайте,
  // случайные встречи и события, которых нет в нашей афише. Считаем
  // объединением с автоматическими — один и тот же артист, отмеченный
  // и так и так, не должен удваивать счётчик.
  const manuallySeen = await prisma.performerSeen.findMany({
    where: { userId },
    select: { performerId: true },
  });
  // Третий источник — артисты на ЛИЧНЫХ событиях поездок (фанмит, ужин
  // с актёром: таких событий в нашей афише нет). Считаются только
  // ПРОШЕДШИЕ — привязать артиста к завтрашней встрече не значит уже
  // его увидеть, — и только с СОБСТВЕННОЙ отметкой «я там буду»
  // (владелец: планов создают больше, чем посещают; в совместной
  // поездке каждый отмечается сам). Автору отметка ставится при
  // создании записи по умолчанию, бэкфилл покрыл старые записи.
  const personalEventSeen = await prisma.tripPersonalEventPerformer.findMany({
    where: {
      personalEvent: {
        startsAt: { lt: now },
        attendances: { some: { userId } },
      },
    },
    select: { performerId: true },
  });
  const seenPerformerIds = new Set([
    ...performerCounts.keys(),
    ...manuallySeen.map((m) => m.performerId),
    ...personalEventSeen.map((m) => m.performerId),
  ]);

  // Список «кого именно видели» под кликабельной плиткой профиля.
  // Карточки артистов с посещённых событий уже собраны в performerCounts;
  // у ручных отметок и личных событий там только id — дозапрашиваем.
  const extraSeenIds = [...seenPerformerIds].filter((id) => !performerCounts.has(id));
  const extraSeen = extraSeenIds.length
    ? await prisma.performer.findMany({
        where: { id: { in: extraSeenIds } },
        select: { id: true, name: true, slug: true, photoUrl: true },
      })
    : [];
  const seenPerformers = [
    ...Array.from(performerCounts.values())
      .sort((a, b) => b.count - a.count)
      .map(({ id, name, slug, photoUrl }) => ({ id, name, slug, photoUrl })),
    ...extraSeen.sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // Посещённые события списком, свежие сверху; при нескольких отмеченных
  // датах события берётся последняя посещённая.
  const latestByEvent = new Map<string, (typeof attendedRows)[number]>();
  for (const a of attendedRows) {
    const cur = latestByEvent.get(a.eventId);
    if (!cur || a.occurrence.startsAt > cur.occurrence.startsAt) latestByEvent.set(a.eventId, a);
  }
  const attendedEventsList = Array.from(latestByEvent.values())
    .sort((a, b) => b.occurrence.startsAt.getTime() - a.occurrence.startsAt.getTime())
    .map((a) => ({
      id: a.event.id,
      slug: a.event.slug,
      title: a.event.title,
      date: a.occurrence.startsAt.toISOString(),
    }));

  // Серии и часы у экрана. Длительность серии приходит с MDL текстом
  // («45 min.», «1 hr. 10 min.») — парсим; у сериалов без неё берём
  // условные 45 минут (обычная серия), поэтому часы показываются с «~».
  const minutesOf = (duration: string | null): number => {
    if (!duration) return 45;
    const hr = duration.match(/(\d+)\s*hr/)?.[1];
    const min = duration.match(/(\d+)\s*min/)?.[1];
    const total = (hr ? Number(hr) * 60 : 0) + (min ? Number(min) : 0);
    return total > 0 ? total : 45;
  };
  const watchedEpisodesOf = (row: (typeof watchRows)[number]): number =>
    Math.max(
      row.episodesWatched ?? 0,
      // «Просмотрено» без прогресса — значит, все серии сериала.
      row.status === "COMPLETED" ? (row.drama.episodes ?? 0) : 0,
    );
  const episodesWatched = watchRows.reduce((sum, r) => sum + watchedEpisodesOf(r), 0);
  const hoursWatched = Math.round(
    watchRows.reduce((sum, r) => sum + watchedEpisodesOf(r) * minutesOf(r.drama.duration), 0) / 60,
  );

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
    performersSeenLive: seenPerformerIds.size,
    attendedEventsList,
    seenPerformers,
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
    anyStatusDramas: watchRows.length,
    episodesWatched,
    hoursWatched,
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

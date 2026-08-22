import { prisma } from "@/lib/prisma";
import { endOfDay, parseDateKey, startOfDay } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import type { EventWithPerformers } from "@/lib/types";

// Постраничная выдача афиши для бесконечной прокрутки на главной: сначала
// фаза "upcoming" (от сегодня, по возрастанию), после её исчерпания —
// "past" (архив, по убыванию). При активном диапазоне дат архивной фазы
// нет — там всё показывается одним восходящим списком (см. events.md).

export const EVENT_PAGE_SIZE = 20;

export type EventListFilters = {
  filter: "all" | "going" | "favorited" | "artists";
  from: string;
  to: string;
  q: string;
};

export type EventListPhase = "upcoming" | "past";

export type FriendGoing = { id: string; name: string | null; photoUrl: string | null };

export type EventListPage = {
  events: EventWithPerformers[];
  favoritedIds: string[];
  // occurrenceId'ы, на которые юзер идёт (отметка — per-дата).
  goingIds: string[];
  // Map не сериализуется через границу server action — массив пар.
  friendsGoing: [string, FriendGoing[]][];
  // Откуда продолжать: null — всё загружено.
  next: { phase: EventListPhase; offset: number } | null;
  // true — события «заперты» подпиской: в events остались ТОЛЬКО даты
  // (остальные поля затёрты ещё на сервере), клиент рендерит
  // EventCardLocked. Реальные данные до браузера не доходят.
  locked: boolean;
};

export async function fetchEventListPage(
  userId: string | null,
  isPremium: boolean,
  filters: EventListFilters,
  phase: EventListPhase,
  offset: number,
): Promise<EventListPage> {
  const { filter, from, to, q } = filters;
  const hasDateRange = Boolean(from || to);
  const today = startOfDay(new Date());

  // Фильтры Иду/Избранное применяются прямо в SQL — при offset-пагинации
  // пост-фильтрация в JS ломала бы нумерацию страниц.
  const eventWhere = {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(filter === "favorited" && userId ? { favoritedBy: { some: { userId } } } : {}),
    // «Мои артисты» — события, где выступает кто-то из избранных
    // исполнителей (актёры, группы и маскоты — все Performer) либо
    // пейринг с их участием.
    ...(filter === "artists" && userId
      ? {
          OR: [
            { performers: { some: { performer: { favoritedBy: { some: { userId } } } } } },
            {
              pairings: {
                some: {
                  pairing: {
                    OR: [
                      { performerA: { favoritedBy: { some: { userId } } } },
                      { performerB: { favoritedBy: { some: { userId } } } },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  // «Иду» — отметка на конкретной дате, поэтому фильтр на occurrence,
  // а не на событии: показываются только выбранные дни.
  const occurrenceWhere =
    filter === "going" && userId ? { attendances: { some: { userId } } } : {};

  const startsAt = hasDateRange
    ? {
        gte: from ? startOfDay(parseDateKey(from)) : undefined,
        lte: to ? endOfDay(parseDateKey(to)) : undefined,
      }
    : phase === "upcoming"
      ? { gte: today }
      : { lt: today };

  const occurrences = await prisma.eventOccurrence.findMany({
    where: { startsAt, event: eventWhere, ...occurrenceWhere },
    include: { event: { include: { performers: { include: { performer: { select: { id: true, name: true, slug: true } } } } } } },
    orderBy: { startsAt: phase === "upcoming" ? "asc" : "desc" },
    skip: offset,
    take: EVENT_PAGE_SIZE + 1,
  });

  const hasMoreInPhase = occurrences.length > EVENT_PAGE_SIZE;
  let events = occurrences.slice(0, EVENT_PAGE_SIZE).map(flattenOccurrence);

  // Без подписки наружу уходят только даты: видно, ЧТО события есть и
  // КОГДА, но ни названий, ни площадок, ни составов в ответе нет —
  // «разблюрить» через девтулзы нечего.
  if (!isPremium) {
    events = events.map((ev) => ({
      id: "",
      occurrenceId: ev.occurrenceId,
      title: "",
      slug: null,
      venue: "",
      description: null,
      posterUrl: null,
      startsAt: ev.startsAt,
      endsAt: null,
      performers: [],
    }));
  }

  const eventIds = isPremium ? events.map((ev) => ev.id) : [];
  const occurrenceIds = isPremium ? events.map((ev) => ev.occurrenceId) : [];
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, userId),
    getGoingOccurrenceIds(occurrenceIds, userId),
    getFriendIds(userId),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occurrenceIds, friendIds);

  const next = hasMoreInPhase
    ? { phase, offset: offset + EVENT_PAGE_SIZE }
    : phase === "upcoming" && !hasDateRange
      ? { phase: "past" as const, offset: 0 }
      : null;

  return {
    events,
    favoritedIds: Array.from(favoritedIds),
    goingIds: Array.from(goingIds),
    friendsGoing: Array.from(friendsGoingByEvent.entries()),
    next,
    locked: !isPremium,
  };
}

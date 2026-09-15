import { prisma } from "@/lib/prisma";
import { catalogEventsWhere, viewerEventsWhere, viewerMeetupsWhere } from "@/lib/catalogEvents";
import { endOfDay, parseDateKey, startOfDay } from "@/lib/dates";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import {
  getFavoritedEventIds,
  getGoingOccurrenceIds,
  getMaybeOccurrenceIds,
} from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import type { EventWithPerformers } from "@/lib/types";

// Постраничная выдача афиши для бесконечной прокрутки на главной: сначала
// фаза "upcoming" (от сегодня, по возрастанию), после её исчерпания —
// "past" (архив, по убыванию). При активном диапазоне дат архивной фазы
// нет — там всё показывается одним восходящим списком (см. events.md).

export const EVENT_PAGE_SIZE = 20;

export type EventListFilters = {
  filter: "all" | "going" | "favorited" | "artists" | "communities";
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
  /** «Возможно пойду» — кандидаты, а не план: карточки рисуют их
   *  приглушённо (см. MaybeButton). */
  maybeIds: string[];
  // Map не сериализуется через границу server action — массив пар.
  friendsGoing: [string, FriendGoing[]][];
  // Откуда продолжать: null — всё загружено.
  next: { phase: EventListPhase; offset: number } | null;
  // true — события «заперты» подпиской: в events остались ТОЛЬКО даты
  // (остальные поля затёрты ещё на сервере), клиент рендерит
  // EventCardLocked. Реальные данные до браузера не доходят.
  locked: boolean;
};

/**
 * Условия выборки афиши без дат — общие для ленты и для счётчика «N
 * событий в диапазоне» над ней. Одна функция на двоих намеренно:
 * счётчик когда-то повторял эти условия своей копией и отстал от ленты
 * (забыл «Моих артистов»), показывая одно число при другом списке.
 *
 * Фильтры применяются прямо в SQL — при offset-пагинации пост-фильтрация
 * в JS ломала бы нумерацию страниц.
 */
function occurrenceFilterWhere(userId: string | null, filters: EventListFilters) {
  const { filter, q } = filters;
  const eventWhere = {
    // Что вообще попадает в ленту (см. src/lib/catalogEvents.ts):
    //
    // - обычные вкладки — только каталожные события: «пью пиво и смотрю
    //   сериал у Кати» не должно стоять рядом с концертом в Impact Arena;
    // - «Сообщества» — наоборот, ТОЛЬКО встречи, и только тех сообществ,
    //   где зритель состоит;
    // - «Я иду» — и то и другое вперемешку: человек отметился на встрече,
    //   и она обязана быть в его списке (правка владельца 2026-09-08).
    ...(filter === "communities"
      ? viewerMeetupsWhere(userId)
      : filter === "going"
        ? viewerEventsWhere(userId)
        : catalogEventsWhere()),
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
  return {
    event: eventWhere,
    // «Иду» — отметка на конкретной дате, поэтому фильтр на occurrence,
    // а не на событии: показываются только выбранные дни. Без userId
    // отметок не бывает, и вкладка отдаёт ПУСТО — по невозможному
    // условию, а не по забытому if (как viewerMeetupsWhere): раньше
    // гость на ?filter=going получал полную афишу.
    ...(filter === "going"
      ? { attendances: { some: userId ? { userId } : { userId: { in: [] } } } }
      : {}),
  };
}

/** Границы явного диапазона дат из фильтров (обе необязательны). */
function rangeStartsAt(from: string, to: string) {
  return {
    gte: from ? startOfDay(parseDateKey(from)) : undefined,
    lte: to ? endOfDay(parseDateKey(to)) : undefined,
  };
}

/**
 * Сколько всего дат событий попадает в выбранный диапазон — строка
 * «N событий в диапазоне» над лентой. Без диапазона строки нет, поэтому
 * и считать нечего.
 */
export async function countEventListRange(
  userId: string | null,
  filters: EventListFilters,
): Promise<number> {
  const { from, to } = filters;
  if (!from && !to) return 0;
  return prisma.eventOccurrence.count({
    where: { startsAt: rangeStartsAt(from, to), ...occurrenceFilterWhere(userId, filters) },
  });
}

export async function fetchEventListPage(
  userId: string | null,
  isPremium: boolean,
  filters: EventListFilters,
  phase: EventListPhase,
  offset: number,
): Promise<EventListPage> {
  const { from, to } = filters;
  const hasDateRange = Boolean(from || to);
  const today = startOfDay(new Date());

  const startsAt = hasDateRange
    ? rangeStartsAt(from, to)
    : phase === "upcoming"
      ? { gte: today }
      : { lt: today };

  const occurrences = await prisma.eventOccurrence.findMany({
    where: { startsAt, ...occurrenceFilterWhere(userId, filters) },
    include: {
      event: {
        include: {
          performers: { include: { performer: { select: { id: true, name: true, slug: true } } } },
          // Сообщество-хозяин встречи: у каталожных событий null, у
          // встреч — подпись на карточке (вкладка «Сообщества» и
          // смешанная «Я иду»). Тянем всегда, а не только под
          // filter === "communities": во вкладке «Я иду» встречи и
          // каталожные события идут вперемешку, и различать их по
          // отсутствующему полю было бы нечем.
          community: { select: { id: true, slug: true, title: true } },
        },
      },
    },
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
      // Название сообщества — тоже содержимое: наружу не уходит.
      community: null,
    }));
  }

  const eventIds = isPremium ? events.map((ev) => ev.id) : [];
  const occurrenceIds = isPremium ? events.map((ev) => ev.occurrenceId) : [];
  const [favoritedIds, goingIds, maybeIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, userId),
    getGoingOccurrenceIds(occurrenceIds, userId),
    getMaybeOccurrenceIds(occurrenceIds, userId),
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
    maybeIds: Array.from(maybeIds),
    friendsGoing: Array.from(friendsGoingByEvent.entries()),
    next,
    locked: !isPremium,
  };
}

import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { getEnabledAchievements } from "@/lib/achievements";
import { dramaHref, eventHref, novelHref, performerHref, tripHref } from "@/lib/slugHelpers";
import type { WatchStatus } from "@/generated/prisma/client";

/**
 * «Последние обновления» профиля — лента активности БЕЗ собственной
 * модели: деривация из уже существующих таблиц (решение владельца —
 * специального трекинга активности нет, как и у статистики).
 *
 * Каждый источник даёт свой тип строки; всё сливается, сортируется по
 * дате и обрезается до limit. Приватность решается ЗДЕСЬ, в выборках,
 * а не при отрисовке: зрителю чужие приватные отзывы, скрытые ачивки и
 * невидимые ему поездки не попадают даже в пропсы (см. access ниже).
 *
 * Та же деривация кормит и мини-блок «У друзей» на главной
 * (getFriendsActivity): выборки принимают СПИСОК владельцев, а не
 * одного, — иначе блоку пришлось бы дублировать всю логику источников.
 */

export type ActivityItem =
  | {
      type: "watch";
      date: Date;
      href: string;
      title: string;
      titleRu: string | null;
      status: WatchStatus;
      episodesWatched: number | null;
      episodesTotal: number | null;
      imageUrl: string | null;
    }
  | { type: "favoritePerformer"; date: Date; href: string; title: string; titleRu: null; imageUrl: string | null }
  | { type: "going"; date: Date; href: string; title: string; titleRu: null; imageUrl: string | null }
  | { type: "trip"; date: Date; href: string; title: string; titleRu: null; imageUrl: null }
  | {
      type: "review";
      date: Date;
      href: string;
      title: string;
      titleRu: string | null;
      rating: number;
      isPrivate: boolean;
      imageUrl: string | null;
    }
  | { type: "achievement"; date: Date; href: null; title: string; titleRu: null; emoji: string; imageUrl: null };

/** Строка ленты с автором — для лент, где владельцев несколько
 *  («У друзей» на главной): кто именно это сделал, решает отрисовку. */
export type UserActivityItem = ActivityItem & { userId: string };

/**
 * Что этому зрителю можно видеть — считает страница (ей известны
 * isSelf/isFriend/настройки приватности владельца и подписка зрителя),
 * лента только исполняет:
 *
 * - privateReviews — только сам владелец (правило Review.isPrivate);
 * - going — лента событий платная: сам владелец или зритель с подпиской
 *   (тот же гейт, что у блока «Идёт на события» в профиле);
 * - favoritePerformers/achievements — переключатели приватности Г8;
 * - tripVisibilities — правила видимости поездок (PUBLIC всем,
 *   FRIENDS — друзьям, PRIVATE — только себе).
 */
export type ActivityFeedAccess = {
  privateReviews: boolean;
  going: boolean;
  favoritePerformers: boolean;
  achievements: boolean;
  tripVisibilities: ("PRIVATE" | "FRIENDS" | "PUBLIC")[];
};

export async function getActivityFeed(
  userId: string,
  access: ActivityFeedAccess,
  limit = 20,
): Promise<ActivityItem[]> {
  return collectActivity([userId], access, limit);
}

/**
 * «У друзей» — те же источники по СПИСКУ друзей зрителя. Права одни на
 * всех, и это законно: в блок попадают только принятые друзья, а
 * друзьям видно всё всегда (см. комментарий к переключателям приватности
 * в модели User). Исключения те же, что в профиле: чужие приватные
 * отзывы — никогда, «иду» — только зрителю с подпиской (платная лента
 * событий), поездки — FRIENDS и PUBLIC.
 */
export async function getFriendsActivity(
  friendIds: string[],
  viewerPremium: boolean,
  limit = 3,
): Promise<UserActivityItem[]> {
  if (friendIds.length === 0) return [];
  return collectActivity(
    friendIds,
    {
      privateReviews: false,
      going: viewerPremium,
      favoritePerformers: true,
      achievements: true,
      tripVisibilities: ["FRIENDS", "PUBLIC"],
    },
    limit,
  );
}

async function collectActivity(
  userIds: string[],
  access: ActivityFeedAccess,
  limit: number,
): Promise<UserActivityItem[]> {
  const userWhere = { in: userIds };
  // Каждый источник ограничен limit'ом: после слияния всё равно
  // останется не больше limit строк, а тянуть всю историю незачем.
  const [watches, favorites, attendances, trips, reviews, achievementRows] = await Promise.all([
    prisma.dramaWatchStatus.findMany({
      where: { userId: userWhere },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        userId: true,
        status: true,
        episodesWatched: true,
        updatedAt: true,
        drama: { select: { id: true, slug: true, title: true, titleRu: true, episodes: true, posterUrl: true } },
      },
    }),
    access.favoritePerformers
      ? prisma.favoritePerformer.findMany({
          where: { userId: userWhere },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            userId: true,
            createdAt: true,
            performer: { select: { id: true, slug: true, name: true, photoUrl: true } },
          },
        })
      : [],
    access.going
      ? prisma.eventAttendance.findMany({
          // Лента активности видна друзьям (а по настройке — и всем):
          // отметка на встречу сообщества в неё не идёт, иначе название
          // домашних посиделок уехало бы наружу (см. lib/catalogEvents).
          where: { userId: userWhere, event: catalogEventsWhere() },
          orderBy: { createdAt: "desc" },
          // Отметки ставятся на конкретные даты: у двухдневного концерта
          // их две разом — берём с запасом и склеиваем по событию ниже.
          take: limit * 2,
          select: {
            userId: true,
            createdAt: true,
            eventId: true,
            event: { select: { id: true, slug: true, title: true, posterUrl: true } },
          },
        })
      : [],
    access.tripVisibilities.length > 0
      ? prisma.trip.findMany({
          where: { userId: userWhere, visibility: { in: access.tripVisibilities } },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { userId: true, id: true, slug: true, title: true, createdAt: true },
        })
      : [],
    prisma.review.findMany({
      // Чужой приватный отзыв не должен попасть даже в HTML — фильтр в
      // выборке, как везде (см. docs/features/social.md).
      where: { userId: userWhere, ...(access.privateReviews ? {} : { isPrivate: false }) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        userId: true,
        rating: true,
        isPrivate: true,
        createdAt: true,
        drama: { select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true } },
        novel: { select: { id: true, slug: true, title: true, coverUrl: true } },
        event: { select: { id: true, slug: true, title: true, posterUrl: true } },
      },
    }),
    access.achievements
      ? prisma.userAchievement.findMany({
          where: { userId: userWhere },
          orderBy: { unlockedAt: "desc" },
          take: limit,
        })
      : [],
  ]);

  const items: UserActivityItem[] = [];

  for (const w of watches) {
    items.push({
      type: "watch",
      userId: w.userId,
      date: w.updatedAt,
      href: dramaHref(w.drama),
      title: w.drama.title,
      titleRu: w.drama.titleRu,
      status: w.status,
      episodesWatched: w.episodesWatched,
      episodesTotal: w.drama.episodes,
      imageUrl: w.drama.posterUrl,
    });
  }

  for (const f of favorites) {
    items.push({
      type: "favoritePerformer",
      userId: f.userId,
      date: f.createdAt,
      href: performerHref(f.performer),
      title: f.performer.name,
      titleRu: null,
      imageUrl: f.performer.photoUrl,
    });
  }

  // «Иду» на двухдневный концерт — две строки EventAttendance за одну
  // минуту; в ленте это ОДНО событие (самая свежая отметка). Ключ — с
  // владельцем: два друга на одном событии — две честные строки.
  const goingByEvent = new Map<string, (typeof attendances)[number]>();
  for (const a of attendances) {
    const key = `${a.userId}:${a.eventId}`;
    if (!goingByEvent.has(key)) goingByEvent.set(key, a);
  }
  for (const a of goingByEvent.values()) {
    items.push({
      type: "going",
      userId: a.userId,
      date: a.createdAt,
      href: eventHref(a.event),
      title: a.event.title,
      titleRu: null,
      imageUrl: a.event.posterUrl,
    });
  }

  for (const trip of trips) {
    items.push({
      type: "trip",
      userId: trip.userId,
      date: trip.createdAt,
      href: tripHref(trip),
      title: trip.title,
      titleRu: null,
      imageUrl: null,
    });
  }

  for (const r of reviews) {
    const target = r.drama
      ? { href: dramaHref(r.drama), title: r.drama.title, titleRu: r.drama.titleRu, imageUrl: r.drama.posterUrl }
      : r.novel
        ? { href: novelHref(r.novel), title: r.novel.title, titleRu: null, imageUrl: r.novel.coverUrl }
        : r.event
          ? { href: eventHref(r.event), title: r.event.title, titleRu: null, imageUrl: r.event.posterUrl }
          : null;
    if (!target) continue; // осиротевший отзыв без записи
    items.push({
      type: "review",
      userId: r.userId,
      date: r.createdAt,
      rating: r.rating,
      isPrivate: r.isPrivate,
      ...target,
    });
  }

  if (achievementRows.length > 0) {
    // Названия ачивок живут в БД (модель Achievement); выключенные в
    // админке не показываем — как и везде.
    const defs = await getEnabledAchievements();
    const byKey = new Map(defs.map((d) => [d.key, d]));
    for (const row of achievementRows) {
      const def = byKey.get(row.key);
      if (!def) continue;
      items.push({
        type: "achievement",
        userId: row.userId,
        date: row.unlockedAt,
        href: null,
        title: def.title,
        titleRu: null,
        emoji: def.emoji,
        imageUrl: null,
      });
    }
  }

  return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}

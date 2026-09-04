import { prisma } from "@/lib/prisma";
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
    }
  | { type: "favoritePerformer"; date: Date; href: string; title: string; titleRu: null }
  | { type: "going"; date: Date; href: string; title: string; titleRu: null }
  | { type: "trip"; date: Date; href: string; title: string; titleRu: null }
  | {
      type: "review";
      date: Date;
      href: string;
      title: string;
      titleRu: string | null;
      rating: number;
      isPrivate: boolean;
    }
  | { type: "achievement"; date: Date; href: null; title: string; titleRu: null; emoji: string };

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
  // Каждый источник ограничен limit'ом: после слияния всё равно
  // останется не больше limit строк, а тянуть всю историю незачем.
  const [watches, favorites, attendances, trips, reviews, achievementRows] = await Promise.all([
    prisma.dramaWatchStatus.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        status: true,
        episodesWatched: true,
        updatedAt: true,
        drama: { select: { id: true, slug: true, title: true, titleRu: true, episodes: true } },
      },
    }),
    access.favoritePerformers
      ? prisma.favoritePerformer.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            createdAt: true,
            performer: { select: { id: true, slug: true, name: true } },
          },
        })
      : [],
    access.going
      ? prisma.eventAttendance.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          // Отметки ставятся на конкретные даты: у двухдневного концерта
          // их две разом — берём с запасом и склеиваем по событию ниже.
          take: limit * 2,
          select: {
            createdAt: true,
            eventId: true,
            event: { select: { id: true, slug: true, title: true } },
          },
        })
      : [],
    access.tripVisibilities.length > 0
      ? prisma.trip.findMany({
          where: { userId, visibility: { in: access.tripVisibilities } },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, slug: true, title: true, createdAt: true },
        })
      : [],
    prisma.review.findMany({
      // Чужой приватный отзыв не должен попасть даже в HTML — фильтр в
      // выборке, как везде (см. docs/features/social.md).
      where: { userId, ...(access.privateReviews ? {} : { isPrivate: false }) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        rating: true,
        isPrivate: true,
        createdAt: true,
        drama: { select: { id: true, slug: true, title: true, titleRu: true } },
        novel: { select: { id: true, slug: true, title: true } },
        event: { select: { id: true, slug: true, title: true } },
      },
    }),
    access.achievements
      ? prisma.userAchievement.findMany({
          where: { userId },
          orderBy: { unlockedAt: "desc" },
          take: limit,
        })
      : [],
  ]);

  const items: ActivityItem[] = [];

  for (const w of watches) {
    items.push({
      type: "watch",
      date: w.updatedAt,
      href: dramaHref(w.drama),
      title: w.drama.title,
      titleRu: w.drama.titleRu,
      status: w.status,
      episodesWatched: w.episodesWatched,
      episodesTotal: w.drama.episodes,
    });
  }

  for (const f of favorites) {
    items.push({
      type: "favoritePerformer",
      date: f.createdAt,
      href: performerHref(f.performer),
      title: f.performer.name,
      titleRu: null,
    });
  }

  // «Иду» на двухдневный концерт — две строки EventAttendance за одну
  // минуту; в ленте это ОДНО событие (самая свежая отметка).
  const goingByEvent = new Map<string, (typeof attendances)[number]>();
  for (const a of attendances) {
    if (!goingByEvent.has(a.eventId)) goingByEvent.set(a.eventId, a);
  }
  for (const a of goingByEvent.values()) {
    items.push({
      type: "going",
      date: a.createdAt,
      href: eventHref(a.event),
      title: a.event.title,
      titleRu: null,
    });
  }

  for (const trip of trips) {
    items.push({
      type: "trip",
      date: trip.createdAt,
      href: tripHref(trip),
      title: trip.title,
      titleRu: null,
    });
  }

  for (const r of reviews) {
    const target = r.drama
      ? { href: dramaHref(r.drama), title: r.drama.title, titleRu: r.drama.titleRu }
      : r.novel
        ? { href: novelHref(r.novel), title: r.novel.title, titleRu: null }
        : r.event
          ? { href: eventHref(r.event), title: r.event.title, titleRu: null }
          : null;
    if (!target) continue; // осиротевший отзыв без записи
    items.push({
      type: "review",
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
        date: row.unlockedAt,
        href: null,
        title: def.title,
        titleRu: null,
        emoji: def.emoji,
      });
    }
  }

  return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}

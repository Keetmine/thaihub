/**
 * «Популярное» — сериалы по НАШЕЙ средней оценке (аудит 2026-09, п.6.5;
 * название — правка владельца 2026-09-10: «народный топ» звучал как
 * конкурс). Среднее считает `fetchSiteScores` — тот же источник правды,
 * что и оценка на странице сериала: разъехавшиеся цифры на карточке и в
 * топе читались бы как баг.
 *
 * Порог — MIN_VOTES оценок на тайтл: среднее по одному голосу это не
 * «наша оценка», а чьё-то мнение. Оценок на сайте пока немного, так что
 * список выходит коротким — и это честнее длинного, надутого единичными
 * десятками. Если под порог не попадает ВООБЩЕ ничего, показываем то,
 * что чаще всего смотрят и досматривают (`byRatings: false`).
 *
 * Модуль отдельно от страницы с 2026-09-16: тот же топ показывает
 * витрина каталога (/dramas) короткой лентой постеров, а считать его
 * двумя способами — как раз тот случай, когда цифры разъезжаются молча.
 */
import { prisma } from "@/lib/prisma";
import { fetchSiteScores } from "@/lib/dramaRating";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";

/** Минимум голосов, чтобы попасть в топ. */
export const MIN_VOTES = 3;
/** Потолок списка — на вырост: сейчас строк сильно меньше. */
export const TOP_LIMIT = 50;

export type TopRow = {
  id: string;
  slug: string | null;
  title: string;
  titleRu: string | null;
  posterUrl: string | null;
  year: number | null;
  /** Средняя оценка сайта; null — фолбэк-режим (топ по числу отметок). */
  score: number | null;
  /** Голоса (в топе по оценкам) или зрители (в фолбэке). */
  votes: number;
};

const DRAMA_SELECT = {
  id: true,
  slug: true,
  title: true,
  titleRu: true,
  posterUrl: true,
  year: true,
} as const;

/**
 * Список один на всех зрителей — из кэша (П-1, как соседние гостевые
 * выборки /dramas). Тег catalog сбрасывает его при правках каталога, а
 * свежая оценка доедет с TTL — топ не то место, где это критично.
 */
export const getPeopleTop = unstable_cache(
  async (): Promise<{ byRatings: boolean; rows: TopRow[] }> => {
    // Кандидаты — сериалы, у которых вообще есть оценки (звёзды или
    // публичные отзывы): оценок на сайте немного, оба запроса узкие, а
    // само среднее считает fetchSiteScores — единственный источник
    // правды про «нашу оценку».
    const [starred, reviewed] = await Promise.all([
      prisma.dramaWatchStatus.findMany({
        where: { rating: { not: null } },
        select: { dramaId: true },
        distinct: ["dramaId"],
      }),
      prisma.review.findMany({
        where: { isPrivate: false, dramaId: { not: null } },
        select: { dramaId: true },
        distinct: ["dramaId"],
      }),
    ]);
    const candidateIds = Array.from(
      new Set([...starred.map((s) => s.dramaId), ...reviewed.map((r) => r.dramaId!)]),
    );
    const scores = await fetchSiteScores(candidateIds);
    const qualified = Array.from(scores.entries())
      .filter(([, s]) => s.siteCount >= MIN_VOTES)
      // При равных средних выше тот, кого оценило больше людей; хвост
      // добивается по id, чтобы порядок не плавал между перерисовками.
      .sort(
        (a, b) =>
          b[1].site - a[1].site ||
          b[1].siteCount - a[1].siteCount ||
          a[0].localeCompare(b[0]),
      )
      .slice(0, TOP_LIMIT);

    if (qualified.length > 0) {
      const dramas = await prisma.drama.findMany({
        where: { id: { in: qualified.map(([id]) => id) } },
        select: DRAMA_SELECT,
      });
      const byId = new Map(dramas.map((d) => [d.id, d]));
      return {
        byRatings: true,
        rows: qualified.flatMap(([id, s]) => {
          const drama = byId.get(id);
          // Осиротевшая оценка без сериала — пропускаем строку.
          if (!drama) return [];
          return [{ ...drama, score: s.site, votes: s.siteCount }];
        }),
      };
    }

    // Фолбэк: под порог не попал никто — топ по числу отметок «смотрю /
    // досмотрено». «В планах» не в счёт: туда складывают ещё не
    // выбранное, а смотримое и досмотренное — уже выбор.
    const marks = await prisma.dramaWatchStatus.groupBy({
      by: ["dramaId"],
      where: { status: { in: ["WATCHING", "COMPLETED"] } },
      _count: { dramaId: true },
      orderBy: [{ _count: { dramaId: "desc" } }, { dramaId: "asc" }],
      take: TOP_LIMIT,
    });
    const dramas = await prisma.drama.findMany({
      where: { id: { in: marks.map((m) => m.dramaId) } },
      select: DRAMA_SELECT,
    });
    const byId = new Map(dramas.map((d) => [d.id, d]));
    return {
      byRatings: false,
      rows: marks.flatMap((m) => {
        const drama = byId.get(m.dramaId);
        if (!drama) return [];
        return [{ ...drama, score: null, votes: m._count.dramaId }];
      }),
    };
  },
  ["dramas-people-top"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

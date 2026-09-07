import { prisma } from "@/lib/prisma";

/**
 * Оценки сериала: наша и сводная (правка владельца 2026-09-07).
 *
 * Оценок у сериала стало три вида, и путать их нельзя:
 *
 * - **своя** — `DramaWatchStatus.rating`, личная отметка человека (АА2);
 * - **наша** — среднее по всем людям на сайте;
 * - **MyDramaList** — `Drama.mdlScore`, чужая, приезжает импортом.
 *
 * Ответ на вопрос «оценка и отзыв — они складываются?»: да, но **один
 * человек считается один раз**. У человека может быть и звёздочка, и
 * отзыв с оценкой — это одно и то же мнение, высказанное дважды, и
 * учитывать его как два голоса нечестно. Приоритет у звёздочки: её
 * ставят позже и меняют чаще, а оценку в отзыве переписывают редко.
 *
 * Приватные отзывы в среднее не входят — то же правило, что было до
 * этого модуля: невидимая оценка, двигающая публичное среднее, вызывала
 * бы вопросы. А вот своя оценка входит, хоть её и не видно поимённо:
 * это ровно тот же публичный сигнал, что «звёздочки» на любом каталоге,
 * просто без текста.
 */

/** Сводка по одному сериалу. */
export type DramaScore = {
  /** Среднее по сайту; null — никто не оценил. */
  site: number | null;
  /** Сколько человек оценило (для подписи «(3)»). */
  siteCount: number;
  /** Оценка MyDramaList — как есть. */
  mdl: number | null;
  /** Что показываем одним числом: наши оценки и MDL, взвешенные по
   *  числу голосов. */
  combined: number | null;
};

/** Округление до десятой — показываем «8.4», а не «8.400000000001». */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Сколькими голосами считать оценку MyDramaList (правка владельца
 * 2026-09-07).
 *
 * Первая версия брала ровное среднее двух чисел — и владелец сразу
 * поймала беду: «у MDL 7.5 на тысяче отзывов, у нас один отзыв на 10 —
 * и стало 8.5, как будто один голос стоит тысячи». Так и было.
 *
 * Теперь оценка MDL входит в среднее как MDL_VOTES голосов, а наши —
 * как есть. Один наш голос почти не двигает итог, двадцать весят
 * наравне с MDL, дальше перевешивают. Число подобрано под размер сайта
 * — это единственная ручка, крутить её тут.
 */
const MDL_VOTES = 20;

/**
 * Сводное число: наши оценки и MyDramaList, взвешенные по числу
 * голосов. Пока у нас никто не оценил — просто MDL, и наоборот.
 */
export function combineScores(
  site: number | null,
  siteCount: number,
  mdl: number | null,
): number | null {
  if (site != null && mdl != null && siteCount > 0) {
    return round1((site * siteCount + mdl * MDL_VOTES) / (siteCount + MDL_VOTES));
  }
  if (site != null && siteCount > 0) return round1(site);
  if (mdl != null) return round1(mdl);
  return null;
}

/**
 * Наши оценки для списка сериалов — одним заходом на каждую таблицу.
 *
 * Считаем в JS, а не двумя groupBy: дедупликация «один человек — один
 * голос» требует знать, КТО оценил, а не только среднее. Строк тут
 * немного: это оценки конкретных сериалов страницы, а не всей базы.
 */
export async function fetchSiteScores(
  dramaIds: string[],
): Promise<Map<string, { site: number; siteCount: number }>> {
  if (dramaIds.length === 0) return new Map();

  const [stars, reviews] = await Promise.all([
    prisma.dramaWatchStatus.findMany({
      where: { dramaId: { in: dramaIds }, rating: { not: null } },
      select: { dramaId: true, userId: true, rating: true },
    }),
    prisma.review.findMany({
      where: { dramaId: { in: dramaIds }, isPrivate: false },
      select: { dramaId: true, userId: true, rating: true },
    }),
  ]);

  return mergeVotes(
    stars.filter((r): r is typeof r & { rating: number } => r.rating != null),
    reviews.filter((r): r is typeof r & { dramaId: string } => !!r.dramaId),
  );
}

/**
 * Свести звёздочки и отзывы в среднее по каждому сериалу.
 *
 * Вынесено чистой функцией — тут вся суть правила «один человек — один
 * голос», и проверять её удобнее без базы (tests/unit/dramaRating.test.ts).
 * Звёздочка человека перебивает его же отзыв.
 */
export function mergeVotes(
  stars: { dramaId: string; userId: string; rating: number }[],
  reviews: { dramaId: string; userId: string; rating: number }[],
): Map<string, { site: number; siteCount: number }> {
  const out = new Map<string, { site: number; siteCount: number }>();
  const byDrama = new Map<string, Map<string, number>>();
  for (const row of stars) {
    const users = byDrama.get(row.dramaId) ?? new Map<string, number>();
    users.set(row.userId, row.rating);
    byDrama.set(row.dramaId, users);
  }
  for (const row of reviews) {
    const users = byDrama.get(row.dramaId) ?? new Map<string, number>();
    if (!users.has(row.userId)) users.set(row.userId, row.rating);
    byDrama.set(row.dramaId, users);
  }

  for (const [dramaId, users] of byDrama) {
    if (users.size === 0) continue;
    const sum = [...users.values()].reduce((a, b) => a + b, 0);
    out.set(dramaId, { site: round1(sum / users.size), siteCount: users.size });
  }
  return out;
}

/** То же для одного сериала — вместе с MDL и сводным числом. */
export async function fetchDramaScore(
  dramaId: string,
  mdlScore: number | null,
): Promise<DramaScore> {
  const site = (await fetchSiteScores([dramaId])).get(dramaId) ?? null;
  return {
    site: site?.site ?? null,
    siteCount: site?.siteCount ?? 0,
    mdl: mdlScore,
    combined: combineScores(site?.site ?? null, site?.siteCount ?? 0, mdlScore),
  };
}

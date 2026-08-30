import { prisma } from "@/lib/prisma";

// Рекомендации «понравился X — посмотрите Y» (З4): блок на странице
// сериала. Первая итерация — по пересечению каста и жанров/тегов,
// как и планировалось: коллаборативной фильтрации не из чего строить,
// а общий актёр в BL-нише — самый сильный сигнал «зайдёт то же».

export type SimilarDrama = {
  id: string;
  slug: string | null;
  title: string;
  titleRu: string | null;
  posterUrl: string | null;
  year: number | null;
  status: string | null;
  /** Почему порекомендовали — для подписи под карточкой. */
  sharedCast: number;
  sharedGenres: string[];
};

/**
 * Похожие сериалы. Скоринг: общий актёр — 3 очка, общий жанр — 1,
 * общий тег — 1 (не больше трёх: у MDL тегов десятки, и длинные
 * списки перевешивали бы каст). Порог 2 отсекает совпадение по одному
 * дежурному жанру («Romance» есть у всего каталога). Ничьи решает
 * оценка MDL — из равнопохожего предлагаем лучшее.
 */
export async function findSimilarDramas(
  source: {
    id: string;
    genres: string[];
    tags: string[];
    performerIds: string[];
    /** Уже показанные на странице связанные тайтлы — сиквелы и т.п.:
     *  рекомендовать их второй раз бессмысленно. */
    excludeIds: string[];
  },
  limit = 6,
): Promise<SimilarDrama[]> {
  const or = [
    source.performerIds.length
      ? { performers: { some: { performerId: { in: source.performerIds } } } }
      : null,
    source.genres.length ? { genres: { hasSome: source.genres } } : null,
    source.tags.length ? { tags: { hasSome: source.tags } } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);
  if (or.length === 0) return [];

  const candidates = await prisma.drama.findMany({
    where: {
      id: { notIn: [source.id, ...source.excludeIds] },
      OR: or,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      titleRu: true,
      posterUrl: true,
      year: true,
      status: true,
      genres: true,
      tags: true,
      mdlScore: true,
      performers: {
        where: { performerId: { in: source.performerIds } },
        select: { performerId: true },
      },
    },
  });

  const genreSet = new Set(source.genres);
  const tagSet = new Set(source.tags);
  return candidates
    .map((c) => {
      const sharedGenres = c.genres.filter((g) => genreSet.has(g));
      const sharedTags = c.tags.filter((t) => tagSet.has(t));
      const sharedCast = c.performers.length;
      const score = sharedCast * 3 + sharedGenres.length + Math.min(sharedTags.length, 3);
      return { c, sharedCast, sharedGenres, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || (b.c.mdlScore ?? 0) - (a.c.mdlScore ?? 0))
    .slice(0, limit)
    .map(({ c, sharedCast, sharedGenres }) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      titleRu: c.titleRu,
      posterUrl: c.posterUrl,
      year: c.year,
      status: c.status,
      sharedCast,
      sharedGenres,
    }));
}

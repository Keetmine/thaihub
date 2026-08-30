import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CATALOG_TAG } from "@/lib/catalogCache";

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

type SimilarSource = {
  id: string;
  genres: string[];
  tags: string[];
  performerIds: string[];
  /** Уже показанные на странице связанные тайтлы — сиквелы и т.п.:
   *  рекомендовать их второй раз бессмысленно. */
  excludeIds: string[];
};

/** Верхняя граница кандидатов из SQL-предфильтра: страховка от
 *  вырожденных случаев (дежурный жанр у половины каталога). */
const CANDIDATE_LIMIT = 400;

/**
 * Кандидаты выбираются предфильтром в SQL, а не findMany с OR по
 * hasSome: прежний запрос вытягивал почти весь каталог (жанр «Romance»
 * есть у всего) на каждый просмотр страницы. Условие предфильтра — то
 * же, что финальный порог score >= 2: общий актёр (3 очка) проходит
 * всегда, а по жанрам/тегам нужно >= 2 совпадений (теги считаются
 * максимум за 3, как в скоринге).
 */
async function findCandidateIds(source: SimilarSource): Promise<string[]> {
  const excludeIds = [source.id, ...source.excludeIds];
  const castCount = source.performerIds.length
    ? Prisma.sql`(SELECT count(*) FROM "PerformerDrama" pd
        WHERE pd."dramaId" = d.id
          AND pd."performerId" IN (${Prisma.join(source.performerIds)}))`
    : Prisma.sql`0`;
  const genreCount = source.genres.length
    ? Prisma.sql`(SELECT count(*) FROM unnest(d.genres) g
        WHERE g IN (${Prisma.join(source.genres)}))`
    : Prisma.sql`0`;
  const tagCount = source.tags.length
    ? Prisma.sql`LEAST((SELECT count(*) FROM unnest(d.tags) tg
        WHERE tg IN (${Prisma.join(source.tags)})), 3)`
    : Prisma.sql`0`;

  // Сортировка — тем же скорингом, что финальный (актёр 3, жанр 1, тег
  // 1 максимум за 3), с той же разрешалкой ничьих (mdlScore): LIMIT
  // тогда срезает заведомо худший хвост, а не случайное подмножество.
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT d.id,
           ${castCount} * 3 + ${genreCount} + ${tagCount} AS score
    FROM "Drama" d
    WHERE d.id NOT IN (${Prisma.join(excludeIds)})
      AND ${castCount} * 3 + ${genreCount} + ${tagCount} >= 2
    ORDER BY score DESC, d."mdlScore" DESC NULLS LAST
    LIMIT ${CANDIDATE_LIMIT}
  `);
  return rows.map((r) => r.id);
}

/**
 * Скоринг: общий актёр — 3 очка, общий жанр — 1, общий тег — 1 (не
 * больше трёх: у MDL тегов десятки, и длинные списки перевешивали бы
 * каст). Порог 2 отсекает совпадение по одному дежурному жанру
 * («Romance» есть у всего каталога). Ничьи решает оценка MDL — из
 * равнопохожего предлагаем лучшее.
 */
async function computeSimilarDramas(
  source: SimilarSource,
  limit: number,
): Promise<SimilarDrama[]> {
  if (!source.performerIds.length && !source.genres.length && !source.tags.length) {
    return [];
  }

  const candidateIds = await findCandidateIds(source);
  if (candidateIds.length === 0) return [];

  const candidates = await prisma.drama.findMany({
    where: { id: { in: candidateIds } },
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

// Результат одинаков для всех зрителей страницы — кэшируем (аргументы
// функции входят в ключ кэша, так что записей по одной на сериал);
// правка каталога сбрасывает раньше TTL через тег (logAudit →
// invalidateCatalogCache).
const cachedSimilarDramas = unstable_cache(
  computeSimilarDramas,
  ["similar-dramas"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Похожие сериалы (до `limit` карточек с причиной рекомендации). */
export async function findSimilarDramas(
  source: SimilarSource,
  limit = 6,
): Promise<SimilarDrama[]> {
  return cachedSimilarDramas(source, limit);
}

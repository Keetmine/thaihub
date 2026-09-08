import AppLink from "@/components/AppLink";
import PageHeader from "@/components/PageHeader";
import UploadImage from "@/components/UploadImage";
import { StarIcon } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { fetchSiteScores } from "@/lib/dramaRating";
import { ratingColor } from "@/lib/ratingColor";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";

/**
 * Народный топ MyBLHub (аудит 2026-09, п.6.5): сериалы по НАШЕЙ средней
 * оценке — той же, что стоит на странице сериала (src/lib/dramaRating.ts,
 * правило «один человек — один голос»). Второго способа посчитать
 * среднее здесь нет намеренно: разъехавшиеся цифры на карточке и в топе
 * читались бы как баг.
 *
 * Порог — MIN_VOTES оценок на тайтл: среднее по одному голосу — это не
 * «наша оценка», а чьё-то мнение. Оценок на сайте пока немного, так что
 * список выходит коротким — и это честнее длинного, надутого единичными
 * десятками. Если под порог не попадает ВООБЩЕ ничего, показываем то,
 * что чаще всего смотрят и досматривают, — с честной подводкой, а не
 * пустую страницу.
 *
 * Страница открыта гостю и индексируема — это витрина, как /dramas.
 */

export const dynamic = "force-dynamic";

/** Минимум голосов, чтобы попасть в топ. */
const MIN_VOTES = 3;
/** Потолок списка — на вырост: сейчас строк сильно меньше. */
const TOP_LIMIT = 50;

export async function generateMetadata() {
  const { t, locale } = await getT();
  return pageMetadata({
    title: t.catalog.dramasTop.metaTitle,
    description: t.catalog.dramasTop.metaDescription,
    path: "/dramas/top",
    locale,
  });
}

type TopRow = {
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
const getPeopleTop = unstable_cache(
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

export default async function DramasTopPage() {
  const { t, locale } = await getT();
  const d = t.catalog.dramasTop;
  const top = await getPeopleTop();

  return (
    <div>
      <PageHeader eyebrow={t.catalog.eyebrow} title={d.title} />
      <p className="mb-2">
        <AppLink href="/dramas">{t.catalog.letterBack}</AppLink>
      </p>
      {/* Подводка честно называет правило списка — в том числе в
          фолбэке, когда оценок с порогом ещё нет. */}
      <p className="small text-secondary mb-4" style={{ maxWidth: "40rem" }}>
        {top.byRatings ? d.intro(MIN_VOTES) : d.fallbackIntro(MIN_VOTES)}
      </p>
      {!top.byRatings && top.rows.length > 0 && (
        <h2 className="section-heading mb-2">{d.fallbackHeading}</h2>
      )}

      {top.rows.length === 0 ? (
        <p className="text-secondary">{d.empty}</p>
      ) : (
        <ol className="list-unstyled d-flex flex-column gap-2 mb-0">
          {top.rows.map((row, i) => (
            <li key={row.id}>
              <AppLink
                href={dramaHref(row)}
                className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-2"
              >
                {/* Номер места — фиксированной ширины, чтобы постеры
                    стояли колонкой и на двузначных номерах. */}
                <span
                  className="font-display fw-semibold text-secondary text-center flex-shrink-0"
                  style={{ width: "2rem" }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span
                  className="flex-shrink-0 d-inline-flex align-items-center justify-content-center overflow-hidden"
                  style={{
                    width: "2.4rem",
                    height: "3.2rem",
                    borderRadius: "0.35rem",
                    background: "var(--bs-secondary-bg)",
                  }}
                  aria-hidden={!row.posterUrl}
                >
                  {row.posterUrl ? (
                    <UploadImage
                      src={row.posterUrl}
                      alt=""
                      sizes="3rem"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span className="font-display fw-bold text-secondary">
                      {dramaTitleForLocale(row, locale).trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="flex-grow-1" style={{ minWidth: 0 }}>
                  <span className="font-display fw-medium text-white d-block text-truncate">
                    {dramaTitleForLocale(row, locale)}
                  </span>
                  {row.year && <span className="small text-secondary">{row.year}</span>}
                </span>
                <span className="small text-secondary flex-shrink-0 text-end">
                  {row.score != null ? (
                    <>
                      {/* Та же подача, что строка «Наша оценка» на
                          странице сериала: звезда, цветная цифра, число
                          голосов в скобках. */}
                      <StarIcon className="rating-star" filled />{" "}
                      <span style={{ color: ratingColor(row.score) }}>
                        {row.score.toFixed(1)}
                      </span>{" "}
                      ({d.votes(row.votes)})
                    </>
                  ) : (
                    d.watchers(row.votes)
                  )}
                </span>
              </AppLink>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

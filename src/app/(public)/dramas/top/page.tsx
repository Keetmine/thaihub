import AppLink from "@/components/AppLink";
import PageHeader from "@/components/PageHeader";
import UploadImage from "@/components/UploadImage";
import { StarIcon } from "@/components/icons";
import { ratingColor } from "@/lib/ratingColor";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { getPeopleTop, MIN_VOTES } from "@/lib/peopleTop";

/**
 * Страница «Популярное» (/dramas/top). Сам расчёт — в
 * `src/lib/peopleTop.ts`: тем же топом живёт лента на витрине каталога,
 * и считать его двумя способами нельзя. Здесь остались только разметка
 * и подводка.
 *
 * Страница открыта гостю и индексируема — это витрина, как /dramas.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t, locale } = await getT();
  return pageMetadata({
    title: t.catalog.dramasTop.metaTitle,
    description: t.catalog.dramasTop.metaDescription,
    path: "/dramas/top",
    locale,
  });
}

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
      {/* Подводка честно называет правило списка. В фолбэке её НЕТ
          (правка владельца 2026-09-10): объяснение, что оценок пока мало
          и поэтому список другой, — это разговор о нашей кухне, а не о
          сериалах. Что список про смотримое, говорит его заголовок. */}
      {top.byRatings && (
        <p className="small text-secondary mb-4" style={{ maxWidth: "40rem" }}>
          {d.intro(MIN_VOTES)}
        </p>
      )}
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

      {/* Список короткий по построению (порог голосов), и упираться в
          его конец некуда — отправляем в поиск с фильтрами (правка
          владельца 2026-09-10). Раздел задан заранее: пришли за
          сериалами, а поиск умеет и людей, и события. */}
      <div className="mt-4">
        <AppLink href="/search?section=dramas" className="btn btn-ghost btn-sm">
          {d.searchMore} →
        </AppLink>
      </div>
    </div>
  );
}

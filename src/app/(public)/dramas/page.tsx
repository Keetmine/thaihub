import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import DramaStatusButton from "@/components/DramaStatusButton";
import { getCurrentUser } from "@/lib/userAuth";
import { WATCH_STATUS_LABELS, WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { getDramaWatchStatuses } from "@/lib/favorites";
import type { DramaWatchStatusValue } from "../favorites/actions";
import { SEARCH_RESULT_LIMIT } from "@/lib/pagination";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleWhere } from "@/lib/searchWhere";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Сериалы",
  description:
    "Тайские BL-сериалы: описания, актёрский состав, годы выхода и места съёмок.",
  path: "/dramas",
});


export const dynamic = "force-dynamic";

export default async function DramasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q: rawQ, status: rawStatus } = await searchParams;
  const q = (rawQ ?? "").trim();
  // Ж5: поисковый запрос всегда ищет по всему каталогу — вкладка
  // статуса на время поиска сбрасывается на «Все». Раньше запрос и
  // вкладка комбинировались, и поиск «внутри вкладки» выглядел как
  // сломанный (нашлось 0, хотя сериал в каталоге есть).
  const status =
    !q && WATCH_STATUS_ORDER.includes(rawStatus as DramaWatchStatusValue)
      ? (rawStatus as DramaWatchStatusValue)
      : null;

  const currentUser = await getCurrentUser();

  // The catalog has grown into the thousands of dramas — loading and
  // rendering all of them by default made the page painfully slow.
  // Without a search term, show only dramas already marked with some
  // watch status; the full catalog is reachable through search instead
  // of one giant always-rendered list.
  const searchResults = q
    ? await prisma.drama.findMany({
        where: dramaTitleWhere(q),
        orderBy: { title: "asc" },
        take: SEARCH_RESULT_LIMIT + 1,
      })
    : null;
  const searchTruncated = !!searchResults && searchResults.length > SEARCH_RESULT_LIMIT;

  const dramas = searchResults
    ? searchResults.slice(0, SEARCH_RESULT_LIMIT)
    : currentUser
      ? await prisma.drama.findMany({
          where: {
            watchStatuses: {
              some: status ? { userId: currentUser.id, status } : { userId: currentUser.id },
            },
          },
          orderBy: { title: "asc" },
        })
      : // Анониму (каталог открыт для SEO) — свежие по дате эфира, а не
        // пустой список «ваших статусов».
        await prisma.drama.findMany({
          where: { airedFrom: { not: null } },
          orderBy: { airedFrom: "desc" },
          take: 60,
        });

  const statusByDramaId = await getDramaWatchStatuses(
    dramas.map((d) => d.id),
    currentUser?.id,
  );

  // Средние оценки из отзывов — бейджем в строке каталога.
  const ratings = await prisma.review.groupBy({
    by: ["dramaId"],
    where: { dramaId: { in: dramas.map((d) => d.id) } },
    _avg: { rating: true },
  });
  const ratingByDramaId = new Map(
    ratings.filter((r) => r.dramaId).map((r) => [r.dramaId as string, r._avg.rating as number]),
  );


  return (
    <div>
      <PageHeader eyebrow="Каталог" title="Сериалы" size="lg" className="mb-5" watermark="Series" />

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={`/dramas?${q ? `q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${!status ? "active" : ""}`}
          >
            Все
          </Link>
          {currentUser && WATCH_STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={`/dramas?status=${s}`}
              prefetch={false}
              className={`tab-bar-item ${status === s ? "active" : ""}`}
            >
              {WATCH_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <NameSearchBox
          action="/dramas"
          q={q}
          placeholder="Поиск по названию…"
          className=""
        />
      </div>

      {q && (
        <p className="small text-secondary mb-3">
          Поиск идёт по всему каталогу, независимо от вкладок.
        </p>
      )}

      {searchTruncated && (
        <p className="small text-secondary mb-3">
          Показаны первые {SEARCH_RESULT_LIMIT} результатов — уточните запрос, чтобы увидеть более точные совпадения.
        </p>
      )}

      {/* Список строками, а не постерная сетка: сериалов много одиночных,
          карточки съедали место, а длинные названия обрезались. Строка как
          в списках друзей/админки: миниатюра постера, название целиком
          (с переносом), год и рейтинг в подстроке. */}
      <AlphabetIndexList
        items={dramas.map((d) => ({ id: d.id, name: d.title, drama: d }))}
        emptyMessage={
          q ? "Ничего не найдено." : "Пока нет отмеченных сериалов. Используйте поиск, чтобы найти сериал."
        }
        renderItem={({ drama: d }) => {
          const rating = ratingByDramaId.get(d.id);
          const subline = [d.year, rating != null ? `★ ${rating.toFixed(1)}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={d.id}
              className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <Link
                href={dramaHref(d)}
                className="text-decoration-none d-flex align-items-center gap-3"
                style={{ minWidth: 0 }}
              >
                <div
                  style={{
                    width: "2.75rem",
                    height: "3.75rem",
                    borderRadius: "0.5rem",
                    background: "var(--bs-secondary-bg)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {d.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      loading="lazy"
                      decoding="async"
                      src={d.posterUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      className="d-flex align-items-center justify-content-center h-100 font-display fw-bold"
                      style={{ fontSize: "1.1rem", color: "rgba(255,154,114,0.45)" }}
                      aria-hidden
                    >
                      {d.title.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span style={{ minWidth: 0 }}>
                  <span className="font-display fw-medium text-white d-block">{d.title}</span>
                  {subline && <span className="small text-secondary">{subline}</span>}
                </span>
              </Link>
              <div className="flex-shrink-0">
                <DramaStatusButton
                  dramaId={d.id}
                  status={statusByDramaId.get(d.id) ?? null}
                />
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

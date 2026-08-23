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
  const status = WATCH_STATUS_ORDER.includes(rawStatus as DramaWatchStatusValue)
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
        where: {
          ...dramaTitleWhere(q),
          ...(status && currentUser
            ? { watchStatuses: { some: { userId: currentUser.id, status } } }
            : {}),
        },
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

  const statusQuery = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <div>
      <PageHeader eyebrow="Каталог" title="Сериалы" size="lg" className="mb-5" />

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
              href={`/dramas?status=${s}${statusQuery}`}
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
          hiddenFields={status ? { status } : undefined}
          className=""
        />
      </div>

      {searchTruncated && (
        <p className="small text-secondary mb-3">
          Показаны первые {SEARCH_RESULT_LIMIT} результатов — уточните запрос, чтобы увидеть более точные совпадения.
        </p>
      )}

      {/* Постерная сетка вместо строк-плашек (Э2.4): постер — главный
          визуал каталога дорам. */}
      <AlphabetIndexList
        items={dramas.map((d) => ({ id: d.id, name: d.title, drama: d }))}
        emptyMessage={
          q ? "Ничего не найдено." : "Пока нет отмеченных сериалов. Используйте поиск, чтобы найти сериал."
        }
        itemsWrapperClassName="poster-grid"
        renderItem={({ drama: d }) => (
          <div key={d.id} className="position-relative">
            <Link href={dramaHref(d)} className="text-decoration-none d-block">
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "2 / 3",
                  borderRadius: "0.9rem",
                  background: "var(--bs-secondary-bg)",
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
                    style={{ fontSize: "2rem", color: "rgba(255,154,114,0.45)" }}
                    aria-hidden
                  >
                    {d.title.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                {ratingByDramaId.has(d.id) && (
                  <span
                    className="date-chip position-absolute"
                    style={{ left: "0.5rem", bottom: "0.5rem" }}
                  >
                    ★ {ratingByDramaId.get(d.id)!.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="small text-white mb-0 mt-2 text-truncate" style={{ lineHeight: 1.3 }}>
                {d.title}
              </p>
              {d.year && <p className="small text-secondary mb-0">{d.year}</p>}
            </Link>
            <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
              <DramaStatusButton
                dramaId={d.id}
                status={statusByDramaId.get(d.id) ?? null}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}

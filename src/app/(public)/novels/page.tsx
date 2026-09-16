import UploadImage from "@/components/UploadImage";
import AppLink from "@/components/AppLink";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import CatalogKindChips from "@/components/CatalogKindChips";
import FilterPanel from "@/components/filters/FilterPanel";
import FilterDisclosure from "@/components/filters/FilterDisclosure";
import CatalogPagination from "@/components/filters/CatalogPagination";
import {
  loadNovelFilterOptions,
  novelFilterDefs,
  novelFilterWhere,
  type FilterParams,
} from "@/lib/catalogFilters";
import { PAGE_SIZE } from "@/lib/pagination";
import { novelHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/userAuth";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.catalog.novels.metaTitle,
    description: t.catalog.novels.metaDescription,
    path: "/novels",
  });
}


export const dynamic = "force-dynamic";

/** Поля карточки списка — полная запись тянет описания, которые список
 *  не показывает. */
const NOVEL_ROW_SELECT = {
  id: true,
  slug: true,
  title: true,
  author: true,
  coverUrl: true,
  _count: { select: { dramas: true } },
} as const;

// П-1: раздел без персональных веток вовсе — список и подложка имён
// одинаковы для всех, считаем раз в полчаса (тег catalog сбрасывает
// раньше). Поисковые запросы — живыми (ключей по числу запросов кэшу
// не надо).
const getNovelsList = unstable_cache(
  async () =>
    prisma.novel.findMany({
      select: NOVEL_ROW_SELECT,
      orderBy: { title: "asc" },
    }),
  ["novels-list"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

const getNovelsWatermarkNames = unstable_cache(
  async () =>
    (
      await prisma.novel.findMany({
        select: { title: true },
        orderBy: { createdAt: "desc" },
        take: WATERMARK_NAME_LIMIT,
      })
    ).map((n) => n.title),
  ["novels-watermark-names"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export default async function NovelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { t } = await getT();
  // Нужен только для чипа «Мой список»: гостю его в ряду не показываем.
  const currentUser = await getCurrentUser();
  const sp = await searchParams;
  const { q: rawQ, page: rawPage } = sp;
  const q = (rawQ ?? "").trim();
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  // Раздел каталога — значит фильтры и страницы, как у сериалов
  // (правка владельца 2026-09-16). Новелл сейчас пять, и листалка с
  // фильтрами не понадобится ни разу; смысл в другом — раздел устроен
  // так же, как соседние, и не придётся переделывать его заново, когда
  // новелл станет несколько сотен.
  const filterParams = sp as FilterParams;
  const filterOptions = await loadNovelFilterOptions();
  const filterDefs = novelFilterDefs(t, filterOptions);
  const where = {
    AND: [
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { author: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...novelFilterWhere(filterParams),
    ],
  };
  // Срез без запроса и без фильтров — тот же для всех, поэтому берётся
  // из кэша (он же считает и общее число).
  const plain = !q && where.AND.length === 0;
  const [novels, total] = plain
    ? await getNovelsList().then((rows) => [
        rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        rows.length,
      ] as const)
    : await Promise.all([
        prisma.novel.findMany({
          where,
          select: NOVEL_ROW_SELECT,
          orderBy: { title: "asc" },
          take: PAGE_SIZE,
          skip: (page - 1) * PAGE_SIZE,
        }),
        prisma.novel.count({ where }),
      ]);

  // Названия за шапкой. Внятной метрики популярности у новелл нет
  // (ни избранного, ни статусов — только отзывы, которых почти нет),
  // поэтому берём свежие добавленные.
  const watermarkNames = await getNovelsWatermarkNames();

  return (
    <div>
      <PageHeader
        eyebrow={t.catalog.eyebrow}
        title={t.catalog.novels.title}
        size="lg"
        className="mb-5"
        watermark="Novels"
        watermarkNames={watermarkNames}
      />

      {/* Тот же ряд разделов, что и на /dramas: пункт меню теперь один
          («Каталог»), и новеллы — его четвёртый раздел. Свой адрес и
          свою страницу они при этом сохранили — переезжать URL после
          августовского падения трафика нельзя (docs/features/seo.md). */}
      <CatalogKindChips active="novels" loggedIn={!!currentUser} />

      <NameSearchBox action="/novels" q={q} placeholder={t.catalog.novels.search} />

      <div className="row g-4 mt-1">
        <div className="col-12 col-lg-9">
      {novels.length === 0 ? (
        <p className="text-secondary">
          {q ? t.common.nothingFound : t.catalog.novels.empty}
        </p>
      ) : (
        /* Постерная сетка — как в каталоге сериалов (Э2.4). */
        <div className="poster-grid mt-4">
          {novels.map((n) => (
            <AppLink key={n.id} href={novelHref(n)} className="text-decoration-none d-block">
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
                {n.coverUrl ? (
                  <UploadImage
                    src={n.coverUrl}
                    alt=""
                    sizes="(max-width: 575.98px) 30vw, 10rem"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span
                    className="d-flex align-items-center justify-content-center h-100 font-display fw-bold"
                    style={{ fontSize: "2rem", color: "rgba(255,154,114,0.45)" }}
                    aria-hidden
                  >
                    {n.title.charAt(0).toUpperCase()}
                  </span>
                )}
                {n._count.dramas > 0 && (
                  <span
                    className="date-chip position-absolute"
                    style={{ left: "0.5rem", bottom: "0.5rem" }}
                  >
                    📺 {n._count.dramas}
                  </span>
                )}
              </div>
              <p className="small text-white mb-0 mt-2 text-truncate" style={{ lineHeight: 1.3 }}>
                {n.title}
              </p>
              {n.author && (
                <p className="small text-secondary mb-0 text-truncate">{n.author}</p>
              )}
            </AppLink>
          ))}
        </div>
      )}
          <CatalogPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            params={filterParams}
            basePath="/novels"
          />
        </div>
        <aside className="col-12 col-lg-3 order-first order-lg-last">
          <div className="d-lg-none">
            <FilterDisclosure title={t.filters.panelTitle}>
              <FilterPanel defs={filterDefs} />
            </FilterDisclosure>
          </div>
          <div className="d-none d-lg-block search-filter-aside">
            <p className="section-heading mb-3">{t.filters.panelTitle}</p>
            <FilterPanel defs={filterDefs} />
          </div>
        </aside>
      </div>
    </div>
  );
}

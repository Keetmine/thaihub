// Ссылки — через AppLink: со страницы /ru/search обычный next/link увёл
// бы на английскую версию каталога.
import AppLink from "@/components/AppLink";
import PageHeader from "@/components/PageHeader";
import { SearchIcon } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import EventAgendaRow from "@/components/EventAgendaRow";
import EventCardLocked from "@/components/EventCardLocked";
import EntityMiniCard from "@/components/EntityMiniCard";
import UploadImage from "@/components/UploadImage";
import FilterPanel from "@/components/filters/FilterPanel";
import FilterDisclosure from "@/components/filters/FilterDisclosure";
import SortSelect from "@/components/filters/SortSelect";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { flattenOccurrence, groupByEvent } from "@/lib/eventOccurrences";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { agencyHref, locationHref, novelHref } from "@/lib/slugHelpers";
import { dramaTitleWhere, performerNameWhere } from "@/lib/searchWhere";
import {
  dramaFilterDefs,
  dramaFilterWhere,
  dramaSortOrder,
  eventFilterDefs,
  eventFilterWhere,
  loadDramaFilterOptions,
  loadNovelFilterOptions,
  loadPerformerFilterOptions,
  locationFilterDefs,
  locationFilterWhere,
  novelFilterDefs,
  novelFilterWhere,
  performerFilterDefs,
  performerFilterWhere,
  type FilterDef,
  type FilterParams,
} from "@/lib/catalogFilters";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref, type Dict } from "@/lib/i18n";
import { performerPhoto, FALLBACK_COVER_SELECT } from "@/lib/performerPhoto";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.events.search.metaTitle,
    description: t.events.search.metaDescription,
    path: "/search",
  });
}

export const dynamic = "force-dynamic";

/** Размер страницы выдачи: у сериалов плитки ложатся по 6 в ряд —
 *  ровно пять полных рядов. */
const PAGE_SIZE = 30;

const SECTIONS = ["all", "dramas", "performers", "events", "locations", "novels"] as const;
type Section = (typeof SECTIONS)[number];

function parseSection(raw: string | undefined): Section {
  return (SECTIONS as readonly string[]).includes(raw ?? "") ? (raw as Section) : "all";
}

/** Хвост адреса с текущими параметрами, но другой секцией. */
function sectionHref(section: Section, params: FilterParams): string {
  const qs = new URLSearchParams();
  const q = typeof params.q === "string" ? params.q : "";
  if (q) qs.set("q", q);
  if (section !== "all") qs.set("section", section);
  return `/search${qs.size ? `?${qs}` : ""}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const { locale, t } = await getT();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();
  const section = parseSection(typeof params.section === "string" ? params.section : undefined);
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);

  return (
    <div>
      <PageHeader
        eyebrow={t.events.search.eyebrow}
        title={q || t.events.search.title}
        className="mb-2"
      />

      {/* Своё поле, а не только то, что в шапке: ниже 1200px шапочное
          скрыто (там бургер или иконка-ссылка сюда), и страница поиска
          оставалась без единого поля ввода. Секция и фильтры при новом
          запросе сохраняются: hidden-поля повторяют адрес. */}
      <form action={localeHref("/search", locale)} method="GET" className="mb-3">
        <div className="search-box search-page-box">
          <SearchIcon />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t.events.search.placeholder}
            aria-label={t.events.search.ariaLabel}
            className="pill-search"
          />
        </div>
        {section !== "all" && <input type="hidden" name="section" value={section} />}
      </form>

      {/* Разделы. Активная вкладка — как в шапке, оранжевым. */}
      {/* gap-3: слипшиеся вкладки читались одной строкой без границ. */}
      <div className="d-flex flex-wrap gap-3 mb-4 tab-bar" role="tablist">
        {SECTIONS.map((s) => (
          <AppLink
            key={s}
            href={sectionHref(s, params)}
            className={`tab-bar-item ${s === section ? "active" : ""}`}
            aria-current={s === section ? "page" : undefined}
          >
            {t.filters.sections[s]}
          </AppLink>
        ))}
      </div>

      {section === "all" ? (
        <AllSections q={q} t={t} />
      ) : (
        <SectionResults section={section} q={q} params={params} page={page} t={t} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Раздел с фильтрами                                                  */
/* ------------------------------------------------------------------ */

async function SectionResults({
  section,
  q,
  params,
  page,
  t,
}: {
  section: Exclude<Section, "all">;
  q: string;
  params: FilterParams;
  page: number;
  t: Dict;
}) {
  const skip = (page - 1) * PAGE_SIZE;
  let defs: FilterDef[] = [];
  let total = 0;
  let results: React.ReactNode = null;
  let sortOptions: { value: string; label: string }[] | null = null;

  if (section === "dramas") {
    const options = await loadDramaFilterOptions();
    defs = dramaFilterDefs(t, options);
    const where = {
      AND: [...(q ? [dramaTitleWhere(q)] : []), ...dramaFilterWhere(params)],
    };
    const sort = typeof params.sort === "string" ? params.sort : "new";
    sortOptions = [
      { value: "new", label: t.filters.sortOptions.new },
      { value: "rating", label: t.filters.sortOptions.rating },
      { value: "title", label: t.filters.sortOptions.title },
    ];
    const [rows, count] = await Promise.all([
      prisma.drama.findMany({ where, orderBy: dramaSortOrder(sort), take: PAGE_SIZE, skip }),
      prisma.drama.count({ where }),
    ]);
    total = count;
    results = (
      <div className="d-flex flex-wrap gap-3">
        {rows.map((d) => (
          <DramaTile key={d.id} drama={d} />
        ))}
      </div>
    );
  } else if (section === "performers") {
    const options = await loadPerformerFilterOptions();
    defs = performerFilterDefs(t, options);
    const where = {
      AND: [...(q ? [performerNameWhere(q)] : []), ...performerFilterWhere(params)],
    };
    const [rows, count] = await Promise.all([
      prisma.performer.findMany({
        where,
        include: { albums: FALLBACK_COVER_SELECT },
        orderBy: { name: "asc" },
        take: PAGE_SIZE,
        skip,
      }),
      prisma.performer.count({ where }),
    ]);
    total = count;
    results = (
      <div className="d-flex flex-wrap gap-2">
        {rows.map((p) => (
          <EntityMiniCard key={p.id} href={performerHref(p)} photoUrl={performerPhoto(p)} name={p.name} />
        ))}
      </div>
    );
  } else if (section === "events") {
    defs = eventFilterDefs(t);
    const where = {
      AND: [
        ...(q
          ? [
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { venue: { contains: q, mode: "insensitive" as const } },
                  {
                    performers: {
                      some: { performer: { name: { contains: q, mode: "insensitive" as const } } },
                    },
                  },
                ],
              },
            ]
          : []),
        ...eventFilterWhere(params),
      ],
    };
    const [rows, count] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          performers: { include: { performer: { select: { id: true, name: true, slug: true } } } },
          occurrences: { orderBy: { startsAt: "asc" } },
        },
        take: PAGE_SIZE,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.event.count({ where }),
    ]);
    total = count;
    results = <EventResults events={rows} />;
  } else if (section === "locations") {
    defs = locationFilterDefs(t);
    const where = {
      AND: [
        { createdByUserId: null },
        ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : []),
        ...locationFilterWhere(params),
      ],
    };
    const [rows, count] = await Promise.all([
      prisma.location.findMany({ where, orderBy: { name: "asc" }, take: PAGE_SIZE, skip }),
      prisma.location.count({ where }),
    ]);
    total = count;
    results = (
      <div className="d-flex flex-wrap gap-2">
        {rows.map((l) => (
          <EntityMiniCard key={l.id} href={locationHref(l)} photoUrl={l.photoUrl} name={l.name} round={false} />
        ))}
      </div>
    );
  } else {
    const options = await loadNovelFilterOptions();
    defs = novelFilterDefs(t, options);
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
        ...novelFilterWhere(params),
      ],
    };
    const [rows, count] = await Promise.all([
      prisma.novel.findMany({ where, orderBy: { title: "asc" }, take: PAGE_SIZE, skip }),
      prisma.novel.count({ where }),
    ]);
    total = count;
    results = (
      <div className="d-flex flex-wrap gap-2">
        {rows.map((n) => (
          <EntityMiniCard key={n.id} href={novelHref(n)} photoUrl={n.coverUrl} name={n.title} round={false} />
        ))}
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="row g-4">
      {/* Выдача слева, фильтры колонкой справа — стандарт страниц
          поиска (просьба владельца). На телефоне колонка превращается
          в раскрывашку над выдачей. */}
      <div className="col-12 col-lg-9">
        <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
          <span className="text-secondary small">{t.filters.results(total)}</span>
          {sortOptions && <SortSelect options={sortOptions} label={t.filters.sort} />}
        </div>
        {total === 0 ? (
          <div>
            <p className="text-secondary mb-1">{t.filters.nothingMatched}</p>
            <p className="small text-secondary">{t.filters.resetAndRetry}</p>
          </div>
        ) : (
          results
        )}
        <Pagination page={page} pages={pages} params={params} t={t} />
      </div>
      <aside className="col-12 col-lg-3 order-first order-lg-last">
        {/* Отдельных плашек выбранного нет (правка владельца):
            отмеченный чекбокс говорит сам за себя. */}
        <div className="d-lg-none">
          <FilterDisclosure title={t.filters.panelTitle}>
            <FilterPanel defs={defs} />
          </FilterDisclosure>
        </div>
        <div className="d-none d-lg-block search-filter-aside">
          <p className="section-heading mb-3">{t.filters.panelTitle}</p>
          <FilterPanel defs={defs} />
        </div>
      </aside>
    </div>
  );
}

/** Постранично: Prev/Next достаточно — глубокие переходы в выдаче не
 *  навигация, а листание. */
function Pagination({
  page,
  pages,
  params,
  t,
}: {
  page: number;
  pages: number;
  params: FilterParams;
  t: Dict;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v) qs.set(k, v);
    }
    if (p > 1) qs.set("page", String(p));
    else qs.delete("page");
    return `/search?${qs}`;
  };
  return (
    <div className="d-flex align-items-center gap-3 mt-4">
      {page > 1 && (
        <AppLink href={href(page - 1)} className="btn btn-ghost btn-sm">
          ← {t.filters.prevPage}
        </AppLink>
      )}
      <span className="small text-secondary">
        {page} / {pages}
      </span>
      {page < pages && (
        <AppLink href={href(page + 1)} className="btn btn-ghost btn-sm">
          {t.filters.nextPage} →
        </AppLink>
      )}
    </div>
  );
}

function DramaTile({
  drama,
}: {
  drama: { id: string; slug: string | null; title: string; year: number | null; posterUrl: string | null };
}) {
  return (
    <AppLink href={dramaHref(drama)} className="text-decoration-none" style={{ width: "8.5rem" }}>
      <div
        className="surface"
        style={{ width: "100%", aspectRatio: "2 / 3", borderRadius: "0.5rem", overflow: "hidden" }}
      >
        {drama.posterUrl ? (
          <UploadImage
            src={drama.posterUrl}
            alt=""
            sizes="8.5rem"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            className="d-flex align-items-center justify-content-center h-100 fw-semibold"
            style={{ color: "var(--bs-secondary-color)", opacity: 0.7 }}
          >
            {drama.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="d-block small text-white mt-1 text-truncate">{drama.title}</span>
      {drama.year && <span className="d-block small text-secondary">{drama.year}</span>}
    </AppLink>
  );
}

/** События уважают пейволл так же, как всюду: без подписки — заглушки. */
async function EventResults({
  events,
}: {
  events: {
    id: string;
    slug: string | null;
    title: string;
    venue: string;
    description: string | null;
    posterUrl: string | null;
    performers: { performer: { id: string; name: string; slug: string | null } }[];
    occurrences: { id: string; eventId: string; startsAt: Date; endsAt: Date | null; hasTime: boolean }[];
  }[];
}) {
  const eventRows = groupByEvent(
    events
      .flatMap((ev) => ev.occurrences.map((occ) => flattenOccurrence({ ...occ, event: ev })))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  );
  const rows = eventRows.map((e) => e.row);
  const currentUser = await getCurrentUser();
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(rows.map((r) => r.id), currentUser?.id),
    getGoingOccurrenceIds(rows.map((r) => r.occurrenceId), currentUser?.id),
    getFriendIds(currentUser?.id),
  ]);
  const friendsGoing = await getFriendsGoingByOccurrence(
    rows.map((r) => r.occurrenceId),
    friendIds,
  );
  return (
    <div className="d-flex flex-column gap-3">
      {eventRows.map(({ row, extraDates }) =>
        isPremiumActive(currentUser) ? (
          <EventAgendaRow
            key={row.id}
            event={row}
            isFavorited={favoritedIds.has(row.id)}
            isGoing={goingIds.has(row.occurrenceId)}
            friendsGoing={friendsGoing.get(row.occurrenceId) ?? []}
            showDate
            extraDates={extraDates}
          />
        ) : (
          <EventCardLocked key={row.id} startsAt={row.startsAt} />
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* «Везде» — сгруппированная выдача без фильтров                       */
/* ------------------------------------------------------------------ */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  // Нативный details — секции сворачиваются без строчки JS.
  return (
    <details open className="mb-4 search-section">
      <summary className="section-heading mb-2 d-inline-flex align-items-center gap-2">
        <span className="search-section-chevron" aria-hidden>▸</span>
        {title} ({count})
      </summary>
      {children}
    </details>
  );
}

async function AllSections({ q, t }: { q: string; t: Dict }) {
  const query = q.trim();
  const [matchedEvents, performers, dramas, agencies, locations, novels, wikiArticles] = query
    ? await Promise.all([
        prisma.event.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { venue: { contains: query, mode: "insensitive" } },
              { performers: { some: { performer: { name: { contains: query, mode: "insensitive" } } } } },
            ],
          },
          include: {
            performers: { include: { performer: { select: { id: true, name: true, slug: true } } } },
            occurrences: { orderBy: { startsAt: "asc" } },
          },
        }),
        prisma.performer.findMany({
          where: { OR: [performerNameWhere(query)] },
          // Обложка релиза заменит фото, если его нет (см.
          // lib/performerPhoto.ts) — у групп это частый случай.
          include: { albums: FALLBACK_COVER_SELECT },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.drama.findMany({
          where: dramaTitleWhere(query),
          orderBy: { title: "asc" },
          take: 24,
        }),
        prisma.agency.findMany({
          where: { name: { contains: query, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.location.findMany({
          where: { createdByUserId: null, name: { contains: query, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 24,
        }),
        prisma.novel.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { author: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { title: "asc" },
          take: 24,
        }),
        prisma.wikiArticle.findMany({
          where: { published: true, title: { contains: query, mode: "insensitive" } },
          select: { id: true, slug: true, title: true },
          orderBy: { title: "asc" },
          take: 12,
        }),
      ])
    : [[], [], [], [], [], [], []];

  const totalCount =
    matchedEvents.length + performers.length + dramas.length + agencies.length +
    locations.length + novels.length + wikiArticles.length;

  if (!query) return <p className="text-secondary">{t.events.search.hint}</p>;
  if (totalCount === 0) {
    return (
      <div>
        <p className="text-secondary">{t.events.search.nothingFound(q)}</p>
        <SearchFeedbackCta q={q} t={t} />
      </div>
    );
  }

  return (
    <>
      <Section title={t.events.search.sectionEvents} count={matchedEvents.length}>
        <EventResults events={matchedEvents} />
      </Section>

      <Section title={t.events.search.sectionArtists} count={performers.length}>
        <div className="d-flex flex-wrap gap-2">
          {performers.map((p) => (
            <EntityMiniCard key={p.id} href={performerHref(p)} photoUrl={performerPhoto(p)} name={p.name} />
          ))}
        </div>
      </Section>

      <Section title={t.events.search.sectionSeries} count={dramas.length}>
        {/* Постер-карточки, как ряд сериалов на странице актёра. */}
        <div className="d-flex flex-wrap gap-3">
          {dramas.map((d) => (
            <DramaTile key={d.id} drama={d} />
          ))}
        </div>
      </Section>

      {/* Новеллы и вики искались и раньше, но в выдачу не попадали —
          запросы были, секций не было. */}
      <Section title={t.filters.sections.novels} count={novels.length}>
        <div className="d-flex flex-wrap gap-2">
          {novels.map((n) => (
            <EntityMiniCard key={n.id} href={novelHref(n)} photoUrl={n.coverUrl} name={n.title} round={false} />
          ))}
        </div>
      </Section>

      <Section title={t.events.search.sectionLocations} count={locations.length}>
        <div className="d-flex flex-wrap gap-2">
          {locations.map((l) => (
            <EntityMiniCard key={l.id} href={locationHref(l)} photoUrl={l.photoUrl} name={l.name} round={false} />
          ))}
        </div>
      </Section>

      <Section title={t.events.search.sectionAgencies} count={agencies.length}>
        <div className="d-flex flex-wrap gap-2">
          {agencies.map((a) => (
            <EntityMiniCard key={a.id} href={agencyHref(a)} photoUrl={a.logoUrl} name={a.name} />
          ))}
        </div>
      </Section>

      <Section title={t.nav.wiki} count={wikiArticles.length}>
        <div className="d-flex flex-column gap-1">
          {wikiArticles.map((w) => (
            <AppLink key={w.id} href={`/wiki/${w.slug ?? w.id}`} className="link-body-emphasis">
              {w.title}
            </AppLink>
          ))}
        </div>
      </Section>

      <SearchFeedbackCta q={q} t={t} />
    </>
  );
}

/** «Не нашли — напишите нам»: ведёт на форму обращений с контекстом
 *  поискового запроса (см. /help#feedback). */
function SearchFeedbackCta({ q, t }: { q: string; t: Dict }) {
  return (
    <div className="surface p-4 mt-4" style={{ maxWidth: "34rem" }}>
      <p className="small text-secondary mb-2">{t.events.search.missingSomething}</p>
      <AppLink
        href={`/help?fb=${encodeURIComponent(q)}#feedback`}
        className="btn btn-ghost btn-sm"
      >
        {t.events.search.writeToUs}
      </AppLink>
    </div>
  );
}

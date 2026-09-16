import AppLink from "@/components/AppLink";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetDataList from "@/components/AlphabetDataList";
import ScrollableTabs from "@/components/ScrollableTabs";
import DramaLocationGroups from "@/components/DramaLocationGroups";
import { getCurrentUser } from "@/lib/userAuth";
import { PinIcon } from "@/components/icons";
import { dramaHref } from "@/lib/dramaSlug";
import { DRAMA_TITLE_SELECT, compareDramaTitles, dramaTitleForLocale } from "@/lib/dramaLocale";
import { listHref, locationHref } from "@/lib/slugHelpers";
import { visibleCommunityListsWhere } from "@/app/(public)/lists/communityLists";
import { pageMetadata } from "@/lib/seo";
import { LOCATION_CATEGORIES, isLocationCategory } from "@/lib/locationCategories";
import { getT } from "@/lib/i18n";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { CATALOG_LETTERS, isCatalogLetter, letterPrefixes } from "@/lib/catalogLetters";
import type { LocationCategory, Prisma } from "@/generated/prisma/client";
import CreateOwnPlaceButton from "@/app/(public)/lists/[id]/CreateOwnPlaceButton";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>;
}) {
  const { t } = await getT();
  const { letter } = await searchParams;
  // С-5: у страницы буквы canonical самоссылающийся.
  return pageMetadata({
    title: t.catalog.locations.metaTitle,
    description: t.catalog.locations.metaDescription,
    path: isCatalogLetter(letter)
      ? `/locations?letter=${encodeURIComponent(letter)}`
      : "/locations",
  });
}

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
 * Кэш общих выборок (П-1): каталожные места (createdByUserId null)
 * одинаковы для всех — считаем раз в полчаса (тег catalog сбрасывает
 * раньше). Личные вкладки (списки, «мои места») и отметки «была здесь»
 * остаются живыми запросами.
 * ------------------------------------------------------------------ */

const getCatalogLocations = unstable_cache(
  async (category: LocationCategory | "") =>
    prisma.location.findMany({
      where: {
        createdByUserId: null,
        ...(category ? { category } : {}),
      },
      select: { id: true, name: true, photoUrl: true, slug: true, category: true },
      orderBy: { name: "asc" },
    }),
  ["locations-catalog-list"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

const getCatalogCategories = unstable_cache(
  async () =>
    (
      await prisma.location.findMany({
        where: { createdByUserId: null, category: { not: null } },
        select: { category: true },
        distinct: ["category"],
      })
    ).map((r) => r.category),
  ["locations-catalog-categories"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

const getLocationsWatermarkNames = unstable_cache(
  async () =>
    (
      await prisma.location.findMany({
        where: { createdByUserId: null },
        select: { name: true },
        orderBy: [
          { visitedBy: { _count: "desc" } },
          // Место, засветившееся в нескольких сериалах, известнее прочих.
          { dramas: { _count: "desc" } },
          { name: "asc" },
        ],
        take: WATERMARK_NAME_LIMIT,
      })
    ).map((l) => l.name),
  ["locations-watermark-names"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** С-5: полный список буквы для серверной страницы `?letter=X`. */
const getLocationsByLetter = unstable_cache(
  async (letter: string) =>
    prisma.location.findMany({
      where: {
        createdByUserId: null,
        OR: letterPrefixes(letter).map((p) => ({
          name: { startsWith: p, mode: "insensitive" as const },
        })),
      },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ["locations-by-letter"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    group?: string;
    cat?: string;
    list?: string;
    letter?: string;
  }>;
}) {
  const { t } = await getT();
  const {
    q: rawQ,
    group: rawGroup,
    cat: rawCat,
    list: rawList,
    letter: rawLetter,
  } = await searchParams;
  const q = (rawQ ?? "").trim();

  // С-5: серверная страница буквы — полный список каталожных мест на
  // букву обычными ссылками, для краулера (буквы рейки ведут сюда по
  // href; живой зритель по-прежнему скроллит клиентский список).
  if (!q && !rawGroup && !rawList && isCatalogLetter(rawLetter)) {
    const locationsOfLetter = await getLocationsByLetter(rawLetter);
    return (
      <div>
        <PageHeader
          eyebrow={t.catalog.eyebrow}
          title={`${t.catalog.locations.title} — ${t.catalog.letterTitle(rawLetter)}`}
        />
        <nav
          className="d-flex flex-wrap align-items-center gap-2 small mb-4"
          aria-label={t.catalog.letterIndex}
        >
          <span className="text-secondary">{t.catalog.letterAll}</span>
          {CATALOG_LETTERS.map((l) => (
            <AppLink
              key={l}
              href={`/locations?letter=${encodeURIComponent(l)}`}
              className={l === rawLetter ? "fw-bold" : undefined}
            >
              {l}
            </AppLink>
          ))}
        </nav>
        <p className="mb-3">
          <AppLink href="/locations">{t.catalog.letterBack}</AppLink>
        </p>
        {locationsOfLetter.length === 0 ? (
          <p className="text-secondary">{t.common.nothingFound}</p>
        ) : (
          <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
            {locationsOfLetter.map((l) => (
              <li key={l.id}>
                <AppLink href={locationHref(l)}>{l.name}</AppLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  // Фильтр по категории места: кафе, магазины, фотозоны…
  const category =
    rawCat && isLocationCategory(rawCat) ? (rawCat as LocationCategory) : null;
  const groupByDrama = rawGroup === "drama";
  const showMine = rawGroup === "mine";
  // Места сообществ (правка владельца 2026-09-09): каталог о них не знал
  // вовсе, хотя «куда сходить в Минске» — такие же места, как свои.
  const showCommunities = rawGroup === "communities";

  const currentUser = await getCurrentUser();
  const activeListId = (rawList ?? "").trim() || null;
  // Списки мест пользователя — вкладками, со счётчиком в подписи.
  const myLists = currentUser
    ? await prisma.placeList.findMany({
        // Только личные списки — см. locations/[id]/page.tsx (АА25).
        where: { userId: currentUser.id, communityId: null },
        select: { id: true, title: true, _count: { select: { items: true } } },
        orderBy: { title: "asc" },
      })
    : [];
  const myPlacesCount = currentUser
    ? await prisma.location.count({ where: { createdByUserId: currentUser.id } })
    : 0;

  // Места из списков сообществ, доступных ЗРИТЕЛЮ. Кто что видит —
  // общим правилом (`lists/communityLists.ts`), и отбор идёт В ЗАПРОСЕ:
  // из закрытого сообщества наружу не должно уходить ничего, а
  // спрятанное разметкой всё равно уехало бы в HTML.
  const communityPlacesWhere: Prisma.LocationWhereInput = {
    listItems: { some: { list: visibleCommunityListsWhere(currentUser?.id) } },
  };
  // Ноль не показываем: вкладки нет, пока показывать нечего.
  const communityPlacesCount = await prisma.location.count({ where: communityPlacesWhere });

  // Какие категории вообще встречаются на текущей вкладке — пустые в
  // фильтр не выводим. Для общего каталога — из кэша (одинаково для
  // всех), для остальных вкладок — живым запросом.
  const tabScopeWhere: Prisma.LocationWhereInput | null = activeListId
    ? { listItems: { some: { listId: activeListId } } }
    : showCommunities
      ? communityPlacesWhere
      : showMine && currentUser
        ? { createdByUserId: currentUser.id }
        : null;
  const presentCategoryValues = tabScopeWhere
    ? (
        await prisma.location.findMany({
          where: { ...tabScopeWhere, category: { not: null } },
          select: { category: true },
          distinct: ["category"],
        })
      ).map((r) => r.category)
    : await getCatalogCategories();
  const presentCategories = new Set(presentCategoryValues);
  const availableCategories = LOCATION_CATEGORIES.filter((c) => presentCategories.has(c.value));

  const categoryHref = (value: string | null) => {
    const params = new URLSearchParams();
    if (activeListId) params.set("list", activeListId);
    else if (showMine) params.set("group", "mine");
    else if (showCommunities) params.set("group", "communities");
    if (value) params.set("cat", value);
    if (q) params.set("q", q);
    const qs = params.toString();
    return `/locations${qs ? `?${qs}` : ""}`;
  };

  // Названия за шапкой — самые «посещаемые» места каталога по числу
  // отметок «была здесь». Места, созданные пользователями, в каталог не
  // входят и в подложку тоже. Популярность одна на всех — из кэша.
  const watermarkNames = await getLocationsWatermarkNames();

  return (
    <div>
      <PageHeader
        eyebrow={t.catalog.eyebrow}
        title={t.catalog.locations.title}
        size="lg"
        watermark="Places"
        watermarkNames={watermarkNames}
        className="mb-5"
        action={
          <>
            <AppLink
              href="/locations/map"
              className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
            >
              <PinIcon />
              {t.catalog.locations.onMap}
            </AppLink>
            <AppLink href="/lists" className="btn btn-ghost btn-sm">
              {t.catalog.locations.myPlacesLink}
            </AppLink>
          </>
        }
      />

      <div className="tab-bar-row">
        {/* ScrollableTabs, как во всех каталогах: со списками мест и
            вкладкой сообществ ряд перерастает экран, и без растушёвки
            обрезанная вкладка выглядела сломанной вёрсткой. */}
        <ScrollableTabs>
          <AppLink
            href={`/locations?${q ? `q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            // «По алфавиту» — это отсутствие любого другого среза, и
            // проверять надо ВСЕ соседние вкладки: раньше выбранный
            // список мест подсвечивался вместе с алфавитом (находка
            // владельца 2026-09-10).
            className={`tab-bar-item ${
              !groupByDrama && !showMine && !showCommunities && !activeListId ? "active" : ""
            }`}
          >
            {t.catalog.locations.tabAlphabet}
          </AppLink>
          <AppLink
            href={`/locations?group=drama${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${groupByDrama ? "active" : ""}`}
          >
            {t.catalog.locations.tabByDrama}
          </AppLink>
          {/* Вкладки — конкретные списки пользователя: «мои места» одной
              кучей ничего не говорят, а «Бангкок» или «Кафе из сериалов» —
              говорят. Плюс общая вкладка со всеми своими местами, если
              что-то создано вне списков. */}
          {myLists.map((l) => (
            <AppLink
              key={l.id}
              href={`/locations?list=${l.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${activeListId === l.id ? "active" : ""}`}
            >
              {l.title} ({l._count.items})
            </AppLink>
          ))}
          {currentUser && myPlacesCount > 0 && (
            <AppLink
              href={`/locations?group=mine${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${showMine ? "active" : ""}`}
            >
              {t.catalog.locations.tabAllMine(myPlacesCount)}
            </AppLink>
          )}
          {/* Места сообществ — одной вкладкой, а не списком вкладок на
              каждый список: сообществ у человека может быть несколько, и
              рейка вкладок расползлась бы. Вкладки нет, пока показывать
              нечего (гостю — пока ни одно публичное сообщество не открыло
              список). */}
          {communityPlacesCount > 0 && (
            <AppLink
              href={`/locations?group=communities${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${showCommunities ? "active" : ""}`}
            >
              {`${t.communities.places.catalogTab} (${communityPlacesCount})`}
            </AppLink>
          )}
        </ScrollableTabs>
        <NameSearchBox
          action="/locations"
          q={q}
          placeholder={t.catalog.searchByTitle}
          hiddenFields={
            groupByDrama
              ? { group: "drama" }
              : showMine
                ? { group: "mine" }
                : showCommunities
                  ? { group: "communities" }
                  : undefined
          }
          className=""
        />
      </div>

      {/* Фильтр по категории — только в алфавитном виде: в группировке по
          сериалам он спорит с самой группировкой. */}
      {/* Фильтр по категории. Показываем только те категории, в которых
          на этой вкладке что-то есть — пустые пункты в фильтре только
          сбивают с толку. В группировке по сериалам фильтра нет: он
          спорит с самой группировкой. */}
      {!groupByDrama && availableCategories.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <AppLink
            href={categoryHref(null)}
            className={`nav-chip ${!category ? "is-active" : ""}`}
          >
            {t.catalog.all}
          </AppLink>
          {availableCategories.map((c) => (
            <AppLink
              key={c.value}
              href={categoryHref(c.value)}
              className={`nav-chip ${category === c.value ? "is-active" : ""}`}
            >
              {c.emoji} {t.catalog.locationCategory[c.value]}
            </AppLink>
          ))}
        </div>
      )}

      {activeListId && currentUser ? (
        <UserPlaceList
          listId={activeListId}
          userId={currentUser.id}
          q={q}
          category={category}
        />
      ) : groupByDrama ? (
        <LocationsByDrama q={q} currentUser={currentUser} />
      ) : showCommunities ? (
        <CommunityPlaces q={q} category={category} currentUser={currentUser} />
      ) : showMine && currentUser ? (
        <MyPlaces q={q} userId={currentUser.id} category={category} />
      ) : (
        <LocationsAlphabetical q={q} currentUser={currentUser} category={category} />
      )}
    </div>
  );
}

async function LocationsAlphabetical({
  q,
  currentUser,
  category,
}: {
  q: string;
  currentUser: { id: string } | null;
  category: LocationCategory | null;
}) {
  const { t } = await getT();
  // Отдаём весь список, но данными, а не разметкой: строки собирает
  // клиент (AlphabetDataList). Так переход по букве остаётся обычным
  // скроллом, а страница весит десятки килобайт вместо мегабайта.
  // Без поискового запроса список одинаков для всех — из кэша
  // (категория входит в ключ); отметки «была здесь» — живым запросом.
  const locations = q
    ? await prisma.location.findMany({
        where: {
          createdByUserId: null,
          name: { contains: q, mode: "insensitive" },
          ...(category ? { category } : {}),
        },
        select: { id: true, name: true, photoUrl: true, slug: true, category: true },
        orderBy: { name: "asc" },
      })
    : await getCatalogLocations(category ?? "");

  const visitedIds = await getVisitedIds(currentUser, locations.map((l) => l.id));

  return (
    <AlphabetDataList
      emptyMessage={t.catalog.locations.empty}
      showVisitedButton
      variant="cards"
      cardAspect="4 / 3"
      letterHrefBase="/locations?letter="
      rows={locations.map((l) => ({
        id: l.id,
        name: l.name,
        href: locationHref(l),
        photoUrl: l.photoUrl,
        subtitle: l.category ? t.catalog.locationCategory[l.category] : null,
        visited: visitedIds.has(l.id),
      }))}
    />
  );
}

async function LocationsByDrama({
  q,
  currentUser,
}: {
  q: string;
  currentUser: { id: string } | null;
}) {
  const { t, locale } = await getT();
  const locationNameFilter = q
    ? { name: { contains: q, mode: "insensitive" as const } }
    : {};

  const [dramas, locationsWithoutDrama] = await Promise.all([
    prisma.drama.findMany({
      where: { locations: { some: { location: locationNameFilter } } },
      select: {
        id: true,
        ...DRAMA_TITLE_SELECT,
        slug: true,
        locations: {
          where: { location: locationNameFilter },
          select: {
            locationId: true,
            location: {
              select: { id: true, name: true, photoUrl: true, slug: true },
            },
          },
          orderBy: { location: { name: "asc" } },
        },
      },
      orderBy: { title: "asc" },
    }),
    prisma.location.findMany({
      where: {
        createdByUserId: null,
        ...locationNameFilter,
        dramas: { none: {} },
      },
      select: { id: true, name: true, photoUrl: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const allLocationIds = [
    ...dramas.flatMap((d) => d.locations.map((dl) => dl.locationId)),
    ...locationsWithoutDrama.map((l) => l.id),
  ];
  const visitedIds = await getVisitedIds(currentUser, allLocationIds);

  if (dramas.length === 0 && locationsWithoutDrama.length === 0) {
    return <p className="text-secondary">{t.catalog.locations.empty}</p>;
  }

  return (
    <DramaLocationGroups
      // Группы — по названию на языке зрителя, и порядок тоже по нему:
      // рейка букв ждёт отсортированный список.
      groups={[...dramas]
        .sort((a, b) => compareDramaTitles(a, b, locale))
        .map((d) => ({
        id: d.id,
        title: dramaTitleForLocale(d, locale),
        href: dramaHref(d),
        locations: d.locations.map(({ location: l }) => ({
          id: l.id,
          name: l.name,
          href: locationHref(l),
          photoUrl: l.photoUrl,
          visited: visitedIds.has(l.id),
        })),
      }))}
      trailing={locationsWithoutDrama.map((l) => ({
        id: l.id,
        name: l.name,
        href: locationHref(l),
        photoUrl: l.photoUrl,
        visited: visitedIds.has(l.id),
      }))}
    />
  );
}

async function getVisitedIds(
  currentUser: { id: string } | null,
  locationIds: string[],
): Promise<Set<string>> {
  if (!currentUser || locationIds.length === 0) return new Set();
  const visits = await prisma.locationVisit.findMany({
    where: { userId: currentUser.id, locationId: { in: locationIds } },
    select: { locationId: true },
  });
  return new Set(visits.map((v) => v.locationId));
}

/** Вкладка одного списка мест: его содержимое, кнопка добавления и
 *  фильтр по категориям. Раньше со страницы локаций добавить место было
 *  нельзя — только зайдя в сам список. */
async function UserPlaceList({
  listId,
  userId,
  q,
  category,
}: {
  listId: string;
  userId: string;
  q: string;
  category: LocationCategory | null;
}) {
  const { t } = await getT();
  const list = await prisma.placeList.findFirst({
    where: { id: listId, userId },
    select: { id: true, title: true },
  });
  if (!list) return <p className="text-secondary">{t.catalog.locations.listNotFound}</p>;

  const items = await prisma.placeListItem.findMany({
    where: {
      listId,
      location: {
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        ...(category ? { category } : {}),
      },
    },
    select: {
      location: {
        select: { id: true, name: true, photoUrl: true, slug: true, category: true },
      },
    },
    orderBy: { position: "asc" },
  });

  const visitedIds = await getVisitedIds({ id: userId }, items.map((i) => i.location.id));

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <CreateOwnPlaceButton listId={list.id} />
        <AppLink href={`/lists/${list.id}`} className="small text-secondary">
          {t.catalog.locations.openWholeList}
        </AppLink>
      </div>
      <AlphabetDataList
        emptyMessage={
          q || category ? t.common.nothingFound : t.catalog.locations.emptyList
        }
        showVisitedButton
        variant="cards"
        cardAspect="4 / 3"
        rows={items.map(({ location: l }) => ({
          id: l.id,
          name: l.name,
          href: locationHref(l),
          photoUrl: l.photoUrl,
          subtitle: l.category ? t.catalog.locationCategory[l.category] : null,
          visited: visitedIds.has(l.id),
        }))}
      />
    </>
  );
}

/**
 * Вкладка «Места сообществ» — места из общих списков («куда сходить в
 * Минске»), которые зритель вправе видеть.
 *
 * ПРИВАТНОСТЬ ЗДЕСЬ ГЛАВНОЕ. Отбор идёт В ЗАПРОСЕ, общим правилом
 * `visibleCommunityListsWhere` (`lists/communityLists.ts`), тем же, по
 * которому открывается страница списка: участнику — списки его
 * сообществ, всем остальным — только публичный список публичного
 * сообщества. Из ЗАКРЫТОГО сообщества наружу не уходит ничего, включая
 * само его название. Отфильтровать в разметке было бы нельзя: скрытое
 * стилями всё равно уехало бы в HTML.
 *
 * Место может лежать сразу в нескольких списках — показываем его один
 * раз, а в подписи перечисляем сообщества, у которых оно есть.
 */
async function CommunityPlaces({
  q,
  category,
  currentUser,
}: {
  q: string;
  category: LocationCategory | null;
  currentUser: { id: string } | null;
}) {
  const { t, locale } = await getT();

  const items = await prisma.placeListItem.findMany({
    where: {
      list: visibleCommunityListsWhere(currentUser?.id),
      location: {
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        ...(category ? { category } : {}),
      },
    },
    select: {
      location: { select: { id: true, name: true, photoUrl: true, slug: true, category: true } },
      list: {
        select: {
          id: true,
          slug: true,
          title: true,
          community: { select: { title: true } },
        },
      },
    },
  });

  // Одно место — одна карточка, даже если оно лежит в трёх списках.
  const places = new Map<
    string,
    { location: (typeof items)[number]["location"]; communities: Set<string> }
  >();
  const lists = new Map<string, (typeof items)[number]["list"]>();
  for (const item of items) {
    lists.set(item.list.id, item.list);
    const row = places.get(item.location.id) ?? {
      location: item.location,
      communities: new Set<string>(),
    };
    if (item.list.community) row.communities.add(item.list.community.title);
    places.set(item.location.id, row);
  }

  const rows = [...places.values()].sort((a, b) =>
    a.location.name.localeCompare(b.location.name, locale),
  );
  const visitedIds = await getVisitedIds(currentUser, rows.map((r) => r.location.id));

  return (
    <>
      <p className="small text-secondary mb-3">{t.communities.places.catalogIntro}</p>

      {/* Сами списки — строкой чипов: с вкладки видно, чьи это места, и
          можно уйти в список целиком, где карта и заметки. */}
      {lists.size > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          {[...lists.values()].map((l) => (
            <AppLink
              key={l.id}
              href={listHref(l)}
              className="nav-chip nav-chip-link text-decoration-none"
            >
              {l.title}
              {l.community && <span className="nav-chip-value">{l.community.title}</span>}
            </AppLink>
          ))}
        </div>
      )}

      <AlphabetDataList
        emptyMessage={
          q || category ? t.common.nothingFound : t.communities.places.catalogEmptyHint
        }
        showVisitedButton
        variant="cards"
        cardAspect="4 / 3"
        rows={rows.map(({ location: l, communities }) => ({
          id: l.id,
          name: l.name,
          href: locationHref(l),
          photoUrl: l.photoUrl,
          subtitle: [...communities].join(", ") || null,
          visited: visitedIds.has(l.id),
        }))}
      />
    </>
  );
}

async function MyPlaces({
  q,
  userId,
  category,
}: {
  q: string;
  userId: string;
  category: LocationCategory | null;
}) {
  const { t } = await getT();
  // Собственные места пользователя (созданные из списков по ссылке
  // Google Maps) — каталог их не показывает, тут им отдельная вкладка.
  const places = await prisma.location.findMany({
    where: {
      createdByUserId: userId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(category ? { category } : {}),
    },
    select: { id: true, name: true, photoUrl: true, slug: true, category: true },
    orderBy: { name: "asc" },
  });

  const visitedIds = await getVisitedIds({ id: userId }, places.map((l) => l.id));

  return (
    <>
      <p className="small text-secondary mb-3">
        {t.catalog.locations.myPlacesHintBefore}
        <AppLink href="/lists" className="link-body-emphasis">
          {t.catalog.locations.myPlacesHintLink}
        </AppLink>
        {t.catalog.locations.myPlacesHintAfter}
      </p>
      <AlphabetDataList
        emptyMessage={
          q || category ? t.common.nothingFound : t.catalog.locations.emptyMine
        }
        showVisitedButton
        variant="cards"
        cardAspect="4 / 3"
        rows={places.map((l) => ({
          id: l.id,
          name: l.name,
          href: locationHref(l),
          photoUrl: l.photoUrl,
          subtitle: l.category ? t.catalog.locationCategory[l.category] : null,
          visited: visitedIds.has(l.id),
        }))}
      />
    </>
  );
}


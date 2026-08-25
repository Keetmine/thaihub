import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetDataList from "@/components/AlphabetDataList";
import DramaLocationGroups from "@/components/DramaLocationGroups";
import { getCurrentUser } from "@/lib/userAuth";
import { PinIcon } from "@/components/icons";
import { dramaHref } from "@/lib/dramaSlug";
import { locationHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { LOCATION_CATEGORIES, categoryLabel, isLocationCategory } from "@/lib/locationCategories";
import type { LocationCategory } from "@/generated/prisma/client";
import CreateOwnPlaceButton from "@/app/(public)/lists/[id]/CreateOwnPlaceButton";

export const metadata = pageMetadata({
  title: "Локации съёмок",
  description:
    "Места съёмок тайских BL-сериалов: адреса, карта и сериалы, которые там снимали.",
  path: "/locations",
});

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; cat?: string; list?: string }>;
}) {
  const { q: rawQ, group: rawGroup, cat: rawCat, list: rawList } = await searchParams;
  const q = (rawQ ?? "").trim();
  // Фильтр по категории места: кафе, магазины, фотозоны…
  const category =
    rawCat && isLocationCategory(rawCat) ? (rawCat as LocationCategory) : null;
  const groupByDrama = rawGroup === "drama";
  const showMine = rawGroup === "mine";

  const currentUser = await getCurrentUser();
  const activeListId = (rawList ?? "").trim() || null;
  // Списки мест пользователя — вкладками, со счётчиком в подписи.
  const myLists = currentUser
    ? await prisma.placeList.findMany({
        where: { userId: currentUser.id },
        select: { id: true, title: true, _count: { select: { items: true } } },
        orderBy: { title: "asc" },
      })
    : [];
  const myPlacesCount = currentUser
    ? await prisma.location.count({ where: { createdByUserId: currentUser.id } })
    : 0;

  // Какие категории вообще встречаются на текущей вкладке — пустые в
  // фильтр не выводим.
  const categoryScope = activeListId
    ? { listItems: { some: { listId: activeListId } } }
    : showMine && currentUser
      ? { createdByUserId: currentUser.id }
      : { createdByUserId: null };
  const categoryRows = await prisma.location.findMany({
    where: { ...categoryScope, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
  });
  const presentCategories = new Set(categoryRows.map((r) => r.category));
  const availableCategories = LOCATION_CATEGORIES.filter((c) => presentCategories.has(c.value));

  const categoryHref = (value: string | null) => {
    const params = new URLSearchParams();
    if (activeListId) params.set("list", activeListId);
    else if (showMine) params.set("group", "mine");
    if (value) params.set("cat", value);
    if (q) params.set("q", q);
    const qs = params.toString();
    return `/locations${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Каталог"
        title="Локации"
        size="lg"
        watermark="Places"
        className="mb-5"
        action={
          <>
            <Link
              href="/locations/map"
              className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
            >
              <PinIcon />
              На карте
            </Link>
            <Link href="/lists" className="btn btn-ghost btn-sm">
              Мои места и списки →
            </Link>
          </>
        }
      />

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={`/locations?${q ? `q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${!groupByDrama && !showMine ? "active" : ""}`}
          >
            По алфавиту
          </Link>
          <Link
            href={`/locations?group=drama${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${groupByDrama ? "active" : ""}`}
          >
            По сериалам
          </Link>
          {/* Вкладки — конкретные списки пользователя: «мои места» одной
              кучей ничего не говорят, а «Бангкок» или «Кафе из сериалов» —
              говорят. Плюс общая вкладка со всеми своими местами, если
              что-то создано вне списков. */}
          {myLists.map((l) => (
            <Link
              key={l.id}
              href={`/locations?list=${l.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${activeListId === l.id ? "active" : ""}`}
            >
              {l.title} ({l._count.items})
            </Link>
          ))}
          {currentUser && myPlacesCount > 0 && (
            <Link
              href={`/locations?group=mine${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${showMine ? "active" : ""}`}
            >
              Все мои места ({myPlacesCount})
            </Link>
          )}
        </div>
        <NameSearchBox
          action="/locations"
          q={q}
          placeholder="Поиск по названию…"
          hiddenFields={
            groupByDrama
              ? { group: "drama" }
              : showMine
                ? { group: "mine" }
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
          <Link href={categoryHref(null)} className={`nav-chip ${!category ? "is-active" : ""}`}>
            Все
          </Link>
          {availableCategories.map((c) => (
            <Link
              key={c.value}
              href={categoryHref(c.value)}
              className={`nav-chip ${category === c.value ? "is-active" : ""}`}
            >
              {c.emoji} {c.label}
            </Link>
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
  // Отдаём весь список, но данными, а не разметкой: строки собирает
  // клиент (AlphabetDataList). Так переход по букве остаётся обычным
  // скроллом, а страница весит десятки килобайт вместо мегабайта.
  const locations = await prisma.location.findMany({
    where: {
      createdByUserId: null,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(category ? { category } : {}),
    },
    select: { id: true, name: true, photoUrl: true, slug: true, category: true },
    orderBy: { name: "asc" },
  });

  const visitedIds = await getVisitedIds(currentUser, locations.map((l) => l.id));

  return (
    <AlphabetDataList
      emptyMessage="Пока нет локаций."
      showVisitedButton
      variant="cards"
      cardAspect="4 / 3"
      rows={locations.map((l) => ({
        id: l.id,
        name: l.name,
        href: locationHref(l),
        photoUrl: l.photoUrl,
        subtitle: categoryLabel(l.category),
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
  const locationNameFilter = q
    ? { name: { contains: q, mode: "insensitive" as const } }
    : {};

  const [dramas, locationsWithoutDrama] = await Promise.all([
    prisma.drama.findMany({
      where: { locations: { some: { location: locationNameFilter } } },
      select: {
        id: true,
        title: true,
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
    return <p className="text-secondary">Пока нет локаций.</p>;
  }

  return (
    <DramaLocationGroups
      groups={dramas.map((d) => ({
        id: d.id,
        title: d.title,
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
  const list = await prisma.placeList.findFirst({
    where: { id: listId, userId },
    select: { id: true, title: true },
  });
  if (!list) return <p className="text-secondary">Список не найден.</p>;

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
        <Link href={`/lists/${list.id}`} className="small text-secondary">
          Открыть список целиком →
        </Link>
      </div>
      <AlphabetDataList
        emptyMessage={
          q || category ? "Ничего не найдено." : "В этом списке пока нет мест."
        }
        showVisitedButton
        variant="cards"
        cardAspect="4 / 3"
        rows={items.map(({ location: l }) => ({
          id: l.id,
          name: l.name,
          href: locationHref(l),
          photoUrl: l.photoUrl,
          subtitle: categoryLabel(l.category),
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
        Места, которые вы добавили сами. Новое место заводится в разделе{" "}
        <Link href="/lists" className="link-body-emphasis">
          «Мои места»
        </Link>{" "}
        — список для этого не нужен.
      </p>
      <AlphabetDataList
        emptyMessage={q || category ? "Ничего не найдено." : "Своих мест пока нет."}
        showVisitedButton
        variant="cards"
        cardAspect="4 / 3"
        rows={places.map((l) => ({
          id: l.id,
          name: l.name,
          href: locationHref(l),
          photoUrl: l.photoUrl,
          subtitle: categoryLabel(l.category),
          visited: visitedIds.has(l.id),
        }))}
      />
    </>
  );
}


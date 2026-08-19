import Link from "next/link";
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
  searchParams: Promise<{ q?: string; group?: string; cat?: string }>;
}) {
  const { q: rawQ, group: rawGroup, cat: rawCat } = await searchParams;
  const q = (rawQ ?? "").trim();
  // Фильтр по категории места: кафе, магазины, фотозоны…
  const category =
    rawCat && isLocationCategory(rawCat) ? (rawCat as LocationCategory) : null;
  const groupByDrama = rawGroup === "drama";
  const showMine = rawGroup === "mine";

  const currentUser = await getCurrentUser();

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          Локации
        </h1>
        <div className="d-flex flex-wrap gap-2">
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
        </div>
      </div>

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
          {currentUser && (
            <Link
              href={`/locations?group=mine${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${showMine ? "active" : ""}`}
            >
              Мои места
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
      {!groupByDrama && !showMine && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <Link
            href={`/locations${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            className={`nav-chip ${!category ? "is-active" : ""}`}
          >
            Все
          </Link>
          {LOCATION_CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={`/locations?cat=${c.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`nav-chip ${category === c.value ? "is-active" : ""}`}
            >
              {c.emoji} {c.label}
            </Link>
          ))}
        </div>
      )}

      {groupByDrama ? (
        <LocationsByDrama q={q} currentUser={currentUser} />
      ) : showMine && currentUser ? (
        <MyPlaces q={q} userId={currentUser.id} />
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

async function MyPlaces({ q, userId }: { q: string; userId: string }) {
  // Собственные места пользователя (созданные из списков по ссылке
  // Google Maps) — каталог их не показывает, тут им отдельная вкладка.
  const places = await prisma.location.findMany({
    where: {
      createdByUserId: userId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
  });

  if (places.length === 0) {
    return (
      <p className="text-secondary">
        {q
          ? "Ничего не найдено."
          : "Своих мест пока нет — добавляйте их в списках мест по ссылке Google Maps."}{" "}
        <Link href="/lists" className="link-body-emphasis">
          Мои списки →
        </Link>
      </p>
    );
  }

  return (
    <div className="d-flex flex-column gap-2 scroll-list-lg thin-scroll">
      {places.map((l) => (
        <Link
          key={l.id}
          href={locationHref(l)}
          className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
        >
          <div
            className="d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.5rem",
              background: "var(--bs-secondary-bg)",
              overflow: "hidden",
              color: "var(--bs-secondary-color)",
            }}
          >
            {l.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                loading="lazy"
                decoding="async"
                src={l.photoUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span className="fw-semibold" style={{ opacity: 0.6 }}>
                {l.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="font-display fw-medium text-white text-truncate">
            {l.name}
          </span>
        </Link>
      ))}
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import VisitedButton from "@/components/VisitedButton";
import { getCurrentUser } from "@/lib/userAuth";
import { PinIcon } from "@/components/icons";
import { dramaHref } from "@/lib/dramaSlug";
import { locationHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Локации съёмок",
  description:
    "Места съёмок тайских BL-сериалов: адреса, карта и сериалы, которые там снимали.",
  path: "/locations",
});

export const dynamic = "force-dynamic";

function LocationRow({
  location,
  isVisited,
}: {
  location: { id: string; name: string; photoUrl: string | null };
  isVisited: boolean;
}) {
  return (
    <div
      key={location.id}
      className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
    >
      <Link
        href={locationHref(location)}
        className="text-decoration-none d-flex align-items-center gap-3"
        style={{ minWidth: 0 }}
      >
        <div
          style={{
            width: "2.75rem",
            height: "2.75rem",
            borderRadius: "0.5rem",
            background: "var(--bs-secondary-bg)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {location.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={location.photoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>
        <span className="font-display fw-medium text-white text-truncate">
          {location.name}
        </span>
      </Link>
      <VisitedButton
        locationId={location.id}
        isVisited={isVisited}
        className="flex-shrink-0"
      />
    </div>
  );
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; letter?: string }>;
}) {
  const { q: rawQ, group: rawGroup, letter: rawLetter } = await searchParams;
  const q = (rawQ ?? "").trim();
  const letter = (rawLetter ?? "").trim() || null;
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

      {groupByDrama ? (
        <LocationsByDrama q={q} currentUser={currentUser} letter={letter} />
      ) : showMine && currentUser ? (
        <MyPlaces q={q} userId={currentUser.id} />
      ) : (
        <LocationsAlphabetical
          q={q}
          currentUser={currentUser}
          letter={letter}
        />
      )}
    </div>
  );
}

/** Сколько локаций показываем, пока буква не выбрана. Раньше страница
 *  отдавала все 567 разом — мегабайт разметки и десятки секунд. */
const FIRST_BATCH = 60;
/** Сериалов на вкладке «по сериалам» до выбора буквы: у каждого своя
 *  пачка локаций, поэтому порция меньше. */
const FIRST_BATCH_DRAMAS = 20;

async function LocationsAlphabetical({
  q,
  currentUser,
  letter,
}: {
  q: string;
  currentUser: { id: string } | null;
  letter: string | null;
}) {
  const baseWhere = {
    createdByUserId: null,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  // Буква из индекса: грузим только её. «0-9» — всё, что начинается с
  // цифры, поэтому набор условий, а не один startsWith.
  const letterWhere =
    letter === "0-9"
      ? { OR: "0123456789".split("").map((d) => ({ name: { startsWith: d } })) }
      : letter
        ? { name: { startsWith: letter, mode: "insensitive" as const } }
        : {};

  // Только то, что рисует строка: description локаций — это длинные
  // тексты, из-за которых страница весила больше мегабайта.
  const [locations, total, letterRows] = await Promise.all([
    prisma.location.findMany({
      where: { ...baseWhere, ...letterWhere },
      select: { id: true, name: true, photoUrl: true, slug: true },
      orderBy: { name: "asc" },
      ...(letter || q ? {} : { take: FIRST_BATCH }),
    }),
    prisma.location.count({ where: baseWhere }),
    // Дешёвый запрос ради полного алфавита в навигации: имена без
    // тяжёлых полей, буквы считаются на месте.
    prisma.location.findMany({ where: baseWhere, select: { name: true } }),
  ]);

  const allLetters = Array.from(
    new Set(
      letterRows.map((r) => {
        const ch = r.name.trim().charAt(0) || "#";
        return /[0-9]/.test(ch) ? "0-9" : ch.toUpperCase();
      }),
    ),
  ).sort();

  const visitedIds = await getVisitedIds(
    currentUser,
    locations.map((l) => l.id),
  );
  const hiddenCount = !letter && !q ? total - locations.length : 0;

  return (
    <>
      {hiddenCount > 0 && (
        <p className="small text-secondary mb-3">
          Показаны первые {locations.length} из {total}. Выберите букву справа
          или воспользуйтесь поиском, чтобы найти нужную локацию.
        </p>
      )}
      <AlphabetIndexList
        items={locations.map((l) => ({ id: l.id, name: l.name, location: l }))}
        emptyMessage="Пока нет локаций."
        allLetters={allLetters}
        activeLetter={letter}
        letterLinkHref={(l) =>
          `/locations?letter=${encodeURIComponent(l)}${q ? `&q=${encodeURIComponent(q)}` : ""}`
        }
        renderItem={({ location: l }) => (
          <LocationRow location={l} isVisited={visitedIds.has(l.id)} />
        )}
      />
      {letter && (
        <p className="small text-secondary mt-3">
          <Link href={`/locations${q ? `?q=${encodeURIComponent(q)}` : ""}`}>
            ← Ко всем локациям
          </Link>
        </p>
      )}
    </>
  );
}

async function LocationsByDrama({
  q,
  currentUser,
  letter,
}: {
  q: string;
  currentUser: { id: string } | null;
  letter: string | null;
}) {
  const locationNameFilter = q
    ? { name: { contains: q, mode: "insensitive" as const } }
    : {};

  // Группировка по сериалам — самый тяжёлый вид: каждая дорама тянет
  // свои локации. Без выбранной буквы отдаём первые FIRST_BATCH_DRAMAS,
  // остальное — по букве названия сериала (раньше уезжало 1.7 МБ).
  const dramaLetterWhere =
    letter === "0-9"
      ? {
          OR: "0123456789".split("").map((d) => ({ title: { startsWith: d } })),
        }
      : letter
        ? { title: { startsWith: letter, mode: "insensitive" as const } }
        : {};

  const [dramas, locationsWithoutDrama, dramaTitles] = await Promise.all([
    prisma.drama.findMany({
      where: {
        locations: { some: { location: locationNameFilter } },
        ...dramaLetterWhere,
      },
      ...(letter || q ? {} : { take: FIRST_BATCH_DRAMAS }),
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
    prisma.drama.findMany({
      where: { locations: { some: { location: locationNameFilter } } },
      select: { title: true },
    }),
  ]);

  const allLetters = Array.from(
    new Set(
      dramaTitles.map((d) => {
        const ch = d.title.trim().charAt(0) || "#";
        return /[0-9]/.test(ch) ? "0-9" : ch.toUpperCase();
      }),
    ),
  ).sort();
  const hiddenDramas = !letter && !q ? dramaTitles.length - dramas.length : 0;

  const allLocationIds = [
    ...dramas.flatMap((d) => d.locations.map((dl) => dl.locationId)),
    ...locationsWithoutDrama.map((l) => l.id),
  ];
  const visitedIds = await getVisitedIds(currentUser, allLocationIds);

  if (dramas.length === 0 && locationsWithoutDrama.length === 0) {
    return <p className="text-secondary">Пока нет локаций.</p>;
  }

  return (
    <>
      {hiddenDramas > 0 && (
        <p className="small text-secondary mb-3">
          Показаны первые {dramas.length} из {dramaTitles.length} сериалов.
          Выберите букву справа или воспользуйтесь поиском.
        </p>
      )}
      <AlphabetIndexList
        items={dramas.map((d) => ({ id: d.id, name: d.title, drama: d }))}
        emptyMessage="Пока нет локаций."
        allLetters={allLetters}
        activeLetter={letter}
        letterLinkHref={(l) =>
          `/locations?group=drama&letter=${encodeURIComponent(l)}${q ? `&q=${encodeURIComponent(q)}` : ""}`
        }
        renderItem={({ drama }) => (
          <section>
            <Link href={dramaHref(drama)} className="day-group-heading mb-2">
              {drama.title}
            </Link>
            <div className="d-flex flex-column gap-2 mt-2">
              {drama.locations.map(({ location: l }) => (
                <LocationRow
                  key={l.id}
                  location={l}
                  isVisited={visitedIds.has(l.id)}
                />
              ))}
            </div>
          </section>
        )}
        trailingSection={
          locationsWithoutDrama.length > 0
            ? {
                indexLabel: "—",
                indexAriaLabel: "К локациям без сериала",
                content: (
                  <>
                    <h2 className="day-group-heading mb-2">Без сериала</h2>
                    <div className="d-flex flex-column gap-2 mt-2">
                      {locationsWithoutDrama.map((l) => (
                        <LocationRow
                          key={l.id}
                          location={l}
                          isVisited={visitedIds.has(l.id)}
                        />
                      ))}
                    </div>
                  </>
                ),
              }
            : undefined
        }
      />
    </>
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

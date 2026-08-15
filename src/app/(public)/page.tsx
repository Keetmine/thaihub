import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateKey, endOfDay, formatShortDate, parseDateKey, startOfDay } from "@/lib/dates";
import InfiniteEventList from "@/components/InfiniteEventList";
import NameSearchBox from "@/components/NameSearchBox";
import DateRangeFilterButton from "@/components/DateRangeFilterButton";
import { fetchEventListPage, type EventListFilters } from "@/lib/eventList";
import { getCurrentUser } from "@/lib/userAuth";
import { CalendarIcon } from "@/components/icons";
import LandingPage from "./LandingPage";
import PremiumUpsell from "@/components/PremiumUpsell";
import { isPremiumActive } from "@/lib/premium";

export const dynamic = "force-dynamic";

type EventFilter = "all" | "going" | "favorited";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; from?: string; to?: string; q?: string; trip?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return <LandingPage />;
  }

  // Афиша — платная функция: без подписки вместо списка сразу заглушка
  // (как на /trips). Никакие данные событий при этом не запрашиваются.
  if (!isPremiumActive(user)) {
    return (
      <div>
        <div className="dot-grid pb-1">
          <span className="eyebrow">Афиша событий</span>
          <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
            Все события
          </h1>
        </div>
        <PremiumUpsell feature="Афиша событий" />
      </div>
    );
  }

  const { filter: rawFilter, from: rawFrom, to: rawTo, q: rawQ, trip: rawTrip } = await searchParams;
  const q = (rawQ ?? "").trim();

  const isValidDateKey = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  // Табы-поездки: свои поездки, ещё не закончившиеся, + выбранная (даже
  // прошедшая — по прямой ссылке). Выбранная поездка задаёт диапазон дат
  // вместо ручного from/to.
  // Поездки — платная функция, без подписки табов нет (а старые поездки,
  // созданные при активной подписке, доступны со страницы /trips… которая
  // тоже за подпиской — то есть только после её возврата).
  const myTrips = await prisma.trip.findMany({
    where: { userId: user.id, endDate: { gte: startOfDay(new Date()) } },
    orderBy: { startDate: "asc" },
  });

  const activeTrip = rawTrip
    ? (myTrips.find((t) => t.id === rawTrip) ??
      (await prisma.trip.findFirst({ where: { id: rawTrip, userId: user.id } })))
    : null;

  // Таб поездки — самостоятельный режим, не фильтр: он показывает ВСЕ
  // события своих дат, Все/Иду/Избранное при нём принудительно "all", а
  // клик по любому фильтр-табу поездку сбрасывает (в rangeQuery ниже
  // trip не попадает намеренно).
  const filter: EventFilter = activeTrip
    ? "all"
    : rawFilter === "going"
      ? "going"
      : rawFilter === "favorited"
        ? "favorited"
        : "all";

  const from = activeTrip ? dateKey(activeTrip.startDate) : isValidDateKey(rawFrom) ? rawFrom! : "";
  const to = activeTrip ? dateKey(activeTrip.endDate) : isValidDateKey(rawTo) ? rawTo! : "";
  const hasDateRange = Boolean(from || to);
  // Carried through onto the filter toggle links so switching Все/Иду/
  // Избранное doesn't drop a manual date range or search term.
  const rangeQuery = `${
    activeTrip ? "" : `${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
  }${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const filters: EventListFilters = { filter, from, to, q };
  const initialPage = await fetchEventListPage(user.id, true, filters, "upcoming", 0);

  // Общее число событий в явном диапазоне — одним count'ом (сам список
  // при этом всё равно подгружается страницами).
  const rangeTotal = hasDateRange
    ? await prisma.eventOccurrence.count({
        where: {
          startsAt: {
            gte: from ? startOfDay(parseDateKey(from)) : undefined,
            lte: to ? endOfDay(parseDateKey(to)) : undefined,
          },
          ...(filter === "going" ? { attendances: { some: { userId: user.id } } } : {}),
          event: {
            ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
            ...(filter === "favorited" ? { favoritedBy: { some: { userId: user.id } } } : {}),
          },
        },
      })
    : 0;

  return (
    <div>
      <div className="dot-grid pb-1">
        <span className="eyebrow">Афиша событий</span>
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
          <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
            Все события
          </h1>
          <Link
            href="/calendar"
            className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
          >
            <CalendarIcon />
            Посмотреть в календаре
          </Link>
        </div>
      </div>

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={`/?filter=all${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "all" && !activeTrip ? "active" : ""}`}
          >
            Все события
          </Link>
          <Link
            href={`/?filter=going${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "going" ? "active" : ""}`}
          >
            Я иду
          </Link>
          <Link
            href={`/?filter=favorited${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "favorited" ? "active" : ""}`}
          >
            Избранное
          </Link>
          {myTrips.map((t) => (
            <Link
              key={t.id}
              href={`/?trip=${t.id}`}
              prefetch={false}
              className={`tab-bar-item ${activeTrip?.id === t.id ? "active" : ""}`}
              title={`${formatShortDate(t.startDate)} – ${formatShortDate(t.endDate)}`}
            >
              ✈ {t.title}
            </Link>
          ))}
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {!activeTrip && (
            <DateRangeFilterButton
              action="/"
              from={from}
              to={to}
              clearHref={`/?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              hiddenFields={filter !== "all" ? { filter } : undefined}
            />
          )}
          <NameSearchBox
            action="/"
            q={q}
            placeholder="Поиск по названию…"
            hiddenFields={{
              ...(filter !== "all" ? { filter } : {}),
              ...(activeTrip
                ? { trip: activeTrip.id }
                : { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
            }}
            className=""
          />
        </div>
      </div>

      {hasDateRange && (
        <p className="small text-secondary mb-3">
          {rangeTotal === 0
            ? "В этом диапазоне дат событий нет."
            : `Событий в диапазоне: ${rangeTotal}.`}
        </p>
      )}

      <InfiniteEventList
        key={`${filter}|${from}|${to}|${q}`}
        filters={filters}
        initialPage={initialPage}
        emptyMessage={
          hasDateRange ? "" : q ? "Ничего не найдено." : "Предстоящих событий пока нет."
        }
      />
    </div>
  );
}

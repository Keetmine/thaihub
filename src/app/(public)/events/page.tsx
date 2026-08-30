import AppLink from "@/components/AppLink";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { dateKey, formatShortDate, startOfDay } from "@/lib/dates";
import { getT, localeHref } from "@/lib/i18n";
import InfiniteEventList from "@/components/InfiniteEventList";
import NameSearchBox from "@/components/NameSearchBox";
import DateRangeFilterButton from "@/components/DateRangeFilterButton";
import { countEventListRange, fetchEventListPage, type EventListFilters } from "@/lib/eventList";
import { getCurrentUser } from "@/lib/userAuth";
import { CalendarIcon } from "@/components/icons";
import EventsTeaser from "./EventsTeaser";
import { isPremiumActive } from "@/lib/premium";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.events.list.metaTitle,
    description: t.events.list.metaDescription,
    path: "/events",
  });
}

export const dynamic = "force-dynamic";

type EventFilter = "all" | "going" | "favorited" | "artists";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; from?: string; to?: string; q?: string; trip?: string }>;
}) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();

  // Без подписки (и гостю без аккаунта тоже) — тизер: ближайшие события
  // показаны честно и целиком, остальная лента остаётся за подпиской.
  // Гостю здесь БОЛЬШЕ НЕ подсовывается лендинг: это был дубль главной
  // под адресом, по которому человек пришёл именно за афишей.
  if (!user || !isPremiumActive(user)) {
    return (
      <div>
        {/* Метка тура и в этой ветке: лента ниже закрыта, но первый шаг
            «что это за раздел» показать всё равно нужно. */}
        <div className="dot-grid pb-1" data-tour="feed">
          <PageHeader
            eyebrow={t.events.list.eyebrow}
            title={t.events.list.title}
            size="lg"
            className="mb-5"
            watermark="Events"
          />
        </div>
        <EventsTeaser userId={user?.id ?? null} />
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
  const tripSelect = { id: true, title: true, startDate: true, endDate: true } as const;
  const tripAccess = {
    OR: [
      { userId: user.id },
      { members: { some: { userId: user.id, status: "ACCEPTED" as const } } },
    ],
  };

  // Поездки и названия-подложка не зависят ни от фильтров, ни друг от
  // друга — один заход в базу вместо двух подряд.
  const [myTrips, watermarkNames] = await Promise.all([
    prisma.trip.findMany({
      where: { ...tripAccess, endDate: { gte: startOfDay(new Date()) } },
      select: tripSelect,
      orderBy: { startDate: "asc" },
    }),
    // Названия за шапкой — события, на которые идёт больше всего народу.
    prisma.event
      .findMany({
        select: { title: true },
        orderBy: [
          { attendees: { _count: "desc" } },
          { favoritedBy: { _count: "desc" } },
          { createdAt: "desc" },
        ],
        take: WATERMARK_NAME_LIMIT,
      })
      .then((rows) => rows.map((e) => e.title)),
  ]);

  const activeTrip = rawTrip
    ? (myTrips.find((t) => t.id === rawTrip) ??
      (await prisma.trip.findFirst({
        where: { id: rawTrip, ...tripAccess },
        select: tripSelect,
      })))
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
        : rawFilter === "artists"
          ? "artists"
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

  // Первая страница и счётчик по диапазону — параллельно: счётчик не
  // зависит от того, что вернул список.
  const [initialPage, rangeTotal] = await Promise.all([
    fetchEventListPage(user.id, true, filters, "upcoming", 0),
    // Общее число событий в явном диапазоне — одним count'ом (сам список
    // при этом всё равно подгружается страницами). Условия берём из той
    // же функции, что и лента, иначе счётчик расходится с показанным.
    countEventListRange(user.id, filters),
  ]);

  return (
    <div>
      {/* Метка тура — на заголовке, а не на фильтрах: без подписки
          вместо ленты стоит пейволл, а первый шаг должен показаться
          всем. */}
      <div className="dot-grid pb-1" data-tour="feed">
        <PageHeader
          eyebrow={t.events.list.eyebrow}
          title={t.events.list.title}
          size="lg"
          className="mb-5"
          watermark="Events"
          watermarkNames={watermarkNames}
          action={
            <AppLink
              href="/calendar"
              className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
            >
              <CalendarIcon />
              {t.events.list.openCalendar}
            </AppLink>
          }
        />
      </div>

      <div className="tab-bar-row">
        <div className="tab-bar">
          <AppLink
            href={`/events?filter=all${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "all" && !activeTrip ? "active" : ""}`}
          >
            {t.events.list.tabAll}
          </AppLink>
          <AppLink
            href={`/events?filter=going${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "going" ? "active" : ""}`}
          >
            {t.events.list.tabGoing}
          </AppLink>
          <AppLink
            href={`/events?filter=favorited${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "favorited" ? "active" : ""}`}
          >
            {t.events.list.tabFavorites}
          </AppLink>
          <AppLink
            href={`/events?filter=artists${rangeQuery}`}
            prefetch={false}
            className={`tab-bar-item ${filter === "artists" ? "active" : ""}`}
          >
            {t.events.list.tabArtists}
          </AppLink>
          {myTrips.map((trip) => (
            <AppLink
              key={trip.id}
              href={`/events?trip=${trip.id}`}
              prefetch={false}
              className={`tab-bar-item ${activeTrip?.id === trip.id ? "active" : ""}`}
              title={`${formatShortDate(trip.startDate, locale)} – ${formatShortDate(trip.endDate, locale)}`}
            >
              ✈ {trip.title}
            </AppLink>
          ))}
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {!activeTrip && (
            <DateRangeFilterButton
              // Форма подставляет action в <form action> как есть, поэтому
              // префикс языка добавляем здесь; NameSearchBox ниже, наоборот,
              // зовёт localeHref сам — ему нужен путь без префикса.
              action={localeHref("/events", locale)}
              from={from}
              to={to}
              clearHref={localeHref(
                `/events?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
                locale,
              )}
              hiddenFields={filter !== "all" ? { filter } : undefined}
            />
          )}
          <NameSearchBox
            action="/events"
            q={q}
            placeholder={t.events.list.searchPlaceholder}
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
            ? t.events.list.rangeEmpty
            : t.events.list.rangeCount(rangeTotal)}
        </p>
      )}

      <InfiniteEventList
        key={`${filter}|${from}|${to}|${q}`}
        filters={filters}
        initialPage={initialPage}
        emptyMessage={
          hasDateRange ? "" : q ? t.common.nothingFound : t.events.list.emptyUpcoming
        }
      />
    </div>
  );
}

import { unstable_cache } from "next/cache";
import AppLink from "@/components/AppLink";
import ScrollableTabs from "@/components/ScrollableTabs";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
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
import { CATALOG_TAG } from "@/lib/catalogCache";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.events.list.metaTitle,
    description: t.events.list.metaDescription,
    path: "/events",
  });
}

export const dynamic = "force-dynamic";

/** Имена за шапкой — события, на которые идёт больше всего народу.
 *  Каталожные: название встречи («Смотрим 5 серию у Кати») в подложке
 *  афиши читалось бы как чужой личный план (см. lib/catalogEvents.ts).
 *
 *  Популярность одна на всех — считаем раз в полчаса, как соседние
 *  каталоги (/dramas, /artists, /locations): раньше сортировка по числу
 *  отметок шла в базу на КАЖДЫЙ заход каждого гостя ради картинки за
 *  заголовком (аудит 2026-09, п.4). Тег catalog сбрасывает раньше
 *  срока, когда афишу правят из админки. */
const getEventsWatermarkNames = unstable_cache(
  async () =>
    (
      await prisma.event.findMany({
        where: catalogEventsWhere(),
        select: { title: true },
        orderBy: [
          { attendees: { _count: "desc" } },
          { favoritedBy: { _count: "desc" } },
          { createdAt: "desc" },
        ],
        take: WATERMARK_NAME_LIMIT,
      })
    ).map((e) => e.title),
  ["events-watermark-names"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

type EventFilter = "all" | "going" | "favorited" | "artists" | "communities";

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
  // Подложка стоит ДО развилки гость/подписка: в ней нет ничего
  // персонального, и гостю она нужна так же, как подписчику (правка
  // владельца 2026-09-09 — раньше гость видел шапку без имён).
  const watermarkNames = await getEventsWatermarkNames();

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
            watermarkNames={watermarkNames}
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
  const myTrips = await prisma.trip.findMany({
    where: { ...tripAccess, endDate: { gte: startOfDay(new Date()) } },
    select: tripSelect,
    orderBy: { startDate: "asc" },
  });

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
          : rawFilter === "communities"
            ? "communities"
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
  const [initialPage, rangeTotal, myCommunityCount] = await Promise.all([
    fetchEventListPage(user.id, true, filters, "upcoming", 0),
    // Общее число событий в явном диапазоне — одним count'ом (сам список
    // при этом всё равно подгружается страницами). Условия берём из той
    // же функции, что и лента, иначе счётчик расходится с показанным.
    countEventListRange(user.id, filters),
    // Вкладка встреч нужна лишь тем, у кого сообщества есть: иначе она
    // обещала бы содержимое, которого у человека быть не может.
    prisma.communityMember.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);
  const hasCommunities = myCommunityCount > 0;

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
        <ScrollableTabs>
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
          {/* Встречи сообществ — своей вкладкой, а не строками в общей
              ленте (правка владельца 2026-09-08): выглядят они так же,
              как обычные события, но видит их только тот, кто в этих
              сообществах состоит. Вкладку рисуем лишь тем, у кого
              сообщества есть — пустая вкладка была бы загадкой. */}
          {hasCommunities && (
            <AppLink
              href={`/events?filter=communities${rangeQuery}`}
              prefetch={false}
              className={`tab-bar-item ${filter === "communities" ? "active" : ""}`}
            >
              {t.events.list.tabCommunities}
            </AppLink>
          )}
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
        </ScrollableTabs>
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

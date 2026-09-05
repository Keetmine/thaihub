import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import ReportButton from "@/components/ReportButton";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import {
  formatCombinedDateList,
  formatHumanDate,
  formatLongDate,
  formatRelativeTime,
  formatShortDate,
  formatTime,
} from "@/lib/dates";
import { eventHref } from "@/lib/eventSlug";
import LetterAvatar from "@/components/LetterAvatar";
import FriendActionButton from "@/components/FriendActionButton";
import EventAgendaRow from "@/components/EventAgendaRow";
import { CalendarIcon, CheckIcon, PinIcon, StarIcon } from "@/components/icons";
import { isPremiumActive } from "@/lib/premium";
import { ONLINE_WINDOW_MS } from "@/lib/lastSeen";
import { sendFriendRequest } from "../../friends/actions";
import { logout } from "../../login/actions";
import FriendNotifyToggle from "./FriendNotifyToggle";
import { getUnlockedAchievements, syncAchievements } from "@/lib/achievements";
import { computeUserStats } from "@/lib/userStats";
import { getActivityFeed } from "@/lib/activityFeed";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import AchievementBadge from "@/components/AchievementBadge";
import StatsUpsell from "./StatsUpsell";
import CreateArtistListButton from "@/app/(public)/artist-lists/CreateArtistListButton";
import { listHref, tripHref, locationHref, artistListHref, dramaHref, novelHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { WATCH_STATUS_ORDER, episodeProgress } from "@/lib/watchStatus";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref, type Dict, type Locale } from "@/lib/i18n";
import ActivityList from "./ActivityList";
import ProfileTabs, { type ProfileTabKey } from "./ProfileTabs";
import ProfileOverview from "./ProfileOverview";
import StatsHero from "./StatsHero";
import StatsTab, { type StatsForTab } from "./StatsTab";
import ReviewsTab, { type MyReviewRow } from "./ReviewsTab";
import CommentsTab, { type MyCommentRow } from "./CommentsTab";
import TicketsTab from "./TicketsTab";
import SubTabs from "@/components/SubTabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, t } = await getT();
  // Тот же разбор параметра, что в самой странице: cuid — это id, всё
  // остальное — ник.
  const looksLikeId = /^c[a-z0-9]{20,}$/.test(id);
  const user = await prisma.user.findUnique({
    where: looksLikeId ? { id } : { username: id },
    select: { name: true, deletedAt: true },
  });
  if (!user || user.deletedAt)
    return pageMetadata({
      title: t.social.profile.metaTitle,
      description: t.social.profile.metaNotFound,
      noIndex: true,
      locale,
    });
  return pageMetadata({
    title: user.name ?? t.social.profile.metaTitle,
    description: user.name
      ? t.social.profile.metaDescription(user.name)
      : t.social.profile.metaDescriptionAnonymous,
    path: `/users/${id}`,
    noIndex: true,
    locale,
  });
}

const VALID_TABS: ProfileTabKey[] = [
  "overview",
  "stats",
  "reviews",
  "comments",
  "dramas",
  "events",
  "trips",
  "places",
  "tickets",
];

/** Название страны на языке страницы: коды в базе, подписи из Intl —
 *  как в настройках (см. src/lib/countries.ts). */
function countryName(code: string, locale: Locale): string | null {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? null;
  } catch {
    return null;
  }
}

/**
 * ЕДИНАЯ страница профиля — и для себя, и для зрителей (редизайн по
 * референсу владельца): слева колонка с фото, бейджами, краткой инфой,
 * ачивками и друзьями; справа вкладки. Свой профиль открывается здесь
 * же с полным набором вкладок (кабинет /account теперь permanent
 * redirect сюда), чужой — с урезанным по приватности и подписке.
 *
 * Приватность решается СЕРВЕРНО, в выборках: зрительские вкладки не
 * получают чужих приватных данных даже в пропсах (приватные отзывы,
 * невидимые поездки/списки, email, билеты).
 */
export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale, t } = await getT();
  const p = t.social.profile;
  const viewer = await getCurrentUser();
  if (!viewer) redirect(localeHref("/login", locale));

  const { id } = await params;
  const { tab } = await searchParams;
  // Ник от id отличаем по формату: id — это cuid (начинается с "c" и
  // длинный), ник короче и может быть любым допустимым словом.
  const looksLikeId = /^c[a-z0-9]{20,}$/.test(id);
  const username = looksLikeId ? null : id;

  const user = await prisma.user.findUnique({
    // Ник в адресе (/users/keetmine) — им делятся с друзьями; id
    // остаётся рабочим для старых ссылок и аккаунтов без ника.
    where: username ? { username } : { id },
  });
  // Удалённый аккаунт публично не существует.
  if (!user || user.deletedAt) notFound();

  // Свой профиль по любому адресу (id или ник) открывается как обычная
  // страница — редиректа в кабинет больше нет (жалоба владельца: «свой
  // профиль глазами других вообще не открыть»).
  const isSelf = viewer.id === user.id;
  const ownerPremium = isPremiumActive(user);
  const viewerPremium = isPremiumActive(viewer);

  // Друзья владельца — и счётчик, и сетка аватарок в левой колонке
  // (жалоба владельца: «друзей на профиле не видно»).
  const friendships = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: {
      // premiumUntil — для цветной обводки аватарок подписчиков в сетке
      // друзей (правка владельца п.6).
      requester: { select: { id: true, username: true, name: true, photoUrl: true, premiumUntil: true } },
      addressee: { select: { id: true, username: true, name: true, photoUrl: true, premiumUntil: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const friends = friendships.map((f) => (f.requesterId === user.id ? f.addressee : f.requester));
  const isFriend = !isSelf && friends.some((f) => f.id === viewer.id);

  // Приватный профиль (Г8): друзья и сам владелец видят всё; остальным —
  // мастер-выключатель + точечные блоки.
  const showActivity = isSelf || isFriend || !user.hideProfileActivity;
  const showAchievements = showActivity && (isSelf || isFriend || !user.hideAchievements);
  const showFavorites = showActivity && (isSelf || isFriend || !user.hideFavoritePerformers);
  const showVisited = showActivity && (isSelf || isFriend || !user.hideVisitedPlaces);

  const muteRow =
    isFriend
      ? await prisma.friendNotificationMute.findUnique({
          where: { userId_mutedFriendId: { userId: viewer.id, mutedFriendId: user.id } },
        })
      : null;
  // Не-друзьям в шапке нужна кнопка «В друзья» — а если заявка уже висит
  // (в любую сторону), показываем её состояние вместо кнопки.
  const pendingFriendship =
    isSelf || isFriend
      ? null
      : await prisma.friendship.findFirst({
          where: {
            status: "PENDING",
            OR: [
              { requesterId: viewer.id, addresseeId: user.id },
              { requesterId: user.id, addresseeId: viewer.id },
            ],
          },
        });

  // ---------- Общие выборки (видимость решается прямо в where) ----------

  const tripVisibilities: ("PRIVATE" | "FRIENDS" | "PUBLIC")[] = isSelf
    ? ["PRIVATE", "FRIENDS", "PUBLIC"]
    : isFriend
      ? ["FRIENDS", "PUBLIC"]
      : ["PUBLIC"];

  const listVisibilityWhere = isSelf
    ? {}
    : {
        OR: [
          { visibility: "PUBLIC" as const },
          ...(isFriend ? [{ visibility: "FRIENDS" as const }] : []),
        ],
      };

  const eventWithOccurrences = {
    include: {
      performers: {
        include: { performer: { select: { id: true, name: true, slug: true } } },
      },
      occurrences: { orderBy: { startsAt: "asc" as const } },
    },
  };

  const [
    attendances,
    favoritePerformersCount,
    watchRows,
    watchCount,
    trips,
    placeLists,
    artistLists,
    visitedPlaces,
    reviewRows,
    commentRows,
  ] = await Promise.all([
    // «Иду»: себе — полный список для вкладки «События», зрителю — только
    // для блока будущих событий и счётчика.
    prisma.eventAttendance.findMany({
      where: { userId: user.id },
      include: { event: eventWithOccurrences, occurrence: true },
    }),
    prisma.favoritePerformer.count({ where: { userId: user.id } }),
    showActivity
      ? prisma.dramaWatchStatus.findMany({
          where: { userId: user.id },
          include: {
            drama: {
              select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true, episodes: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 60,
        })
      : [],
    prisma.dramaWatchStatus.count({ where: { userId: user.id } }),
    prisma.trip.findMany({
      where: { userId: user.id, visibility: { in: tripVisibilities } },
      orderBy: { startDate: "desc" },
    }),
    prisma.placeList.findMany({
      where: { userId: user.id, ...listVisibilityWhere },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.performerList.findMany({
      where: { userId: user.id, ...listVisibilityWhere },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    }),
    showVisited
      ? prisma.locationVisit.findMany({
          where: { userId: user.id },
          include: { location: { select: { id: true, slug: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 24,
        })
      : [],
    // Отзывы: чужой приватный не попадает даже в HTML — фильтр в выборке.
    showActivity
      ? prisma.review.findMany({
          where: { userId: user.id, ...(isSelf ? {} : { isPrivate: false }) },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            rating: true,
            text: true,
            isPrivate: true,
            createdAt: true,
            drama: { select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true } },
            novel: { select: { id: true, slug: true, title: true, coverUrl: true } },
            event: { select: { id: true, slug: true, title: true, posterUrl: true } },
          },
        })
      : [],
    // Комментарии публичны (приватности у модели Comment нет), но
    // подчиняются мастер-выключателю hideProfileActivity — как и все
    // вкладки: при скрытой активности зритель не получает ни одной.
    showActivity
      ? prisma.comment.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            text: true,
            createdAt: true,
            drama: { select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true } },
            novel: { select: { id: true, slug: true, title: true, coverUrl: true } },
            event: { select: { id: true, slug: true, title: true, posterUrl: true } },
          },
        })
      : [],
  ]);

  const now = new Date();
  const goingEventIds = new Set(attendances.map((a) => a.eventId));

  // ---------- Лента «Последние обновления» ----------
  // Права зрителя считает страница, лента только исполняет (см.
  // src/lib/activityFeed.ts): приватные отзывы — только себе, «иду» —
  // платная лента событий, ачивки/избранные — переключатели приватности,
  // поездки — их собственные правила видимости.
  // 10 записей, не 20: лента ужалась в узкую правую колонку обзора
  // (правка владельца п.1).
  const activityItems = showActivity
    ? await getActivityFeed(
        user.id,
        {
          privateReviews: isSelf,
          going: isSelf || viewerPremium,
          favoritePerformers: showFavorites,
          achievements: showAchievements,
          tripVisibilities,
        },
        10,
      )
    : [];

  // ---------- Статистика ----------
  // Себе — всегда (заодно syncAchievements фиксирует новые ачивки, как
  // раньше делал кабинет); зрителю — только если владелец с подпиской и
  // не скрыл активность (та же логика «чужая статистика видна у
  // премиума», что была у чипов старого профиля).
  const statsVisibleToViewer = !isSelf && ownerPremium && showActivity;
  const fullStats = isSelf || statsVisibleToViewer ? await computeUserStats(user.id) : null;
  const achievementStates =
    isSelf && fullStats ? await syncAchievements(user.id, fullStats) : null;
  const unlockedBadges = isSelf
    ? ownerPremium
      ? (achievementStates ?? []).filter((a) => a.unlocked)
      : []
    : showAchievements
      ? await getUnlockedAchievements(user.id)
      : [];
  const achievementsTotal = achievementStates?.length ?? 0;

  const statsForTab: StatsForTab | null = fullStats
    ? {
        attendedEvents: fullStats.attendedEvents,
        upcomingEvents: fullStats.upcomingEvents,
        performersSeenLive: fullStats.performersSeenLive,
        attendedEventsList: fullStats.attendedEventsList,
        seenPerformers: fullStats.seenPerformers,
        topPerformers: fullStats.topPerformers,
        // Скрытые «посещённые места» не должны уехать зрителю даже в
        // пропсах — вычищаем из свода, а не прячем при отрисовке.
        visitedLocations: showVisited ? fullStats.visitedLocations : 0,
        visitedLocationPins: showVisited ? fullStats.visitedLocationPins : [],
        completedDramas: fullStats.completedDramas,
        episodesWatched: fullStats.episodesWatched,
        hoursWatched: fullStats.hoursWatched,
        trips: fullStats.trips,
        daysInThailand: fullStats.daysInThailand,
        friends: fullStats.friends,
        eventsByYear: fullStats.eventsByYear,
      }
    : null;

  // ---------- Вкладка «События» ----------
  // Себе: тот же набор, что был в кабинете (иду/прошедшие/избранное,
  // за подпиской); зрителю: будущие «иду» (лента событий платная для
  // ЗРИТЕЛЯ — без подписки только счётчик).
  let selfEventsPanel: React.ReactNode = null;
  let ticketsPanel: React.ReactNode = null;
  let ticketsCount = 0;
  if (isSelf) {
    const favoriteEventRows = await prisma.favoriteEvent.findMany({
      where: { userId: user.id },
      include: { event: eventWithOccurrences },
    });
    const attendanceRows = attendances
      .map((a) => flattenOccurrence({ ...a.occurrence, event: a.event }))
      .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
    const upcomingAttendances = attendanceRows.filter((e) => e.startsAt >= now);
    const pastAttendances = attendanceRows.filter((e) => e.startsAt < now).reverse();
    // Избранное — про событие целиком (одна строка + «+N дат»), в отличие
    // от «иду», где отметки стоят на конкретные даты.
    const favoriteEvents = favoriteEventRows
      .filter((f) => f.event.occurrences.length > 0)
      .map((f) => ({
        row: flattenOccurrence({ ...f.event.occurrences[0], event: f.event }),
        extraDates: f.event.occurrences.length - 1,
      }))
      .sort((x, y) => x.row.startsAt.getTime() - y.row.startsAt.getTime());

    const allRows = [...attendanceRows, ...favoriteEvents.map((f) => f.row)];
    const [favoritedEventIds, goingOccurrenceIds] = await Promise.all([
      getFavoritedEventIds(allRows.map((e) => e.id), user.id),
      getGoingOccurrenceIds(allRows.map((e) => e.occurrenceId), user.id),
    ]);
    const favoritedSet = new Set(favoritedEventIds);
    const goingSet = new Set(goingOccurrenceIds);

    // Списки событий — за подпиской (как в кабинете): без неё массивы
    // не рендерим вовсе, короткое пояснение вместо них.
    const eventsLocked = !ownerPremium;
    const showUpcoming = eventsLocked ? [] : upcomingAttendances;
    const showPast = eventsLocked ? [] : pastAttendances;
    const showFavoriteEvents = eventsLocked ? [] : favoriteEvents;

    // Под-табы «Предстоящие / Прошедшие / Избранное» вместо трёх
    // секций-простыней (правка владельца п.4). Пилюли — SubTabs, нарочно
    // другой стиль, чем основной ряд вкладок; пустые группы пилюль не
    // получают.
    const eventSubTabs = [
      showUpcoming.length > 0 && {
        key: "upcoming",
        label: t.account.events.tabUpcoming,
        count: showUpcoming.length,
        content: (
          <div className="d-flex flex-column gap-3 mb-4">
            {showUpcoming.map((ev) => (
              <EventAgendaRow
                key={ev.occurrenceId}
                event={ev}
                isFavorited={favoritedSet.has(ev.id)}
                isGoing={goingSet.has(ev.occurrenceId)}
                showDate
              />
            ))}
          </div>
        ),
      },
      showPast.length > 0 && {
        key: "past",
        label: t.account.events.tabPast,
        count: showPast.length,
        content: (
          <div className="d-flex flex-column gap-3 opacity-50 mb-4">
            {showPast.map((ev) => (
              <EventAgendaRow
                key={ev.occurrenceId}
                event={ev}
                isFavorited={favoritedSet.has(ev.id)}
                isGoing={goingSet.has(ev.occurrenceId)}
                showDate
              />
            ))}
          </div>
        ),
      },
      showFavoriteEvents.length > 0 && {
        key: "favorites",
        label: t.account.events.tabFavorites,
        count: showFavoriteEvents.length,
        content: (
          <div className="d-flex flex-column gap-3 mb-4">
            {showFavoriteEvents.map(({ row, extraDates }) => (
              <EventAgendaRow
                key={row.id}
                event={row}
                isFavorited={favoritedSet.has(row.id)}
                isGoing={goingSet.has(row.occurrenceId)}
                showDate
                extraDates={extraDates}
              />
            ))}
          </div>
        ),
      },
    ].filter((tab) => tab !== false);

    selfEventsPanel = (
      <div>
        {eventsLocked && <p className="small text-secondary mb-3">{t.account.events.locked}</p>}
        {eventSubTabs.length > 0 && (
          <SubTabs tabs={eventSubTabs} ariaLabel={p.tabs.events} />
        )}
        {!eventsLocked && eventSubTabs.length === 0 && (
          <EmptyState
            emoji="🎫"
            title={t.account.events.emptyTitle}
            hint={t.account.events.emptyHint}
            cta={{ href: "/events", label: t.account.events.emptyCta }}
            compact
          />
        )}
      </div>
    );

    // Билеты — ТОЛЬКО себе: файл не должен попасть в чужую разметку.
    const ticketRows = await prisma.eventTicket.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        fileUrl: true,
        event: { select: { id: true, slug: true, title: true, venue: true } },
        occurrence: { select: { startsAt: true } },
      },
    });
    const tickets = ticketRows
      .map((row) => ({
        id: row.id,
        ticketUrl: row.fileUrl,
        event: row.event,
        startsAt: row.occurrence?.startsAt ?? null,
      }))
      .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
    ticketsCount = tickets.length;
    ticketsPanel = <TicketsTab tickets={tickets} />;
  }

  // «Иду» per-дата: события с отмеченными будущими датами (для зрителя).
  const goingByEvent = new Map<
    string,
    { event: (typeof attendances)[number]["event"]; occurrences: { startsAt: Date }[] }
  >();
  for (const a of attendances) {
    if (a.occurrence.startsAt < now) continue;
    const cur = goingByEvent.get(a.eventId);
    if (cur) cur.occurrences.push({ startsAt: a.occurrence.startsAt });
    else goingByEvent.set(a.eventId, { event: a.event, occurrences: [{ startsAt: a.occurrence.startsAt }] });
  }
  const upcomingGoing = Array.from(goingByEvent.values())
    .map((g) => ({
      ...g.event,
      occurrences: g.occurrences.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime()),
    }))
    .sort(
      (a, b) =>
        (a.occurrences[0]?.startsAt.getTime() ?? 0) - (b.occurrences[0]?.startsAt.getTime() ?? 0),
    );

  // ---------- Вкладка «Отзывы» ----------
  const reviews: MyReviewRow[] = reviewRows.flatMap((r) => {
    const target = r.drama
      ? {
          href: dramaHref(r.drama),
          title: dramaTitleForLocale(r.drama, locale),
          imageUrl: r.drama.posterUrl,
        }
      : r.novel
        ? { href: novelHref(r.novel), title: r.novel.title, imageUrl: r.novel.coverUrl }
        : r.event
          ? { href: eventHref(r.event), title: r.event.title, imageUrl: r.event.posterUrl }
          : null;
    if (!target) return []; // осиротевший отзыв без записи — не показываем
    return [
      {
        id: r.id,
        rating: r.rating,
        text: r.text,
        isPrivate: r.isPrivate,
        createdAt: r.createdAt,
        ...target,
      },
    ];
  });

  // ---------- Вкладка «Комментарии» ----------
  // Своего адреса у комментария нет — ссылка ведёт на страницу записи,
  // где живёт тред (тот же принцип, что у отзывов).
  const comments: MyCommentRow[] = commentRows.flatMap((row) => {
    const target = row.drama
      ? {
          href: dramaHref(row.drama),
          title: dramaTitleForLocale(row.drama, locale),
          imageUrl: row.drama.posterUrl,
        }
      : row.novel
        ? { href: novelHref(row.novel), title: row.novel.title, imageUrl: row.novel.coverUrl }
        : row.event
          ? { href: eventHref(row.event), title: row.event.title, imageUrl: row.event.posterUrl }
          : null;
    if (!target) return []; // осиротевший комментарий без записи
    return [{ id: row.id, text: row.text, createdAt: row.createdAt, ...target }];
  });

  const displayName = user.name || p.fallbackName;
  const country = user.country ? countryName(user.country, locale) : null;

  // ---------- Сборка вкладок ----------
  const favoriteEventsCount = isSelf
    ? await prisma.favoriteEvent.count({ where: { userId: user.id } })
    : 0;
  const tabs: { key: ProfileTabKey; label: string; content: React.ReactNode }[] = [];

  // Строка будущего «иду» — одна и та же в обзоре и на вкладке «События»
  // зрителя.
  const goingRow = (event: (typeof upcomingGoing)[number]) => {
    const dates = event.occurrences.map((o) => o.startsAt);
    const first = event.occurrences[0];
    return (
      <AppLink
        key={event.id}
        href={eventHref(event)}
        className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-2 profile-going-row"
      >
        {/* Постер + дата под названием — правка владельца: строка
            узнаваема обложкой, а дата читается вместе с названием, а не
            отдельной колонкой справа. */}
        <LetterAvatar name={event.title} photoUrl={event.posterUrl} size={3.25} rounded={false} />
        <div style={{ minWidth: 0 }} className="flex-grow-1">
          {/* Одна строка с многоточием — правка владельца: длинное
              название не ломает строку события. */}
          <p className="font-display fw-medium text-white mb-0 text-truncate">{event.title}</p>
          <p className="small text-secondary mb-0 text-capitalize">
            {dates.length === 1
              ? formatHumanDate(dates[0], locale)
              : formatCombinedDateList(dates, locale)}
            {first && ` · ${formatTime(first.startsAt)}`}
          </p>
          <p className="small text-secondary mb-0">
            <PinIcon /> {event.venue}
          </p>
        </div>
      </AppLink>
    );
  };

  if (showActivity) {
    // ---------- Вкладка «Обзор»: две колонки (правка владельца п.1 по
    // референсу MyDramaList) — справа узкая лента «Последние обновления»
    // (10 записей), слева содержательная колонка: «Смотрю сейчас»,
    // ближайшие «иду», свежие отзывы; любимые актёры — компактным
    // раскрывашкой внизу (блок-список убран, п.2, но путь к ним
    // сохранён). ----------
    const watchingNow = watchRows.filter((w) => w.status === "WATCHING").slice(0, 6);
    // «Иду» — платная лента для зрителя, тот же гейт, что у вкладки
    // «События».
    const overviewGoing = isSelf || viewerPremium ? upcomingGoing.slice(0, 3) : [];
    const overviewReviews = reviews.slice(0, 3);
    const hasOverviewLeft =
      watchingNow.length > 0 ||
      overviewGoing.length > 0 ||
      overviewReviews.length > 0;

    tabs.push({
      key: "overview",
      label: p.tabs.overview,
      content: (
        <div>
          {isSelf && statsForTab && (
            <ProfileOverview
              nav={{
                going: goingEventIds.size,
                favoriteEvents: favoriteEventsCount,
                favoritePerformers: favoritePerformersCount,
                dramas: watchCount,
                friends: friends.length,
                trips: trips.length,
                locations: statsForTab.visitedLocations,
              }}
            />
          )}
          {/* Пустому профилю двухколонник не нужен: лента с её
              EmptyState занимает всю ширину, как раньше. */}
          <div className={hasOverviewLeft ? "profile-overview-grid" : undefined}>
            {hasOverviewLeft && (
              <div className="profile-overview-main">
                {watchingNow.length > 0 && (
                  <section className="mb-4">
                    <h2 className="section-heading mb-2">{p.overviewWatching}</h2>
                    <div className="d-flex flex-column gap-1">
                      {watchingNow.map((w) => (
                        <DramaRow key={w.drama.id} w={w} t={t} locale={locale} />
                      ))}
                    </div>
                  </section>
                )}
                {overviewGoing.length > 0 && (
                  <section className="mb-4">
                    <h2 className="section-heading mb-2">{p.overviewGoing}</h2>
                    <div className="d-flex flex-column gap-2">{overviewGoing.map(goingRow)}</div>
                  </section>
                )}
                {overviewReviews.length > 0 && (
                  <section className="mb-4">
                    <h2 className="section-heading mb-2">{p.overviewReviews}</h2>
                    <ReviewsTab reviews={overviewReviews} viewer={!isSelf} />
                  </section>
                )}
                {/* Блока «Любимые актёры» здесь больше нет — решение
                    владельца (2026-09-04, вторая итерация): к любимым
                    ведёт бейдж/чип «любимые артисты», дублировать
                    списком незачем. */}
              </div>
            )}
            <aside className="profile-overview-feed">
              <h2 className="section-heading mb-2">{p.activity.title}</h2>
              <ActivityList
                items={activityItems}
                t={t}
                locale={locale}
                isSelf={isSelf}
                ownerName={displayName}
              />
            </aside>
          </div>
        </div>
      ),
    });

    // Статистика: себе — всегда вкладка (у бесплатного внутри компактный
    // апселл вместо двух гигантских пейволлов); зрителю — только когда
    // у владельца подписка и активность не скрыта.
    if (isSelf || statsVisibleToViewer) {
      tabs.push({
        key: "stats",
        label: p.tabs.stats,
        content:
          isSelf && !ownerPremium ? (
            <StatsUpsell
              title={t.account.overview.lockedTitle}
              description={t.account.overview.lockedDescription}
            />
          ) : statsForTab ? (
            <div>
              {/* Hero-плитки — одни и те же у владельца и зрителя
                  (правка владельца п.8): раньше владелец видел их в
                  «Обзоре», а зритель — здесь, и вкладки разъезжались. */}
              <StatsHero stats={statsForTab} />
              <StatsTab stats={statsForTab} viewer={!isSelf} />
            </div>
          ) : null,
      });
    }

    tabs.push({
      key: "reviews",
      label: p.tabs.reviews,
      content: <ReviewsTab reviews={reviews} viewer={!isSelf} />,
    });

    // Комментарии публичны — вкладку видит и зритель; гейт только
    // мастер-выключатель hideProfileActivity (мы внутри showActivity).
    tabs.push({
      key: "comments",
      label: p.tabs.comments,
      content: (
        <CommentsTab
          comments={comments}
          t={t}
          locale={locale}
          isSelf={isSelf}
          ownerName={displayName}
        />
      ),
    });

    tabs.push({
      key: "dramas",
      label: p.tabs.dramas,
      content: (
        <DramasPanel
          watchRows={watchRows}
          t={t}
          locale={locale}
          isSelf={isSelf}
          ownerName={displayName}
        />
      ),
    });

    tabs.push({
      key: "events",
      label: p.tabs.events,
      content: isSelf ? (
        selfEventsPanel
      ) : (
        <div>
          {!viewerPremium ? (
            <p className="small text-secondary mb-4">
              {upcomingGoing.length > 0
                ? p.goingLockedWithCount(upcomingGoing.length)
                : p.goingLocked}
            </p>
          ) : upcomingGoing.length === 0 ? (
            <EmptyState
              emoji="🎫"
              title={p.goingEmptyTitle}
              hint={p.goingEmptyHint(displayName)}
              compact
            />
          ) : (
            <div className="d-flex flex-column gap-2 mb-4">{upcomingGoing.map(goingRow)}</div>
          )}
        </div>
      ),
    });

    tabs.push({
      key: "trips",
      label: p.tabs.trips,
      content: (
        <div>
          {trips.length === 0 ? (
            <EmptyState
              emoji="🧳"
              title={p.tripsTab.emptyTitle}
              hint={isSelf ? p.tripsTab.emptyHintSelf : p.tripsTab.emptyHintViewer(displayName)}
              cta={isSelf ? { href: "/trips", label: p.tripsTab.emptyCtaSelf } : undefined}
              compact
            />
          ) : (
            <>
              <div className="d-flex flex-column gap-2 mb-3">
                {trips.map((trip) => (
                  <AppLink
                    key={trip.id}
                    href={tripHref(trip)}
                    className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
                  >
                    <div>
                      <p className="font-display fw-medium text-white mb-0">{trip.title}</p>
                      <p className="small text-secondary mb-0">
                        <CalendarIcon className="icon-inline" />{" "}
                        {formatShortDate(trip.startDate, locale)} –{" "}
                        {formatShortDate(trip.endDate, locale)} {trip.endDate.getFullYear()}
                      </p>
                    </div>
                    <span className="small text-secondary flex-shrink-0">
                      {p.visibility[trip.visibility]}
                    </span>
                  </AppLink>
                ))}
              </div>
              {isSelf && (
                <AppLink href="/trips" className="small link-body-emphasis">
                  {p.tripsTab.manage} →
                </AppLink>
              )}
            </>
          )}
        </div>
      ),
    });

    tabs.push({
      key: "places",
      label: p.tabs.places,
      content: (
        <div>
          {placeLists.length === 0 && artistLists.length === 0 && visitedPlaces.length === 0 ? (
            <EmptyState
              emoji="📍"
              title={p.placesTab.emptyTitle}
              hint={isSelf ? p.placesTab.emptyHintSelf : p.placesTab.emptyHintViewer(displayName)}
              cta={isSelf ? { href: "/lists", label: p.placesTab.emptyCtaSelf } : undefined}
              compact
            />
          ) : (
            <>
              {placeLists.length > 0 && (
                <>
                  <h2 className="section-heading mb-2">{p.placeLists}</h2>
                  <div className="d-flex flex-column gap-2 mb-4">
                    {placeLists.map((l) => (
                      <AppLink
                        key={l.id}
                        href={listHref(l)}
                        className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
                      >
                        <div style={{ minWidth: 0 }}>
                          <p className="font-display fw-medium text-white mb-0 text-truncate">
                            {l.title}
                          </p>
                          {l.description && (
                            <p className="small text-secondary mb-0 text-truncate">{l.description}</p>
                          )}
                        </div>
                        <span className="small text-secondary flex-shrink-0">
                          {p.placeCount(l._count.items)}
                        </span>
                      </AppLink>
                    ))}
                  </div>
                </>
              )}

              {(artistLists.length > 0 || isSelf) && (
                <>
                  <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
                    <h2 className="section-heading mb-0">{p.artistLists}</h2>
                    {/* Новые списки — по подписке; уже созданные остаются
                        доступны: отбирать сделанное нельзя. */}
                    {isSelf && ownerPremium && <CreateArtistListButton small />}
                  </div>
                  {artistLists.length === 0 ? (
                    <p className="small text-secondary mb-4">
                      {ownerPremium ? t.account.stats.artistListsHint : t.account.stats.artistListsLocked}
                    </p>
                  ) : (
                    <div className="d-flex flex-column gap-2 mb-4">
                      {artistLists.map((l) => (
                        <AppLink
                          key={l.id}
                          href={artistListHref(l)}
                          className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
                        >
                          <div style={{ minWidth: 0 }}>
                            <p className="font-display fw-medium text-white mb-0 text-truncate">
                              {l.title}
                            </p>
                            {l.description && (
                              <p className="small text-secondary mb-0 text-truncate">
                                {l.description}
                              </p>
                            )}
                          </div>
                          <span className="small text-secondary flex-shrink-0">
                            {p.artistCount(l._count.items)}
                          </span>
                        </AppLink>
                      ))}
                    </div>
                  )}
                </>
              )}

              {visitedPlaces.length > 0 && (
                <>
                  <h2 className="section-heading mb-2">{p.visitedPlaces}</h2>
                  <div className="d-flex flex-wrap gap-2 mb-4">
                    {visitedPlaces.map((v) => (
                      <AppLink
                        key={v.locationId}
                        href={locationHref(v.location)}
                        className="event-chip text-decoration-none"
                      >
                        📍 {v.location.name}
                      </AppLink>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ),
    });

    if (isSelf && ticketsCount > 0 && ticketsPanel) {
      tabs.push({ key: "tickets", label: p.tabs.tickets(ticketsCount), content: ticketsPanel });
    }
  }

  // Сохранённые ссылки вида /account?tab=… приезжают сюда редиректом с
  // уже переписанным ?tab= (см. account/page.tsx).
  const initialTab: ProfileTabKey = VALID_TABS.includes(tab as ProfileTabKey)
    ? (tab as ProfileTabKey)
    : "overview";

  return (
    <div className="profile-layout">
      {/* ЛЕВАЯ КОЛОНКА: фото, имя, бейджи, краткая инфа, ачивки, друзья
          (референс владельца). Ссылки-возврата у профиля больше нет:
          своему она не нужна вовсе, а чужому «← Друзья» врала о том,
          откуда пришли, — назад ведут браузер и навигация. */}
      <aside className="profile-side">
        {/* Цветная обводка фото у подписчика (правка владельца п.6);
            тот же визуал у мини-аватарок — .premium-ring. */}
        <div className={`profile-side-photo${ownerPremium ? " profile-side-photo-premium" : ""}`}>
          {user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoUrl} alt={displayName} loading="eager" decoding="async" />
          ) : (
            <span className="profile-side-fallback" aria-hidden>
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <h1 className="profile-side-name mb-0">{displayName}</h1>
          {/* Подписка — иконкой со всплывающей расшифровкой, а не
              текстовым бейджем (правка владельца п.6). tabIndex — чтобы
              title/aria были достижимы и с клавиатуры. */}
          {ownerPremium ? (
            <span
              className="premium-badge-icon"
              title={t.account.planPremiumHint}
              aria-label={t.account.planPremiumHint}
              role="img"
              tabIndex={0}
            >
              <StarIcon />
            </span>
          ) : (
            isSelf && (
              <span className="badge rounded-pill text-bg-secondary" style={{ fontSize: "0.65rem" }}>
                {t.account.planFree}
              </span>
            )
          )}
        </div>

        {/* Инфо-блок подписями (правка владельца, образец MDL):
            Онлайн / Локация / Дата рождения / Роль / Дата регистрации.
            Пустые строки не рисуются. Почты здесь нет вовсе (даже
            своей — она в настройках), био — сразу ниже. */}
        <div className="profile-side-meta">
          {user.username && <span className="text-secondary">@{user.username}</span>}
          {user.lastSeenAt && (
            <span className="text-secondary">
              {p.metaOnline}:{" "}
              <span className="text-body">
                {now.getTime() - user.lastSeenAt.getTime() < ONLINE_WINDOW_MS ? (
                  <>
                    {p.metaOnlineNow} <span className="online-dot" aria-hidden />
                  </>
                ) : (
                  formatRelativeTime(user.lastSeenAt, locale)
                )}
              </span>
            </span>
          )}
          {country && (
            <span className="text-secondary">
              {p.metaLocation}: <span className="text-body">{country}</span>
            </span>
          )}
          {user.birthDate && (
            <span className="text-secondary">
              {p.metaBirthday}:{" "}
              <span className="text-body">{formatLongDate(user.birthDate, locale)}</span>
            </span>
          )}
          {/* Строка «Роль» убрана — владельцу не понравилось, как звучат
              названия; подписку и так показывает звёздочка у имени. */}
          {/* «Дата регистрации» показана и убрана в один день — решение
              владельца. */}
        </div>

        {user.bio && showActivity && <p className="profile-side-bio">{user.bio}</p>}

        {/* Действия: себе — «Настройки»/«Выйти» (переехали из шапки
            кабинета); чужому — дружеские кнопки. */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          {isSelf ? (
            <>
              <AppLink href="/account/settings" className="btn btn-ghost btn-sm">
                {t.account.settingsLink}
              </AppLink>
              <form action={logout}>
                <button type="submit" className="btn btn-outline-secondary btn-sm">
                  {t.account.logout}
                </button>
              </form>
            </>
          ) : isFriend ? (
            <>
              <span className="date-chip">
                <CheckIcon /> {p.yourFriend}
              </span>
              <FriendNotifyToggle friendId={user.id} muted={!!muteRow} />
            </>
          ) : pendingFriendship ? (
            pendingFriendship.requesterId === viewer.id ? (
              <span className="date-chip">{p.requestSent}</span>
            ) : (
              <AppLink href="/friends" className="btn btn-primary btn-sm">
                {p.answerRequest}
              </AppLink>
            )
          ) : (
            // Обёртка растягивает кнопку «В друзья» на всю ширину блока
            // под фото (правка владельца п.5) — стили в globals.css.
            <div className="profile-side-friend-cta">
              <FriendActionButton
                action={sendFriendRequest}
                id={user.id}
                label={p.addFriend}
                pendingLabel={p.adding}
              />
            </div>
          )}
        </div>

        {/* Ряда чипов-счётчиков (друзья/события/актёры/сериалы) в левой
            колонке больше нет — правка владельца п.7; те же числа живут
            чипами-ссылками в «Обзоре» и на вкладках. */}

        {unlockedBadges.length > 0 && (
          <div className="profile-side-block">
            <h2 className="section-heading mb-2">
              {p.achievements}
              {isSelf && achievementsTotal > 0 && (
                <span className="text-secondary text-lowercase ms-2" style={{ letterSpacing: 0 }}>
                  {t.account.stats.achievementsProgress(unlockedBadges.length, achievementsTotal)}
                </span>
              )}
            </h2>
            {/* Только иконки; название и описание — в title/aria-label
                медали (правка владельца п.3). Строки «остальные пока
                секрет» больше нет. */}
            <div className="d-flex flex-wrap gap-2">
              {unlockedBadges.map((b) => (
                <AchievementBadge
                  key={b.key}
                  emoji={b.emoji}
                  title={b.title}
                  hint={b.hint}
                  unlockedAt={b.unlockedAt}
                  iconOnly
                  locale={locale}
                />
              ))}
            </div>
          </div>
        )}

        {/* Друзья: сетка аватарок + счётчик. Полный список — только у
            себя (/friends): чужого списка друзей как страницы нет. */}
        {showActivity && (
          <div className="profile-side-block">
            {/* mb-3: заголовок не липнет к сетке (правка владельца). */}
            <h2 className="section-heading mb-3">
              {p.friendsTitle}
              <span className="text-secondary ms-2" style={{ letterSpacing: 0 }}>
                {friends.length}
              </span>
            </h2>
            {friends.length === 0 ? (
              <p className="small text-secondary mb-0">
                {isSelf ? p.friendsEmptySelf : p.friendsEmpty}
              </p>
            ) : (
              <>
                <div className="profile-friend-grid">
                  {friends.slice(0, 12).map((f) => (
                    <AppLink
                      key={f.id}
                      href={`/users/${f.username ?? f.id}`}
                      // Подписчики — с цветной обводкой (п.6, тот же
                      // .premium-ring, что у LetterAvatar premiumRing).
                      className={`profile-friend${isPremiumActive(f) ? " premium-ring" : ""}`}
                      title={f.name ?? undefined}
                    >
                      {f.photoUrl ? (
                        // alt пустой: имя уже в title, а сломанная
                        // картинка с alt-текстом вылезала из круга.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={f.photoUrl} alt="" />
                      ) : (
                        <span aria-hidden>{(f.name || "?").charAt(0).toUpperCase()}</span>
                      )}
                    </AppLink>
                  ))}
                </div>
                {isSelf && (
                  <AppLink href="/friends" className="small link-body-emphasis d-inline-block mt-3">
                    {p.friendsAll} →
                  </AppLink>
                )}
              </>
            )}
          </div>
        )}

        {/* «Пожаловаться» — тихая мелкая ссылка внизу ЛЕВОЙ колонки
            (правка владельца п.10), только на чужом профиле. */}
        {!isSelf && (
          <p className="profile-side-report mb-0">
            <ReportButton targetType="profile" targetId={user.id} />
          </p>
        )}
      </aside>

      {/* ПРАВАЯ КОЛОНКА: вкладки. */}
      <div className="profile-main">
        {showActivity ? (
          <ProfileTabs initialTab={initialTab} tabs={tabs} />
        ) : (
          <p className="small text-secondary">{p.hidden}</p>
        )}
      </div>
    </div>
  );
}

type ProfileWatchRow = {
  status: (typeof WATCH_STATUS_ORDER)[number];
  episodesWatched: number | null;
  updatedAt: Date;
  drama: {
    id: string;
    slug: string | null;
    title: string;
    titleRu: string | null;
    posterUrl: string | null;
    episodes: number | null;
  };
};

/** Компактная строка сериала — та же плотность, что у каталога /dramas
 *  (мелкая миниатюра, прогресс одним потоком с названием); используется
 *  вкладкой «Сериалы» и блоком «Смотрю сейчас» в обзоре. Геометрия —
 *  .profile-drama-row в globals.css. */
function DramaRow({ w, t, locale }: { w: ProfileWatchRow; t: Dict; locale: Locale }) {
  const p = t.social.profile;
  const progress = episodeProgress(
    { status: w.status, episodesWatched: w.episodesWatched },
    w.drama.episodes,
  );
  return (
    <AppLink
      href={dramaHref(w.drama)}
      className="surface surface-hover text-decoration-none profile-drama-row"
    >
      <span className="profile-drama-poster" aria-hidden={!w.drama.posterUrl}>
        {w.drama.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={w.drama.posterUrl} alt="" />
        ) : (
          <span className="profile-drama-poster-fallback font-display fw-bold" aria-hidden>
            {dramaTitleForLocale(w.drama, locale).trim().charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="profile-drama-title">
        <span className="text-white fw-medium">{dramaTitleForLocale(w.drama, locale)}</span>
      </span>
      {/* Справа — прогресс, а не дата (правка владельца): «когда
          отметил» ничего не говорит, «сколько просмотрено» — говорит.
          Без прогресса (нет числа серий, «в планах») правый край пуст. */}
      {progress && (
        <span className="small text-secondary flex-shrink-0 ms-auto">
          {p.activity.episodes(progress.watched, progress.total)}
        </span>
      )}
    </AppLink>
  );
}

/** Вкладка «Сериалы»: под-табы по статусам (Смотрю/Просмотрено/…)
 *  вместо простыни всех групп, строки компактные — как в каталоге
 *  /dramas (правка владельца п.4). Пустые статусы пилюль не получают. */
function DramasPanel({
  watchRows,
  t,
  locale,
  isSelf,
  ownerName,
}: {
  watchRows: ProfileWatchRow[];
  t: Dict;
  locale: Locale;
  isSelf: boolean;
  ownerName: string;
}) {
  const p = t.social.profile;
  if (watchRows.length === 0) {
    return (
      <EmptyState
        emoji="📺"
        title={p.dramasTab.emptyTitle}
        hint={isSelf ? p.dramasTab.emptyHintSelf : p.dramasTab.emptyHintViewer(ownerName)}
        cta={isSelf ? { href: "/dramas", label: p.dramasTab.emptyCta } : undefined}
        compact
      />
    );
  }

  const statusTabs = WATCH_STATUS_ORDER.flatMap((status) => {
    const rows = watchRows.filter((w) => w.status === status);
    if (rows.length === 0) return [];
    return [
      {
        key: status,
        label: t.catalog.watchStatus[status],
        count: rows.length,
        content: (
          <div className="d-flex flex-column gap-1 mb-4">
            {rows.map((w) => (
              <DramaRow key={w.drama.id} w={w} t={t} locale={locale} />
            ))}
          </div>
        ),
      },
    ];
  });

  return (
    <div>
      <SubTabs tabs={statusTabs} ariaLabel={p.tabs.dramas} />
      {isSelf && (
        <AppLink href="/dramas" className="small link-body-emphasis">
          {p.dramasTab.all} →
        </AppLink>
      )}
    </div>
  );
}

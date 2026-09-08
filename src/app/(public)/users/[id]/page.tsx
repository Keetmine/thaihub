import { userDisplayName, userHref } from "@/lib/userProfile";
import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import ReportButton from "@/components/ReportButton";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
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
import { getT, type Dict, type Locale } from "@/lib/i18n";
import ActivityList from "./ActivityList";
import ProfileTabs, { type ProfileTabKey } from "./ProfileTabs";
import ProfileOverview from "./ProfileOverview";
import StatsHero from "./StatsHero";
import StatsTab, { type StatsForTab } from "./StatsTab";
import ReviewsTab, { type MyReviewRow } from "./ReviewsTab";
import CommentsTab, { type MyCommentRow } from "./CommentsTab";
import TicketsTab from "./TicketsTab";
import EpisodeProgress from "@/components/EpisodeProgress";
import DramasTable from "./DramasTable";
import CommunitiesTab from "./CommunitiesTab";
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

// Порядок — как в ряду вкладок (решение владельца 2026-09-08); сам
// список нужен только для проверки ?tab=, но держать его в том же
// порядке дешевле, чем потом гадать, почему они разошлись.
const VALID_TABS: ProfileTabKey[] = [
  "overview",
  "stats",
  "dramas",
  "events",
  "communities",
  "trips",
  "places",
  "tickets",
  "reviews",
  "comments",
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
  // Профиль открыт и БЕЗ входа (правка владельца 2026-09-06): ссылкой
  // на себя делятся снаружи, и упираться в форму логина она не должна.
  // Гость — это «чужой, который никому не друг»: ниже он проходит по
  // тем же веткам, что залогиненный незнакомец, и видит ровно то, что
  // владелец профиля открыл посторонним.
  const viewer = await getCurrentUser();

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
  const isSelf = viewer?.id === user.id;
  const ownerPremium = isPremiumActive(user);
  const viewerPremium = viewer ? isPremiumActive(viewer) : false;

  // Друзья владельца — и счётчик, и сетка аватарок в левой колонке
  // (жалоба владельца: «друзей на профиле не видно»).
  const friendships = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: {
      // Поля подписки — для цветной обводки аватарок подписчиков в сетке
      // друзей (правка владельца п.6).
      requester: {
        select: { id: true, username: true, name: true, photoUrl: true, premiumUntil: true, premiumLifetime: true },
      },
      addressee: {
        select: { id: true, username: true, name: true, photoUrl: true, premiumUntil: true, premiumLifetime: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const friends = friendships.map((f) => (f.requesterId === user.id ? f.addressee : f.requester));
  const isFriend = !!viewer && !isSelf && friends.some((f) => f.id === viewer.id);

  // Приватный профиль (Г8): друзья и сам владелец видят всё; остальным —
  // мастер-выключатель + точечные блоки.
  const showActivity = isSelf || isFriend || !user.hideProfileActivity;
  const showAchievements = showActivity && (isSelf || isFriend || !user.hideAchievements);
  const showFavorites = showActivity && (isSelf || isFriend || !user.hideFavoritePerformers);
  const showVisited = showActivity && (isSelf || isFriend || !user.hideVisitedPlaces);

  const muteRow =
    isFriend
      ? await prisma.friendNotificationMute.findUnique({
          where: { userId_mutedFriendId: { userId: viewer!.id, mutedFriendId: user.id } },
        })
      : null;
  // Не-друзьям в шапке нужна кнопка «В друзья» — а если заявка уже висит
  // (в любую сторону), показываем её состояние вместо кнопки.
  // Гостю заявку искать не по кому: у него нет своей учётки, а без
  // проверки запрос уходил с пустым идентификатором и ронял страницу.
  const pendingFriendship =
    !viewer || isSelf || isFriend
      ? null
      : await prisma.friendship.findFirst({
          where: {
            status: "PENDING",
            OR: [
              { requesterId: viewer!.id, addresseeId: user.id },
              { requesterId: user.id, addresseeId: viewer!.id },
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
    commentCount,
    viewerWatch,
  ] = await Promise.all([
    // «Иду»: себе — полный список для вкладки «События», зрителю — только
    // для блока будущих событий и счётчика.
    prisma.eventAttendance.findMany({
      // Только афишные события: профиль открыт другим людям, и отметка
      // «иду» на домашнюю встречу раздала бы её название и адрес тем,
      // кого в сообщество не звали (см. src/lib/catalogEvents.ts).
      where: { userId: user.id, event: catalogEventsWhere() },
      include: { event: eventWithOccurrences, occurrence: true },
    }),
    prisma.favoritePerformer.count({ where: { userId: user.id } }),
    showActivity
      ? prisma.dramaWatchStatus.findMany({
          where: { userId: user.id },
          include: {
            drama: {
              select: {
                id: true,
                slug: true,
                title: true,
                titleRu: true,
                posterUrl: true,
                episodes: true,
                // Колонки таблицы вкладки «Сериалы» (правка владельца
                // 2026-09-06) — те же, что в каталоге /dramas.
                type: true,
                country: true,
                year: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          // Раньше стояло take: 60 — и «Смотрю сейчас» в обзоре брался
          // из этих шестидесяти ПОСЛЕ фильтра по статусу: у владелицы
          // после импорта списка с MDL (около двухсот статусов) в срез
          // попадало что попало, а половина реально смотримых терялась
          // (жалоба владельца). Счётчики вкладки по той же причине
          // врали. Берём все статусы человека; потолок — защита от
          // абсурдного списка, а не рабочее ограничение.
          take: 2000,
        })
      : [],
    prisma.dramaWatchStatus.count({ where: { userId: user.id } }),
    prisma.trip.findMany({
      where: { userId: user.id, visibility: { in: tripVisibilities } },
      orderBy: { startDate: "desc" },
    }),
    prisma.placeList.findMany({
      // communityId: null — в профиле только ЛИЧНЫЕ списки. Список
      // сообщества принадлежит сообществу, а не тому, кто его завёл, и
      // название публичного списка ЗАКРЫТОГО сообщества светилось бы
      // тут посторонним (АА25).
      where: { userId: user.id, communityId: null, ...listVisibilityWhere },
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
    // Счётчик в подписи вкладки «Комментарии» (правка владельца
    // 2026-09-08). Отдельный count, а не длина строк выше: те срезаны
    // потолком take: 30, и у активного комментатора подпись врала бы.
    // Отзывам такой запрос не нужен — они выбираются без потолка, у них
    // счётчик берётся из длины уже полученного массива.
    showActivity ? prisma.comment.count({ where: { userId: user.id } }) : 0,
    // Совместимость вкусов (аудит 2026-09, раздел 7): узкий срез
    // статусов ЗРИТЕЛЯ — единственный дополнительный запрос блока,
    // сторона владельца берётся из уже выбранных watchRows. Гейты те же,
    // что у остальной активности: залогиненный на ЧУЖОМ профиле с
    // открытой активностью; гостю и себе считать не с кем.
    viewer && !isSelf && showActivity
      ? prisma.dramaWatchStatus.findMany({
          where: { userId: viewer.id },
          select: { dramaId: true, rating: true },
        })
      : [],
  ]);

  const now = new Date();
  const goingEventIds = new Set(attendances.map((a) => a.eventId));

  // ---------- Совместимость вкусов (чужой профиль) ----------
  // Пересечение отмеченных сериалов зрителя и владельца + совпавшие
  // высокие оценки (9+ у обоих). Порог ≥3 общих: «общего с вами: один
  // сериал» — не совместимость, а совпадение. При скрытой активности
  // viewerWatch пуст (см. выборку), так что блок не строится.
  let tasteMatch: { common: number; bothHigh: number } | null = null;
  if (viewerWatch.length > 0 && watchRows.length > 0) {
    const ownerRatingByDrama = new Map(watchRows.map((w) => [w.drama.id, w.rating]));
    let common = 0;
    let bothHigh = 0;
    for (const v of viewerWatch) {
      if (!ownerRatingByDrama.has(v.dramaId)) continue;
      common += 1;
      const ownerRating = ownerRatingByDrama.get(v.dramaId);
      if (v.rating != null && v.rating >= 9 && ownerRating != null && ownerRating >= 9) {
        bothHigh += 1;
      }
    }
    if (common >= 3) tasteMatch = { common, bothHigh };
  }

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
        rewatchTotal: fullStats.rewatchTotal,
        mostRewatched: fullStats.mostRewatched,
        topGenres: fullStats.topGenres,
        ratingVsMdl: fullStats.ratingVsMdl,
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
  // Счётчик в подписи вкладки «События» для СВОЕГО профиля: столько
  // строк лежит во всех под-табах вместе (иду по датам + избранные
  // события). Считается из уже выбранных массивов — лишних запросов
  // вкладке не нужно.
  let selfEventsCount = 0;
  if (isSelf) {
    const favoriteEventRows = await prisma.favoriteEvent.findMany({
      // Та же причина, что у «иду» выше: вкладка событий — про афишу.
      where: { userId: user.id, event: catalogEventsWhere() },
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

    // Считаем ДО платного гейта: у бесплатного владельца списки не
    // рендерятся, но своё количество он видеть должен — это его данные,
    // и число как раз объясняет, за что предлагается подписка.
    selfEventsCount = attendanceRows.length + favoriteEvents.length;

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
          <SubTabs tabs={eventSubTabs} ariaLabel={p.tabs.events(selfEventsCount)} />
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
    ? await prisma.favoriteEvent.count({
        // Счётчик считает ровно то, что показано в списке выше.
        where: { userId: user.id, event: catalogEventsWhere() },
      })
    : 0;

  // Сообщества человека (АА25). Приватность — прямо в where, как у
  // поездок и списков: то, чего зрителю не положено, не доезжает даже
  // до пропсов.
  //
  // ЗАКРЫТОЕ сообщество в ЧУЖОМ профиле не показывается вовсе — и
  // друзьям тоже, в отличие от остальных блоков. «Друзья видят всё» —
  // правило про данные ВЛАДЕЛЬЦА профиля, а состав закрытого сообщества
  // принадлежит не ему, а сообществу: назвать его — значит выдать
  // чужую тайну через профиль случайного участника. Само сообщество
  // закрыто ровно за этим (см. docs/features/communities.md).
  //
  // Заявки (PENDING) сюда не попадают: человек ещё не участник, а
  // «подавал заявку туда-то» — не то, что стоит показывать даже себе
  // отдельным списком.
  const communityMemberships = showActivity
    ? await prisma.communityMember.findMany({
        where: {
          userId: user.id,
          status: "ACTIVE",
          ...(isSelf ? {} : { community: { visibility: "PUBLIC" as const } }),
        },
        include: {
          community: {
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              coverUrl: true,
              visibility: true,
              _count: { select: { members: { where: { status: "ACTIVE" } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const myCommunities = communityMemberships.map((m) => ({
    id: m.community.id,
    slug: m.community.slug,
    title: m.community.title,
    description: m.community.description,
    coverUrl: m.community.coverUrl,
    isPrivate: m.community.visibility === "PRIVATE",
    members: m.community._count.members,
  }));

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
          {/* first-letter-cap, а не text-capitalize: капитализироваться
              должен только день недели, не месяц («25 Октября»). */}
          <p className="small text-secondary mb-0 first-letter-cap">
            {dates.length === 1
              ? formatHumanDate(dates[0], locale)
              : formatCombinedDateList(dates, locale)}
            {first && ` · ${formatTime(first.startsAt)}`}
          </p>
          {/* Пустой venue — онлайн-встреча сообщества: пин без текста
              выглядел бы как недогруженные данные, строку не рисуем. */}
          {event.venue && (
            <p className="small text-secondary mb-0">
              <PinIcon /> {event.venue}
            </p>
          )}
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
                        <DramaRow key={w.drama.id} w={w} t={t} locale={locale} editable={isSelf} />
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

    // Порядок вкладок дальше — решение владельца (2026-09-08): сначала
    // «что человек смотрит и куда ходит» (сериалы, события, сообщества,
    // поездки, места, билеты), а «Отзывы» и «Комментарии» — в самый
    // конец: это отклик на чужие записи, а не свой каталог.
    tabs.push({
      key: "dramas",
      // Счётчик в подписи вкладки — как у билетов (правка владельца).
      // watchCount — все отметки человека, ровно столько строк и в
      // пилюле «Все» внутри вкладки.
      label: p.tabs.dramas(watchCount),
      content: (
        <DramasPanel watchRows={watchRows} t={t} isSelf={isSelf} ownerName={displayName} />
      ),
    });

    tabs.push({
      key: "events",
      // Себе — все отметки вкладки (иду + избранное), зрителю — ровно
      // то, что ему покажут: будущие «иду». Оба числа уже посчитаны из
      // выбранных строк, отдельных запросов вкладке не нужно.
      label: p.tabs.events(isSelf ? selfEventsCount : upcomingGoing.length),
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

    // Сообщества — сразу после событий (решение владельца 2026-09-08).
    // Вкладка есть всегда (как «Места и списки»): пустая она у зрителя
    // выглядит ровно так же, как у человека без сообществ, — и по ней
    // нельзя догадаться, что закрытые всё-таки есть. По той же причине
    // счётчик считает ровно показанные строки: у зрителя в myCommunities
    // закрытых сообществ нет, и число их не выдаёт.
    tabs.push({
      key: "communities",
      label: p.tabs.communities(myCommunities.length),
      content: (
        <CommunitiesTab
          communities={myCommunities}
          isSelf={isSelf}
          ownerName={displayName}
          t={t}
        />
      ),
    });

    tabs.push({
      key: "trips",
      // Поездки уже выбраны с учётом видимости — длина массива и есть
      // то, что зритель увидит внутри.
      label: p.tabs.trips(trips.length),
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
      // Считаем СПИСКИ (места + артисты), а посещённые места — нет:
      // они срезаны потолком take: 24, и счётчик у человека с сотней
      // отметок обещал бы больше, чем показывают чипсы. Списки же
      // выбраны целиком и с учётом видимости.
      label: p.tabs.places(placeLists.length + artistLists.length),
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

    // «Отзывы» и «Комментарии» — в конце ряда (решение владельца
    // 2026-09-08).
    tabs.push({
      key: "reviews",
      // reviews — уже отфильтрованный массив (осиротевшие отзывы без
      // записи выброшены), поэтому считаем по нему, а не по reviewRows:
      // счётчик обязан совпадать с числом строк во вкладке.
      label: p.tabs.reviews(reviews.length),
      content: <ReviewsTab reviews={reviews} viewer={!isSelf} />,
    });

    // Комментарии публичны — вкладку видит и зритель; гейт только
    // мастер-выключатель hideProfileActivity (мы внутри showActivity).
    tabs.push({
      key: "comments",
      label: p.tabs.comments(commentCount),
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
              title={user.premiumLifetime ? t.account.planLifetimeHint : t.account.planPremiumHint}
              aria-label={user.premiumLifetime ? t.account.planLifetimeHint : t.account.planPremiumHint}
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
            pendingFriendship.requesterId === viewer?.id ? (
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

        {/* Совместимость вкусов (раздел 7 аудита): только на чужом
            профиле залогиненному, только при ≥3 общих сериалах — см.
            подсчёт tasteMatch выше. Строка про 9+ — лишь когда такие
            совпадения есть: «оценки 9+: 0» ничего не сообщает. */}
        {tasteMatch && (
          <div className="profile-side-block">
            <h2 className="section-heading mb-2">{p.tasteMatch.title}</h2>
            <p className="small text-secondary mb-0">
              {p.tasteMatch.common(tasteMatch.common)}
              {tasteMatch.bothHigh > 0 && (
                <>
                  <br />
                  {p.tasteMatch.bothHigh(tasteMatch.bothHigh)}
                </>
              )}
            </p>
          </div>
        )}

        {unlockedBadges.length > 0 && (
          <div className="profile-side-block">
            {/* Счётчика «N из N» тут нет (правка владельца 2026-09-09):
                общее число ачивок — это скорее список того, чего у
                человека ещё нет, и рядом с полученными медалями он
                читался как недобор. */}
            <h2 className="section-heading mb-2">{p.achievements}</h2>
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
                  {friends.slice(0, 12).map((f) => {
                    // Кто есть кто в сетке аватарок было не разобрать
                    // (жалоба владельца 2026-09-08). Показываем имя, а
                    // если ник отличается от него — ник в скобках: у
                    // многих в друзьях именно ник и на слуху.
                    const friendName = userDisplayName(f, locale);
                    // Сравниваем ник с ПОКАЗАННЫМ именем, а не с полем
                    // name: у кого имя не заполнено, userDisplayName и
                    // так вернёт ник — иначе выходило «vasya (@vasya)».
                    const friendLabel =
                      f.username && f.username !== friendName
                        ? `${friendName} (@${f.username})`
                        : friendName;
                    return (
                      <AppLink
                        key={f.id}
                        href={userHref(f)}
                        // Подписчики — с цветной обводкой (п.6, тот же
                        // .premium-ring, что у LetterAvatar premiumRing).
                        //
                        // Подсказка — своя (data-tooltip), а не
                        // браузерный title: по АА5 все подсказки на
                        // сайте одного вида, а title вдобавок ждёт
                        // секунду и не показывается с клавиатуры.
                        // tooltip-wide — длинному «Имя (@ник)» нужен
                        // перенос, иначе он обрезается многоточием.
                        className={`profile-friend tooltip-wide${isPremiumActive(f) ? " premium-ring" : ""}`}
                        data-tooltip={friendLabel}
                        // Ссылка состоит из одной картинки с пустым alt —
                        // без явной подписи скринридер читает её как
                        // «ссылка» без адресата.
                        aria-label={friendLabel}
                      >
                        {f.photoUrl ? (
                          // alt пустой: имя уже в подсказке и aria-label,
                          // а сломанная картинка с alt-текстом вылезала
                          // из круга.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img loading="lazy" decoding="async" src={f.photoUrl} alt="" />
                        ) : (
                          <span aria-hidden>{friendName.charAt(0).toUpperCase()}</span>
                        )}
                      </AppLink>
                    );
                  })}
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
  /** Своя оценка 1-10 (АА2). */
  rating: number | null;
  updatedAt: Date;
  drama: {
    id: string;
    slug: string | null;
    title: string;
    titleRu: string | null;
    posterUrl: string | null;
    episodes: number | null;
    // Колонки таблицы вкладки «Сериалы» — те же, что в каталоге.
    type: string | null;
    country: string | null;
    year: number | null;
  };
};

/** Компактная строка сериала — та же плотность, что у каталога /dramas
 *  (мелкая миниатюра, прогресс одним потоком с названием); используется
 *  вкладкой «Сериалы» и блоком «Смотрю сейчас» в обзоре. Геометрия —
 *  .profile-drama-row в globals.css. */
function DramaRow({
  w,
  t,
  locale,
  editable = false,
}: {
  w: ProfileWatchRow;
  t: Dict;
  locale: Locale;
  /** Свой профиль: серии отмечаются прямо здесь (правка владельца
   *  2026-09-06). У чужого — просто «3/10». */
  editable?: boolean;
}) {
  const p = t.social.profile;
  const progress = episodeProgress(
    { status: w.status, episodesWatched: w.episodesWatched },
    w.drama.episodes,
  );
  return (
    // Строка — контейнер, а не одна большая ссылка: счётчик серий
    // интерактивный, и внутри ссылки каждый его «плюс» уводил бы на
    // страницу сериала. Ссылка осталась на постере с названием.
    <div className="surface surface-hover profile-drama-row">
      <AppLink
        href={dramaHref(w.drama)}
        className="text-decoration-none d-flex align-items-center gap-2 flex-fill"
        style={{ minWidth: 0 }}
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
      </AppLink>
      {/* Справа — прогресс, а не дата (правка владельца): «когда
          отметил» ничего не говорит, «сколько просмотрено» — говорит.
          Себе это рабочий счётчик: «Смотрю сейчас» — ровно то место,
          где отмечают серию, и ради этого не должно приходиться
          открывать сериал. */}
      {editable ? (
        <span className="flex-shrink-0 ms-auto">
          <EpisodeProgress
            dramaId={w.drama.id}
            total={w.drama.episodes}
            watched={w.episodesWatched}
            variant="inline"
          />
        </span>
      ) : (
        progress && (
          <span className="small text-secondary flex-shrink-0 ms-auto">
            {p.activity.episodes(progress.watched, progress.total)}
          </span>
        )
      )}
    </div>
  );
}

/** Вкладка «Сериалы»: под-табы по статусам (Все/Смотрю/Просмотрено/…)
 *  и ТАБЛИЦА с сортируемой шапкой — правка владельца 2026-09-06
 *  («не отдельным фильтром, а как на самой таблице»). Сортировка
 *  клиентская, поэтому сами строки рисует DramasTable; страница только
 *  готовит сериализуемые данные (без Date) и пустое состояние. */
function DramasPanel({
  watchRows,
  t,
  isSelf,
  ownerName,
}: {
  watchRows: ProfileWatchRow[];
  t: Dict;
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

  return (
    <div>
      <DramasTable
        // Свой профиль — счётчик серий рабочий (правка владельца
        // 2026-09-06): отмечать серии прямо отсюда быстрее, чем
        // заходить в каталог или на страницу сериала.
        editable={isSelf}
        rows={watchRows.map((w) => ({
          ...w.drama,
          status: w.status,
          episodesWatched: w.episodesWatched,
          rating: w.rating,
        }))}
      />
      {isSelf && (
        <AppLink href="/dramas" className="small link-body-emphasis">
          {p.dramasTab.all} →
        </AppLink>
      )}
    </div>
  );
}

import { cache } from "react";
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
import { hasPaidPremium, isPremiumActive } from "@/lib/premium";
import { ONLINE_WINDOW_MS } from "@/lib/lastSeen";
import { sendFriendRequest } from "../../friends/actions";
import { logout } from "../../login/actions";
import FriendNotifyToggle from "./FriendNotifyToggle";
import {
  achievementsSyncDue,
  getUnlockedAchievements,
  syncAchievements,
} from "@/lib/achievements";
import { computeUserStats } from "@/lib/userStats";
import { SEEN_PERFORMER_SELECT } from "@/lib/seenLive";
import { getActivityFeed } from "@/lib/activityFeed";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import AchievementBadge, { AchievementCoin } from "@/components/AchievementBadge";
import StatsUpsell from "./StatsUpsell";
import CreateArtistListButton from "@/app/(public)/artist-lists/CreateArtistListButton";
import { listHref, tripHref, locationHref, artistListHref, dramaHref, novelHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { pageMetadata } from "@/lib/seo";
import { getT, type Dict, type Locale } from "@/lib/i18n";
import ActivityList from "./ActivityList";
import ProfileTabs, { type ProfileTabKey } from "./ProfileTabs";
import StatsHero from "./StatsHero";
import StatsTab, { type StatsForTab } from "./StatsTab";
import ReviewsTab, { type MyReviewRow } from "./ReviewsTab";
import CommentsTab, { type MyCommentRow } from "./CommentsTab";
import TicketsTab from "./TicketsTab";
import EpisodeProgress from "@/components/EpisodeProgress";
import PosterTile from "@/components/PosterTile";
import ProfileOverview from "./ProfileOverview";
import DramasTable from "./DramasTable";
import CommunitiesTab from "./CommunitiesTab";
import SubTabs from "@/components/SubTabs";

export const dynamic = "force-dynamic";

/**
 * Владелец профиля по адресу — общий для `generateMetadata` и самой
 * страницы: обе зовутся на один HTTP-запрос, и без React.cache строка
 * читалась дважды.
 *
 * Свой профиль не стоит вообще ни одного запроса: та же строка уже
 * приехала вместе с сессией (см. lib/userAuth.ts), а по адресу
 * /users/<свой ник|свой id> открывается именно она.
 */
const loadProfileUser = cache(async (id: string) => {
  // Ник от id отличаем по формату: id — это cuid (начинается с "c" и
  // длинный), ник короче и может быть любым допустимым словом.
  const looksLikeId = /^c[a-z0-9]{20,}$/.test(id);
  const viewer = await getCurrentUser();
  if (viewer && (looksLikeId ? viewer.id === id : viewer.username === id)) return viewer;
  return prisma.user.findUnique({
    // Ник в адресе (/users/username) — им делятся с друзьями; id
    // остаётся рабочим для старых ссылок и аккаунтов без ника.
    where: looksLikeId ? { id } : { username: id },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, t } = await getT();
  const user = await loadProfileUser(id);
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
/** «через 3 дня» / «завтра» / «уже идёт» — отсчёт до события в
 *  «Обзоре» (переделка 2026-09-17): сухая дата сама по себе не отвечает
 *  на вопрос «а скоро ли». Тот же помощник, что у поездок на главной. */
function countdown(start: Date, t: Dict): string {
  const days = Math.ceil((start.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return t.home.countdownToday;
  if (days === 1) return t.home.countdownTomorrow;
  if (days < 31) return t.home.countdownDays(days);
  const months = Math.round(days / 30);
  return months <= 1 ? t.home.countdownMonth : t.home.countdownMonths(months);
}

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

  const user = await loadProfileUser(id);
  // Удалённый аккаунт публично не существует.
  if (!user || user.deletedAt) notFound();

  // Свой профиль по любому адресу (id или ник) открывается как обычная
  // страница — редиректа в кабинет больше нет (жалоба владельца: «свой
  // профиль глазами других вообще не открыть»).
  const isSelf = viewer?.id === user.id;
  const ownerPremium = isPremiumActive(user);
  const viewerPremium = viewer ? isPremiumActive(viewer) : false;
  // Бейджи подписчика (звезда у имени, обводка фото, обводка аватарок
  // друзей) спрашивают ОПЛАЧЕНО, а не ДОСТУПНО: в промо-период
  // isPremiumActive верен для всех, и знак отличия загорелся бы у
  // каждого, перестав что-либо значить. См. lib/premium.ts.
  const ownerPaid = hasPaidPremium(user);

  // Друзья владельца — и счётчик, и сетка аватарок в левой колонке
  // (жалоба владельца: «друзей на профиле не видно»).
  //
  // Запрос уходит СРАЗУ, а ждём мы его только там, где без него нельзя:
  // права зрителя зависят от дружбы, и раньше вся страница стояла в
  // очереди за этим списком. Себе и гостю ждать нечего — «друг сам себе»
  // и «друг без учётки» не бывают, — так что у них выборки ниже уходят в
  // ту же волну, что и этот запрос.
  const friendshipsPromise = prisma.friendship.findMany({
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
  const isFriend =
    !viewer || isSelf
      ? false
      : (await friendshipsPromise).some(
          (f) => f.requesterId === viewer.id || f.addresseeId === viewer.id,
        );

  // Приватный профиль (Г8): друзья и сам владелец видят всё; остальным —
  // мастер-выключатель + точечные блоки.
  const showActivity = isSelf || isFriend || !user.hideProfileActivity;
  const showAchievements = showActivity && (isSelf || isFriend || !user.hideAchievements);
  const showFavorites = showActivity && (isSelf || isFriend || !user.hideFavoritePerformers);
  const showVisited = showActivity && (isSelf || isFriend || !user.hideVisitedPlaces);

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

  const performerInEvent = {
    // Ровно тот состав, что нужен правилу «видела вживую»
    // (SEEN_PERFORMER_SELECT в lib/seenLive.ts: фото для карточек плюс
    // участники группы с признаком «актёр») — свод считается из ЭТИХ же
    // строк, второй выборки отметок нет. Цена — лишние поля в пропсах
    // строк событий (их на профиле около десятка), и это заведомо
    // дешевле второго запроса всех отметок с составами.
    select: { performer: { select: SEEN_PERFORMER_SELECT } },
  };
  const eventWithOccurrences = {
    include: {
      performers: performerInEvent,
      occurrences: { orderBy: { startsAt: "asc" as const } },
    },
  };

  // Свод статистики нужен себе всегда, зрителю — только у владельца с
  // подпиской и открытой активностью (та же логика «чужая статистика
  // видна у премиума», что была у чипов старого профиля).
  const statsVisibleToViewer = !isSelf && ownerPremium && showActivity;
  const needStats = isSelf || statsVisibleToViewer;
  // Пересчёт ачивок — не чаще раза в 10 минут на человека (см.
  // lib/achievements.ts): между окнами показываем уже выданные медали.
  const syncDue = isSelf && achievementsSyncDue(user.id);

  // ОДНА волна на всё, что страница читает своими руками: раньше эти же
  // выборки шли шестью ступенями (общая, лента, свод, ачивки, избранные
  // события, билеты, счётчики, сообщества), и каждая ждала предыдущую
  // без всякой на то причины. Всё, что зависит от прав, уже посчитано
  // выше — сами права в where, как и было.
  const [
    friendships,
    attendances,
    maybeRows,
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
    communityMemberships,
    unlockedRows,
    referrals,
    muteRow,
    pendingRow,
    favoriteEventRows,
    ticketRows,
  ] = await Promise.all([
    friendshipsPromise,
    // «Иду»: себе — полный список для вкладки «События», зрителю — только
    // для блока будущих событий и счётчика. Эти же строки уходят в свод
    // статистики и в ленту обновлений — отдельных выборок отметок на
    // странице больше нет.
    prisma.eventAttendance.findMany({
      // Только афишные события: профиль открыт другим людям, и отметка
      // «иду» на домашнюю встречу раздала бы её название и адрес тем,
      // кого в сообщество не звали (см. src/lib/catalogEvents.ts).
      where: { userId: user.id, event: catalogEventsWhere() },
      include: {
        event: eventWithOccurrences,
        occurrence: {
          include: {
            // Оба вложения — для свода: «шли компанией 4+» считается по
            // числу отметившихся, а состав дня — по кому засчитывать
            // «видела вживую». Тянем их всегда, не только когда свод
            // будет: отметок у человека единицы, и одна выборка на два
            // случая честнее, чем две формы одного запроса.
            attendances: { select: { userId: true } },
            lineup: performerInEvent,
          },
        },
      },
    }),
    // Кандидаты «возможно пойду» — только себе: на своей странице
    // кнопка на строке должна показывать настоящее состояние, а чужие
    // черновики планов не видны никому (см. модель EventMaybe).
    isSelf
      ? prisma.eventMaybe.findMany({
          where: { userId: user.id },
          select: { occurrenceId: true },
        })
      : [],
    // Число любимых артистов показывает только свой «Обзор».
    isSelf ? prisma.favoritePerformer.count({ where: { userId: user.id } }) : 0,
    showActivity
      ? prisma.dramaWatchStatus.findMany({
          where: { userId: user.id },
          // select, а не include: строк тут до потолка ниже, и лишние
          // колонки отметки (заметки, флаг колокольчика, даты) в них
          // никому не нужны.
          select: {
            status: true,
            episodesWatched: true,
            rating: true,
            // Для свода статистики: пересмотры, часы у экрана, жанры и
            // «строже/щедрее MDL» считаются из этих же строк.
            rewatchCount: true,
            // Лента обновлений сортируется по нему.
            updatedAt: true,
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
                // Только для свода — в таблицу вкладки эти поля не
                // уезжают (см. DramasPanel: строки собираются поимённо).
                duration: true,
                genres: true,
                mdlScore: true,
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
    showActivity ? prisma.dramaWatchStatus.count({ where: { userId: user.id } }) : 0,
    prisma.trip.findMany({
      where: { userId: user.id, visibility: { in: tripVisibilities } },
      orderBy: { startDate: "desc" },
      // Потолок — защита от абсурдного списка (как у сериалов выше):
      // счётчик вкладки считается по длине этого массива, и низкий
      // потолок соврал бы.
      take: 200,
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
    // Эти же строки уходят в ленту обновлений — второй выборки отзывов
    // на странице нет.
    showActivity
      ? prisma.review.findMany({
          where: { userId: user.id, ...(isSelf ? {} : { isPrivate: false }) },
          orderBy: { createdAt: "desc" },
          // Потолок — по той же причине, что у поездок: счётчик вкладки
          // считается по длине массива, поэтому он высокий и в жизни не
          // срабатывает (у отзывов и текст, и он весь уезжает в разметку).
          take: 200,
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
    // Отзывам такой запрос не нужен — их потолок в двести штук в жизни
    // не срабатывает, и счётчик берётся из длины массива.
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
    showActivity
      ? prisma.communityMember.findMany({
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
                // Для свода (ачивки «вступил» против «завёл») — в
                // разметку не уезжает, см. myCommunities ниже.
                ownerId: true,
                _count: { select: { members: { where: { status: "ACTIVE" } } } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
    // Выданные медали: одной выборкой на всех — бейджи левой колонки,
    // лента обновлений и пересчёт (раньше каждый читал таблицу сам).
    showAchievements
      ? prisma.userAchievement.findMany({ where: { userId: user.id } })
      : [],
    // Приглашённые по реферальной ссылке — метрика только для пересчёта,
    // поэтому и спрашиваем только когда он будет.
    syncDue ? prisma.user.count({ where: { referredById: user.id, deletedAt: null } }) : 0,
    // Молчалка уведомлений о друге и висящая заявка: спрашиваем у любого
    // залогиненного не-себя, а показываем по правам ниже — так они не
    // ждут списка друзей отдельной ступенью. Гостю искать нечего: у него
    // нет своей учётки, а без проверки запрос уходил с пустым
    // идентификатором и ронял страницу.
    viewer && !isSelf
      ? prisma.friendNotificationMute.findUnique({
          where: { userId_mutedFriendId: { userId: viewer.id, mutedFriendId: user.id } },
        })
      : null,
    viewer && !isSelf
      ? prisma.friendship.findFirst({
          where: {
            status: "PENDING",
            OR: [
              { requesterId: viewer.id, addresseeId: user.id },
              { requesterId: user.id, addresseeId: viewer.id },
            ],
          },
        })
      : null,
    // Дальше — только своё: избранные события и билеты. Билеты — ТОЛЬКО
    // себе: файл не должен попасть в чужую разметку.
    isSelf
      ? prisma.favoriteEvent.findMany({
          // Та же причина, что у «иду» выше: вкладка событий — про афишу.
          where: { userId: user.id, event: catalogEventsWhere() },
          include: { event: eventWithOccurrences },
        })
      : [],
    isSelf
      ? prisma.eventTicket.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            fileUrl: true,
            event: { select: { id: true, slug: true, title: true, venue: true } },
            occurrence: { select: { startsAt: true } },
          },
        })
      : [],
  ]);

  const friends = friendships.map((f) => (f.requesterId === user.id ? f.addressee : f.requester));
  // Не-друзьям в шапке нужна кнопка «В друзья» — а если заявка уже висит
  // (в любую сторону), показываем её состояние вместо кнопки.
  const pendingFriendship = isFriend ? null : pendingRow;

  const now = new Date();

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
  //
  // Строки лента больше не читает сама: те же таблицы уже выбраны выше
  // (статусы, «иду», поездки, отзывы, медали) — и передаются ей как
  // есть. Гейты при этом остаются на странице: «иду» без подписки
  // зрителя не показывается, значит и в ленту не отдаётся.
  const goingVisible = isSelf || viewerPremium;

  // ---------- Статистика и ачивки ----------
  // Свод себе — всегда (заодно пересчёт фиксирует новые ачивки, как
  // раньше делал кабинет); зрителю — по правам, см. statsVisibleToViewer.
  // Свод, лента и пересчёт независимы друг от друга — одна волна, а не
  // три ступени; свод пересчёт получает ОБЕЩАНИЕМ и потому идёт с ним
  // рядом, а не после.
  const statsPromise = needStats
    ? // Отметки и статусы уже выбраны страницей — второго похода за ними
      // не будет. watchRows при needStats всегда выбраны: и себе, и
      // зрителю статистика положена только при открытой активности.
      computeUserStats(user.id, {
        attendances,
        watchRows,
        friends: friendships.length,
        // Список сообществ у зрителя урезан по видимости — своду нужны
        // ВСЕ членства, поэтому отдаём только свой.
        memberships: isSelf ? communityMemberships : undefined,
      })
    : null;

  const [fullStats, achievementStates, activityItems, holderRows] = await Promise.all([
    statsPromise,
    isSelf && statsPromise && syncDue
      ? syncAchievements(user.id, statsPromise, { referrals, unlockedRows })
      : null,
    showActivity
      ? getActivityFeed(
          user.id,
          {
            privateReviews: isSelf,
            going: goingVisible,
            favoritePerformers: showFavorites,
            achievements: showAchievements,
            tripVisibilities,
          },
          6,
          {
            watches: watchRows,
            going: goingVisible ? attendances : [],
            trips,
            reviews: reviewRows,
            achievements: showAchievements ? unlockedRows : [],
          },
        )
      : [],
    // Сколько людей получили каждую медаль — «есть у N фанатов» в
    // тултипе и у последнего достижения (переделка блока 2026-09-17).
    // Один groupBy на все ключи; ключи выключенных ачивок просто не
    // спрашиваются при показе.
    showAchievements
      ? prisma.userAchievement.groupBy({ by: ["key"], _count: { _all: true } })
      : [],
  ]);

  const unlockedBadges = isSelf
    ? ownerPremium
      ? // Между пересчётами (см. syncDue) показываем уже выданные медали
        // из тех же строк: свежая медаль опоздает максимум на окно.
        (achievementStates?.filter((a) => a.unlocked) ??
          (await getUnlockedAchievements(user.id, unlockedRows)))
      : []
    : showAchievements
      ? await getUnlockedAchievements(user.id, unlockedRows)
      : [];
  const holdersByKey = new Map(holderRows.map((r) => [r.key, r._count._all]));
  // Последнее полученное — крупной карточкой над рядом монет (переделка
  // блока 2026-09-17: «мб что интереснее придумаем»). Остальные — монетами,
  // как раньше; последнее из ряда убрано, чтобы не стояло дважды.
  // У состояния пересчёта дата может быть null (медаль ещё не
  // зафиксирована) — такие в «последнее» не идут.
  const datedBadges = unlockedBadges.filter(
    (b): b is typeof b & { unlockedAt: Date } => b.unlockedAt != null,
  );
  const latestBadge =
    datedBadges.length > 0
      ? datedBadges.reduce((a, b) => (b.unlockedAt > a.unlockedAt ? b : a))
      : null;
  const restBadges = latestBadge ? unlockedBadges.filter((b) => b.key !== latestBadge.key) : [];

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
        visitedPlaces: showVisited ? fullStats.visitedPlaces : [],
        completedDramas: fullStats.completedDramas,
        watchByStatus: fullStats.watchByStatus,
        episodesWatched: fullStats.episodesWatched,
        hoursWatched: fullStats.hoursWatched,
        rewatchTotal: fullStats.rewatchTotal,
        mostRewatched: fullStats.mostRewatched,
        topGenres: fullStats.topGenres,
        trips: fullStats.trips,
        // Список поездок — только себе: у поездок своя видимость.
        tripsList: isSelf ? fullStats.tripsList : [],
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

    // Сердечко и «иду» на строках — из уже выбранных отметок: это СВОИ
    // события, и оба ответа целиком лежат в favoriteEventRows и
    // attendances (обе выборки — по афишным событиям, как и строки
    // здесь). Двух запросов «а что из этого списка отмечено» больше нет.
    const favoritedSet = new Set(favoriteEventRows.map((f) => f.eventId));
    const goingSet = new Set(attendances.map((a) => a.occurrenceId));
    const maybeSet = new Set(maybeRows.map((m) => m.occurrenceId));

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
                isMaybe={maybeSet.has(ev.occurrenceId)}
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
                isMaybe={maybeSet.has(ev.occurrenceId)}
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
                isMaybe={maybeSet.has(row.occurrenceId)}
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

    // Билеты (выбраны в общей волне — они только свои).
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
  // Счётчик избранных событий считает ровно то, что выбрано выше (тот же
  // where), — отдельного count ему не нужно.

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
          <p className="font-display fw-medium text-white mb-0 text-truncate">
            {event.title}
            {/* Отсчёт до первой даты — чипом после названия. */}
            {first && (
              <span className="date-chip ms-2 align-middle">{countdown(first.startsAt, t)}</span>
            )}
          </p>
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
    // Переделка «Обзора» 2026-09-17 (правка владельца). Ряд чипов-ссылок
    // (иду, в избранном, любимые артисты…) остаётся сверху — владелец
    // попросила его вернуть после того, как он был убран: это быстрые
    // ходы в разделы, а не счётчики. «Сейчас в просмотре» — постерами с
    // полосой прогресса на всю ширину, как на главной, а не компактными
    // строками: обложка узнаётся быстрее названия. Ниже две колонки:
    // слева ближайшие «иду» с отсчётом «через N дней» и свежие отзывы,
    // справа лента обновлений — шесть записей, не десять («слишком
    // гигантский»), а без левой колонки ещё и не шире 40rem.
    const watchingNow = watchRows.filter((w) => w.status === "WATCHING").slice(0, 6);
    // «Иду» — платная лента для зрителя, тот же гейт, что у вкладки
    // «События».
    const overviewGoing = isSelf || viewerPremium ? upcomingGoing.slice(0, 3) : [];
    const overviewReviews = reviews.slice(0, 3);
    const hasOverviewLeft = overviewGoing.length > 0 || overviewReviews.length > 0;
    const goingEventIds = new Set(attendances.map((a) => a.eventId));
    const favoriteEventsCount = favoriteEventRows.length;

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
          {watchingNow.length > 0 && (
            <section className="mb-4">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <h2 className="section-heading mb-0">{p.overviewWatching}</h2>
                {isSelf && (
                  <AppLink href="/account?tab=dramas" className="small text-secondary">
                    {t.common.all}
                  </AppLink>
                )}
              </div>
              <div className="row g-3 stagger">
                {watchingNow.map((w) => (
                  <div key={w.drama.id} className="col-4 col-sm-3 col-md-2 poster-tile-cell">
                    <PosterTile
                      href={dramaHref(w.drama)}
                      posterUrl={w.drama.posterUrl}
                      title={dramaTitleForLocale(w.drama, locale)}
                      progress={
                        w.drama.episodes && w.episodesWatched != null
                          ? {
                              watched: w.episodesWatched,
                              total: w.drama.episodes,
                              label: t.catalog.episodes.of(w.episodesWatched, w.drama.episodes),
                            }
                          : null
                      }
                    />
                    {/* Счётчик серий поверх постера — только себе: чужой
                        прогресс не правят. Позиционирует .poster-tile-cell. */}
                    {isSelf && (
                      <EpisodeProgress
                        dramaId={w.drama.id}
                        total={w.drama.episodes}
                        watched={w.episodesWatched ?? 0}
                        variant="card"
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {/* Пустой левой колонке двухколонник не нужен: лента с её
              EmptyState занимает всю ширину. */}
          <div className={hasOverviewLeft ? "profile-overview-grid" : undefined}>
            {hasOverviewLeft && (
              <div className="profile-overview-main">
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
              </div>
            )}
            <aside className={`profile-overview-feed${hasOverviewLeft ? "" : " profile-overview-feed-alone"}`}>
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
              {/* Плитки счётчиков — одни и те же у владельца и зрителя
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
        {/* Обложка — косметика подписчика (аудит 2026-09, раздел 8), но
            ВИДЯТ её все, включая гостей: пропадать в день окончания
            подписки профиль не должен, иначе он выглядит сломанным.
            Ставит её только подписчик — это проверяет updateProfile.
            Без обложки блока нет вовсе, и колонка выглядит как
            раньше. */}
        {user.coverUrl && (
          <div className="profile-side-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.coverUrl} alt="" loading="eager" decoding="async" />
          </div>
        )}
        {/* Цветная обводка фото у подписчика (правка владельца п.6);
            тот же визуал у мини-аватарок — .premium-ring. */}
        <div className={`profile-side-photo${ownerPaid ? " profile-side-photo-premium" : ""}`}>
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
          {ownerPaid ? (
            <span
              className="premium-badge-icon"
              title={user.premiumLifetime ? t.account.planLifetimeHint : t.account.planPremiumHint}
              aria-label={user.premiumLifetime ? t.account.planLifetimeHint : t.account.planPremiumHint}
              role="img"
              tabIndex={0}
            >
              <StarIcon />
            </span>
          ) : null}
          {/* Бейджа «Базовый» у профиля нет (правка владельца 2026-09-17):
              отсутствие подписки — не статус, который стоит подписывать
              рядом с именем. */}
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
            {/* Переделка 2026-09-17: последнее достижение — компактной
                карточкой с названием, датой и «есть у N человек»;
                остальные — монетами с тултипом, как раньше. «Ближайшее»
                с прогрессом было и снято тем же днём (правка владельца:
                не показываем) — какие достижения существуют, остаётся
                сюрпризом целиком. */}
            {latestBadge && (
              <div className="achv-featured mb-2">
                <span className="achv-featured-coin">
                  <AchievementCoin emoji={latestBadge.emoji} />
                </span>
                <div className="achv-featured-body">
                  <span className="achv-featured-eyebrow">{p.achievementsLatest}</span>
                  <span className="achv-featured-title">{latestBadge.title}</span>
                  <span className="achv-featured-meta">
                    {formatShortDate(latestBadge.unlockedAt, locale)}{" "}
                    {latestBadge.unlockedAt.getFullYear()}
                    {(holdersByKey.get(latestBadge.key) ?? 0) > 0 &&
                      ` · ${p.achievementsHolders(holdersByKey.get(latestBadge.key)!)}`}
                  </span>
                </div>
              </div>
            )}
            {restBadges.length > 0 && (
              <div className="d-flex flex-wrap gap-2">
                {restBadges.map((b) => (
                  <AchievementBadge
                    key={b.key}
                    emoji={b.emoji}
                    title={b.title}
                    hint={b.hint}
                    unlockedAt={b.unlockedAt}
                    holders={holdersByKey.get(b.key)}
                    iconOnly
                    locale={locale}
                  />
                ))}
              </div>
            )}
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
                        className={`profile-friend tooltip-wide${hasPaidPremium(f) ? " premium-ring" : ""}`}
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
                  {/* Сверх двенадцати — одна плитка «+N» (правка
                      владельца 2026-09-17: «если их будет 100+, список
                      будет гигантский»). Себе — ссылкой на /friends;
                      чужого списка друзей как страницы нет, поэтому
                      зрителю просто число. */}
                  {friends.length > 12 &&
                    (isSelf ? (
                      <AppLink
                        href="/friends"
                        className="profile-friend profile-friend-more"
                        aria-label={p.friendsAll}
                      >
                        +{friends.length - 12}
                      </AppLink>
                    ) : (
                      <span className="profile-friend profile-friend-more">
                        +{friends.length - 12}
                      </span>
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
        // Поля перечислены поимённо, а не `...w.drama`: строки уезжают в
        // КЛИЕНТСКИЙ компонент, и вместе с ними уехало бы всё, что в
        // выборке есть для свода статистики (жанры, длительность, оценка
        // MDL). Здесь ровно то, что таблица рисует и по чему сортирует.
        rows={watchRows.map((w) => ({
          id: w.drama.id,
          slug: w.drama.slug,
          title: w.drama.title,
          titleRu: w.drama.titleRu,
          posterUrl: w.drama.posterUrl,
          episodes: w.drama.episodes,
          type: w.drama.type,
          country: w.drama.country,
          year: w.drama.year,
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

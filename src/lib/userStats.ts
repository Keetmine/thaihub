import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { dateKey } from "@/lib/dates";
import { DRAMA_TITLE_SELECT } from "@/lib/dramaLocale";
import { tripDayStats } from "@/lib/tripDays";
import {
  resolveSeen,
  toSeenRows,
  SEEN_PERFORMER_SELECT,
  type SeenCard,
  type SeenPerformerRaw,
} from "@/lib/seenLive";

// Общий подсчёт статистики пользователя — питает и вкладку «Статистика»
// (Д1), и условия ачивок (Д2). Всё считается из уже собираемых данных:
// посещения, локации, watch-статусы, поездки, друзья.

import { WATCH_STATUS_KEYS, type WatchStatusKey } from "@/lib/watchStatuses";
import { keepPairingsTogether } from "@/lib/castLineup";
import { tripDays } from "@/lib/tripDays";

export type UserStats = {
  attendedEvents: number;
  upcomingEvents: number;
  uniqueVenues: number;
  performersSeenLive: number;
  /** Что именно стоит за счётчиками «вживую» — списки под кликабельными
   *  плитками профиля: голое число вызывало вопрос «а какие?». Дата —
   *  ISO-строкой: список уезжает в клиентский компонент как есть. */
  attendedEventsList: {
    id: string;
    slug: string | null;
    title: string;
    date: string;
    posterUrl: string | null;
    venue: string;
  }[];
  seenPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  completedDramas: number;
  anyStatusDramas: number;
  /** Сколько сериалов в каждом статусе — полоса «библиотеки» на вкладке
   *  статистики (переделка 2026-09-17). Ключи — все пять статусов,
   *  даже с нулём: полоса и легенда рисуются одним проходом по
   *  фиксированному порядку, а не по тому, что нашлось. */
  watchByStatus: Record<WatchStatusKey, number>;
  /** Серии и часы у экрана: по episodesWatched (у «просмотрено» без
   *  прогресса — по числу серий сериала) плюс пересмотры и длительности
   *  серии с MDL. */
  episodesWatched: number;
  hoursWatched: number;
  /** Сколько раз всего сериалы пересматривали — сумма rewatchCount, то
   *  есть просмотры СВЕРХ первого. В «досмотрено сериалов» они не идут
   *  намеренно: там счёт разным тайтлам, и один любимый сериал не должен
   *  раздувать цифру. */
  rewatchTotal: number;
  /** Что пересматривали чаще прочего (название на обоих языках — плитка
   *  профиля клиентская и выбирает язык сама). null — пересмотров нет,
   *  тогда блока в профиле просто не будет. */
  mostRewatched: { title: string; titleRu: string | null; count: number } | null;
  /** Вкусовой профиль (аудит 2026-09, п.6.2): топ-5 жанров по
   *  ДОСМОТРЕННОМУ. Жанры — сырые строки с MDL (`Drama.genres`), как и
   *  везде на сайте они не переводятся. Пусто — блока в профиле нет. */
  topGenres: { genre: string; count: number }[];
  /** Посещённые места списком рядом с картой (правка владельца
   *  2026-09-17): фото, название и из какого сериала. Порядок — по
   *  свежести отметки «была здесь». Сериалов у места бывает несколько,
   *  показываем до двух. */
  visitedPlaces: {
    id: string;
    slug: string | null;
    name: string;
    photoUrl: string | null;
    dramas: { id: string; slug: string | null; title: string; titleRu: string | null }[];
  }[];
  trips: number;
  /** Поездки списком под счётчиком (правка владельца 2026-09-17):
   *  название, даты, длина в днях по СВОЕМУ окну присутствия. Свежие
   *  сверху. Страница отдаёт список только владельцу профиля — у
   *  поездок своя видимость, и в чужую статистику они не утекают. */
  tripsList: { id: string; slug: string | null; title: string; start: string; end: string; days: number }[];
  longestTripDays: number;
  daysInThailand: number;
  friends: number;
  eventsByYear: { year: number; count: number; months: number[] }[];
  /**
   * Сообщества (АА25) — считаются ТОЛЬКО ради ачивок: во вкладке
   * «Статистика» этих чисел нет. Сообщества бесплатны и не про афишу, а
   * ачивка про них — самая дешёвая причина вернуться и что-то написать
   * (сообщества умирают от тишины, а не от нехватки функций).
   */
  /** В скольких ЧУЖИХ сообществах человек состоит (ACTIVE). Свои не в
   *  счёт: «вступить» — это про то, что тебя куда-то позвали или ты сам
   *  пришёл, а за созданное есть отдельная ачивка. */
  communitiesJoined: number;
  /** Сколько сообществ создал. */
  communitiesOwned: number;
  /** Сколько тем завёл в обсуждениях (во всех сообществах). */
  communityPosts: number;
  /** Самое многолюдное СВОЁ сообщество: сколько в нём участников, КРОМЕ
   *  самого владельца (иначе ачивка «собери троих» выдавалась бы за
   *  двоих плюс себя). */
  communityMembersGathered: number;
  /** На скольких прошедших встречах сообществ человек отметился «иду».
   *  Считаются только ЧУЖИЕ встречи — свою можно завести задним числом и
   *  отметиться на ней самому (то же правило, по которому встречи вообще
   *  не идут в статистику афиши, см. docs/features/communities.md). */
  communityMeetups: number;
  // Флаги для ачивок
  wentWithThreeFriends: boolean;
  earlyBird: boolean;
  doubleDay: boolean;
  marathonWeek: boolean;
};

/** Артист в составе события/дня — одинаково в своде и в выборках,
 *  которые его кормят. Это СЫРАЯ строка Prisma (SEEN_PERFORMER_SELECT):
 *  страницы отдают её как есть, в форму правила «видела вживую»
 *  (lib/seenLive.ts) свод переводит сам. */
type StatsPerformer = SeenPerformerRaw;

/**
 * Строки, которые свод читает сам, — но страница профиля их УЖЕ выбрала
 * (те же таблицы, те же условия). Передавайте их сюда, и второго похода
 * в базу не будет: до этого одни и те же отметки «иду» и статусы
 * просмотра читались на профиле трижды (страница, свод, лента).
 *
 * Типы описаны структурно, а не выведены из Prisma: у страницы свой
 * (более широкий) select, и лишние поля в нём мешать не должны —
 * важно лишь, чтобы нужные своду были на месте.
 */
export type StatsAttendanceRow = {
  eventId: string;
  createdAt: Date;
  occurrence: {
    startsAt: Date;
    attendances: { userId: string }[];
    lineup: { performer: StatsPerformer }[];
  };
  event: {
    id: string;
    slug: string | null;
    title: string;
    venue: string;
    posterUrl: string | null;
    presaleAt: Date | null;
    performers: { performer: StatsPerformer }[];
  };
};

export type StatsWatchRow = {
  status: string;
  episodesWatched: number | null;
  rating: number | null;
  rewatchCount: number;
  drama: {
    title: string;
    titleRu: string | null;
    episodes: number | null;
    duration: string | null;
    genres: string[];
    mdlScore: number | null;
  };
};

export type StatsMembershipRow = { community: { ownerId: string } };

export type UserStatsPreloaded = {
  /** Отметки «иду» по афишным событиям — where обязан совпадать с
   *  выборкой ниже (`catalogEventsWhere`), иначе свод посчитает не то. */
  attendances?: StatsAttendanceRow[];
  /** Все статусы просмотра человека. Из них же берётся и «досмотрено»:
   *  отдельного count не будет, так что потолок `take` у выборки-донора
   *  становится потолком и для свода. */
  watchRows?: StatsWatchRow[];
  /** Принятые дружбы (число). */
  friends?: number;
  /** Активные членства в сообществах — ВСЕ, включая закрытые: свод
   *  считает по ним ачивки, и отфильтрованный по видимости список
   *  (как у чужого профиля) сюда передавать нельзя. */
  memberships?: StatsMembershipRow[];
};

export async function computeUserStats(
  userId: string,
  preloaded?: UserStatsPreloaded,
): Promise<UserStats> {
  const now = new Date();

  const attendancesPromise: Promise<StatsAttendanceRow[]> = preloaded?.attendances
    ? Promise.resolve(preloaded.attendances)
    : prisma.eventAttendance.findMany({
        // Статистика — про афишу, встречи сообществ не считаются.
        where: { userId, event: catalogEventsWhere() },
        select: {
          eventId: true,
          createdAt: true,
          occurrence: {
            select: {
              startsAt: true,
              attendances: { select: { userId: true } },
              // Состав именно этого дня — по нему считаются увиденные
              // артисты, если он у дня есть (см. lib/seenLive.ts).
              lineup: { select: { performer: { select: SEEN_PERFORMER_SELECT } } },
            },
          },
          event: {
            select: {
              id: true,
              slug: true,
              title: true,
              venue: true,
              posterUrl: true,
              presaleAt: true,
              performers: { select: { performer: { select: SEEN_PERFORMER_SELECT } } },
            },
          },
        },
      });

  // Все статусы целиком, а не count: из них же считаются серии и
  // часы у экрана, пересмотры и вкусовой профиль.
  const watchPromise: Promise<StatsWatchRow[]> = preloaded?.watchRows
    ? Promise.resolve(preloaded.watchRows)
    : prisma.dramaWatchStatus.findMany({
        where: { userId },
        select: {
          status: true,
          episodesWatched: true,
          rewatchCount: true,
          // rating, genres и mdlScore — для вкусового профиля (п.6.2):
          // считается из этих же строк, отдельных запросов не нужно.
          rating: true,
          drama: {
            select: {
              ...DRAMA_TITLE_SELECT,
              episodes: true,
              duration: true,
              genres: true,
              mdlScore: true,
            },
          },
        },
      });

  const [
    attendances,
    visits,
    completedCount,
    watchRows,
    trips,
    friendships,
    memberships,
    ownedCommunities,
    communityPosts,
    ownCommunityCrowd,
    meetupAttendances,
    // Отметки «видели вне афиши», решения по событиям и артисты личных
    // событий поездок зависят только от userId и текущего момента —
    // идут в той же волне.
    outsideSeen,
    seenOverrides,
    personalEventSeen,
  ] = await Promise.all([
      attendancesPromise,
      prisma.locationVisit.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          location: {
            select: {
              id: true,
              slug: true,
              name: true,
              photoUrl: true,
              latitude: true,
              longitude: true,
              // Из какого сериала место — подпись в списке рядом с
              // картой. До двух: у кафе из пяти сериалов подпись иначе
              // растянется в абзац.
              dramas: {
                take: 2,
                orderBy: { createdAt: "asc" },
                select: { drama: { select: { id: true, slug: true, title: true, titleRu: true } } },
              },
            },
          },
        },
      }),
      // «Досмотрено» — отдельный count только тогда, когда статусы
      // приходится читать самим: из готовых строк это фильтр в памяти.
      preloaded?.watchRows
        ? null
        : prisma.dramaWatchStatus.count({ where: { userId, status: "COMPLETED" } }),
      watchPromise,
      // Поездки — свои И совместные, где инвайт принят: тот же критерий,
      // что у списка /trips и главной (жалоба владельца: подругу добавили
      // в поездку, а «дней в Таиланде» у неё 0). PENDING не считается —
      // приглашение ещё не значит, что человек поехал.
      prisma.trip.findMany({
        where: {
          OR: [{ userId }, { members: { some: { userId, status: "ACCEPTED" } } }],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          startDate: true,
          endDate: true,
          // Своё окно присутствия, если человек летел не на все дни
          // (АА17): по нему и считаем, иначе подруга, прилетевшая на
          // четыре дня позже, получала бы чужие дни в Таиланде.
          stays: { where: { userId }, select: { startDate: true, endDate: true } },
        },
      }),
      preloaded?.friends ??
        prisma.friendship.count({
          where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
        }),
      // Дальше — только для ачивок про сообщества (АА25).
      // Членства: владелец своего сообщества тоже лежит строкой
      // CommunityMember, поэтому «вступил» и «завёл» различаем по
      // владельцу сообщества, а не по роли (роль владельца можно и
      // потерять при кривой строке в базе, ownerId — нет).
      preloaded?.memberships ??
        prisma.communityMember.findMany({
          where: { userId, status: "ACTIVE" },
          select: { community: { select: { ownerId: true } } },
        }),
      prisma.community.count({ where: { ownerId: userId } }),
      prisma.communityPost.count({ where: { authorId: userId } }),
      // Сколько людей собралось в каждом СВОЁМ сообществе. Себя не
      // считаем прямо в запросе (`userId: { not: userId }`): ачивка
      // обещает участников, а не строку владельца.
      prisma.communityMember.groupBy({
        by: ["communityId"],
        where: {
          status: "ACTIVE",
          userId: { not: userId },
          community: { ownerId: userId },
        },
        _count: { userId: true },
      }),
      // Отметки «иду» на прошедших встречах сообществ. Автора встречи
      // тянем полем, а не условием `not`: у каталожных событий
      // createdById = null, и фильтр по «не равно» на nullable-поле
      // читается неоднозначно — тут лучше явное сравнение в коде.
      prisma.eventAttendance.findMany({
        where: {
          userId,
          event: { communityId: { not: null } },
          occurrence: { startsAt: { lt: now } },
        },
        select: {
          eventId: true,
          event: { select: { createdById: true } },
          // Дата — для календаря событий: встречи сообществ в нём
          // считаются наравне с афишей (правка владельца 2026-09-17).
          occurrence: { select: { startsAt: true } },
        },
      }),
      // «Видели вне афиши» (PerformerSeen): концерты до регистрации на
      // сайте, случайные встречи — событие, которого у нас нет. Считается
      // ещё одним событием артиста.
      prisma.performerSeen.findMany({
        where: { userId },
        select: { performerId: true },
      }),
      // Решения по событиям — «видела/не видела ИМЕННО ЗДЕСЬ» — поверх
      // умолчаний правила (см. lib/seenLive.ts).
      prisma.eventSeenPerformer.findMany({
        where: { userId },
        select: { eventId: true, performerId: true, seen: true },
      }),
      // Третий источник — артисты на ЛИЧНЫХ событиях поездок (фанмит, ужин
      // с актёром: таких событий в нашей афише нет). Считаются только
      // ПРОШЕДШИЕ — привязать артиста к завтрашней встрече не значит уже
      // его увидеть, — и только с СОБСТВЕННОЙ отметкой «я там буду»
      // (владелец: планов создают больше, чем посещают; в совместной
      // поездке каждый отмечается сам). Автору отметка ставится при
      // создании записи по умолчанию, бэкфилл покрыл старые записи.
      prisma.tripPersonalEventPerformer.findMany({
        where: {
          personalEvent: {
            startsAt: { lt: now },
            attendances: { some: { userId } },
          },
        },
        select: { performerId: true, personalEventId: true },
      }),
    ]);

  const completedDramas =
    completedCount ?? watchRows.filter((r) => r.status === "COMPLETED").length;
  const watchByStatus = Object.fromEntries(
    WATCH_STATUS_KEYS.map((k) => [k, 0]),
  ) as Record<WatchStatusKey, number>;
  for (const r of watchRows) {
    if (r.status in watchByStatus) watchByStatus[r.status as WatchStatusKey] += 1;
  }

  // «Иду» теперь per-дата: «посещено» — прошедшие отмеченные даты,
  // событие считается один раз даже при нескольких отмеченных днях.
  const attendedRows = attendances.filter((a) => a.occurrence.startsAt < now);
  const attendedEventIds = new Set(attendedRows.map((a) => a.eventId));
  const attended = Array.from(
    new Map(attendedRows.map((a) => [a.eventId, a])).values(),
  );
  const upcoming = new Set(
    attendances.filter((a) => a.occurrence.startsAt >= now).map((a) => a.eventId),
  ).size;

  // Пустой venue — онлайн-встреча сообщества: местом она не считается,
  // иначе «разных площадок» прибавлялось бы от сидения дома.
  const venues = new Set(
    attended.map((a) => a.event.venue.trim().toLowerCase()).filter(Boolean),
  );

  // Кого именно человек видел и сколько раз. Правило одно на весь сайт —
  // lib/seenLive.ts: состав дня или события, умолчание по виду даты
  // (концерт — все, день фестиваля с лайнапом — никто), группы
  // раскрываются до участников-актёров, поверх — решения человека по
  // событию. «Раз» — это событие: два дня одного фестиваля дают один.
  //
  // К афише прибавляются два источника без правил: личные события
  // поездок (артист на встрече, которой в афише нет; каждое — +1) и
  // отметка «видели вне афиши» (+1 к артисту).
  const performerCounts = new Map<string, SeenCard & { count: number }>();
  const bump = (card: SeenCard) => {
    const cur = performerCounts.get(card.id);
    if (cur) cur.count += 1;
    else performerCounts.set(card.id, { ...card, count: 1 });
  };
  for (const entries of resolveSeen(toSeenRows(attendances), seenOverrides, now).values()) {
    for (const entry of entries.values()) if (entry.seen) bump(entry.card);
  }

  // Личные события и «вне афиши» знают только id — карточки
  // дозапрашиваем одним запросом ниже.
  const idOnly = new Map<string, number>();
  const personalSeenPairs = new Set(
    personalEventSeen.map((m) => `${m.performerId}#${m.personalEventId}`),
  );
  for (const pair of personalSeenPairs) {
    const performerId = pair.slice(0, pair.indexOf("#"));
    idOnly.set(performerId, (idOnly.get(performerId) ?? 0) + 1);
  }
  for (const m of outsideSeen) idOnly.set(m.performerId, (idOnly.get(m.performerId) ?? 0) + 1);
  const missingIds = [...idOnly.keys()].filter((id) => !performerCounts.has(id));
  const missingCards = missingIds.length
    ? await prisma.performer.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, name: true, slug: true, photoUrl: true },
      })
    : [];
  for (const card of missingCards) performerCounts.set(card.id, { ...card, count: 0 });
  for (const [performerId, extra] of idOnly) {
    const cur = performerCounts.get(performerId);
    if (cur) cur.count += extra;
  }

  const seenPerformerIds = new Set(performerCounts.keys());
  const countedPerformers = Array.from(performerCounts.values());
  // Топ-5 «кого видели чаще» — по числу событий.
  const topPerformers = countedPerformers
    .slice()
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
  // Список «кого именно видели» под счётчиком профиля. Порядок — по
  // числу событий, но пары стоят рядом и в порядке самого пейринга
  // (правка владельца 2026-09-17: «сортировать по пейрингам, как и
  // везде актёров» — правило АА4, см. lib/castLineup.ts). Рёбра
  // пейрингов — один запрос по увиденным id; helper сам отбрасывает
  // пары, где второй участник в списке не встречается.
  const seenIds = countedPerformers.map((p) => p.id);
  const seenPairings =
    seenIds.length > 1
      ? await prisma.pairing.findMany({
          where: {
            OR: [{ performerAId: { in: seenIds } }, { performerBId: { in: seenIds } }],
          },
          orderBy: { createdAt: "asc" },
          select: { performerAId: true, performerBId: true },
        })
      : [];
  const seenPerformers = keepPairingsTogether(
    countedPerformers
      .slice()
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    (p) => p.id,
    seenPairings,
  ).map(({ id, name, slug, photoUrl }) => ({ id, name, slug, photoUrl }));

  // Посещённые события списком, свежие сверху; при нескольких отмеченных
  // датах события берётся последняя посещённая.
  const latestByEvent = new Map<string, (typeof attendedRows)[number]>();
  for (const a of attendedRows) {
    const cur = latestByEvent.get(a.eventId);
    if (!cur || a.occurrence.startsAt > cur.occurrence.startsAt) latestByEvent.set(a.eventId, a);
  }
  const attendedEventsList = Array.from(latestByEvent.values())
    .sort((a, b) => b.occurrence.startsAt.getTime() - a.occurrence.startsAt.getTime())
    .map((a) => ({
      id: a.event.id,
      slug: a.event.slug,
      title: a.event.title,
      date: a.occurrence.startsAt.toISOString(),
      posterUrl: a.event.posterUrl,
      venue: a.event.venue,
    }));

  // Серии и часы у экрана. Длительность серии приходит с MDL текстом
  // («45 min.», «1 hr. 10 min.») — парсим; у сериалов без неё берём
  // условные 45 минут (обычная серия), поэтому часы показываются с «~».
  const minutesOf = (duration: string | null): number => {
    if (!duration) return 45;
    const hr = duration.match(/(\d+)\s*hr/)?.[1];
    const min = duration.match(/(\d+)\s*min/)?.[1];
    const total = (hr ? Number(hr) * 60 : 0) + (min ? Number(min) : 0);
    return total > 0 ? total : 45;
  };
  const watchedEpisodesOf = (row: (typeof watchRows)[number]): number =>
    Math.max(
      row.episodesWatched ?? 0,
      // «Просмотрено» без прогресса — значит, все серии сериала.
      row.status === "COMPLETED" ? (row.drama.episodes ?? 0) : 0,
    );
  // Пересмотр — это те же серии, только ещё раз: человек эти часы правда
  // просидел у экрана, поэтому они прибавляются к сериям и часам
  // (решение владельца). У пересмотра нет своего прогресса — считаем по
  // числу серий сериала; неизвестно оно (episodes = null) — прибавлять
  // нечего, лучше недосчитать, чем выдумать.
  const rewatchedEpisodesOf = (row: (typeof watchRows)[number]): number =>
    row.rewatchCount * (row.drama.episodes ?? 0);
  const episodesOf = (row: (typeof watchRows)[number]): number =>
    watchedEpisodesOf(row) + rewatchedEpisodesOf(row);
  const episodesWatched = watchRows.reduce((sum, r) => sum + episodesOf(r), 0);
  const hoursWatched = Math.round(
    watchRows.reduce((sum, r) => sum + episodesOf(r) * minutesOf(r.drama.duration), 0) / 60,
  );

  // Сами пересмотры — отдельными числами: сколько всего и что
  // пересматривали чаще прочего. В «досмотрено сериалов»
  // (completedDramas) они не попадают вовсе — это отдельный запрос-count
  // по статусу, и трогать его не нужно.
  const rewatchTotal = watchRows.reduce((sum, r) => sum + r.rewatchCount, 0);
  const topRewatchRow = watchRows.reduce<(typeof watchRows)[number] | null>(
    // Строго больше: при равенстве остаётся первый — так «чаще всего»
    // не прыгает от порядка строк в ответе базы.
    (best, r) => (r.rewatchCount > (best?.rewatchCount ?? 0) ? r : best),
    null,
  );
  const mostRewatched = topRewatchRow
    ? {
        title: topRewatchRow.drama.title,
        titleRu: topRewatchRow.drama.titleRu,
        count: topRewatchRow.rewatchCount,
      }
    : null;

  // Вкусовой профиль (п.6.2) — из тех же watchRows. Жанры считаются
  // только по ДОСМОТРЕННОМУ: «в планах» лежит что попало, а досмотренное
  // человек выбрал и вытерпел до конца — это и есть вкус.
  const genreCounts = new Map<string, number>();
  for (const row of watchRows) {
    if (row.status !== "COMPLETED") continue;
    for (const genre of row.drama.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  const topGenres = Array.from(genreCounts.entries())
    // При равенстве — по алфавиту, чтобы порядок не зависел от порядка
    // строк в ответе базы (та же причина, что у mostRewatched).
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count }));

  const byYear = new Map<number, number>();
  // Разбивка внутри года (правка владельца 2026-09-10): двенадцать
  // чисел на год, январь — нулевой. Считаем здесь же, вторым проходом
  // по тем же строкам ходить незачем.
  const byYearMonths = new Map<number, number[]>();
  const attendedDays: string[] = [];
  const countInCalendar = (d: Date) => {
    const year = d.getFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
    const months = byYearMonths.get(year) ?? Array<number>(12).fill(0);
    months[d.getMonth()] += 1;
    byYearMonths.set(year, months);
  };
  for (const a of attended) countInCalendar(a.occurrence.startsAt);
  // Встречи сообществ — тоже события, на которые человек ходил (правка
  // владельца 2026-09-17): в календаре они наравне с афишей, по одной
  // на событие (см. communityMeetups ниже про дубли отметок). Счётчики
  // «событий вживую» при этом остаются афишными — там же и списки.
  const seenMeetups = new Set<string>();
  for (const a of meetupAttendances) {
    if (seenMeetups.has(a.eventId)) continue;
    seenMeetups.add(a.eventId);
    countInCalendar(a.occurrence.startsAt);
  }
  // «Дубль» — два РАЗНЫХ посещённых события в один день.
  for (const a of attendedRows) attendedDays.push(`${a.eventId}|${dateKey(a.occurrence.startsAt)}`);
  const dayToEvents = new Map<string, Set<string>>();
  for (const a of attendedRows) {
    const k = dateKey(a.occurrence.startsAt);
    if (!dayToEvents.has(k)) dayToEvents.set(k, new Set());
    dayToEvents.get(k)!.add(a.eventId);
  }

  const doubleDay = Array.from(dayToEvents.values()).some((set) => set.size >= 2);

  // «Марафон» — 3 посещённые даты в пределах 7 дней.
  const sortedTimes = attendedRows
    .map((a) => a.occurrence.startsAt.getTime())
    .sort((a, b) => a - b);
  let marathonWeek = false;
  for (let i = 0; i + 2 < sortedTimes.length; i++) {
    if (sortedTimes[i + 2] - sortedTimes[i] <= 7 * 24 * 60 * 60 * 1000) {
      marathonWeek = true;
      break;
    }
  }

  // «Компанией» — событие, куда шли ≥3 друзей... точнее: ≥3 других
  // посетителей-друзей не проверяем по дружбе (дорого) — считаем «шли
  // втроём+» по общему числу отметившихся, включая юзера: 4+.
  const wentWithThreeFriends = attendedRows.some((a) => a.occurrence.attendances.length >= 4);

  // «Ранняя пташка» — отметка «иду» раньше даты открытия продаж.
  const earlyBird = attendances.some(
    (a) => a.event.presaleAt && a.createdAt < a.event.presaleAt,
  );

  // Поездки/дни — в src/lib/tripDays.ts: дни только по завершённым,
  // перекрывающиеся диапазоны (своя поездка + совместная на те же даты)
  // считаются один раз.
  // Считаем по СВОИМ датам: у общей поездки участники могут прилетать и
  // улетать вразнобой (АА17). Нет своего окна — человек ехал на всю
  // поездку, и это её собственные даты.
  // Сообщества (АА25), всё — только для ачивок.
  const communitiesJoined = memberships.filter((m) => m.community.ownerId !== userId).length;
  const communityMembersGathered = ownCommunityCrowd.reduce(
    (max, row) => Math.max(max, row._count.userId),
    0,
  );
  // По СОБЫТИЯМ, а не по отметкам: у встречи дата одна, но правка её
  // переносит, и лишняя строка отметки не должна считаться второй
  // встречей. Свои встречи не в счёт — см. комментарий у поля типа.
  const communityMeetups = new Set(
    meetupAttendances.filter((a) => a.event.createdById !== userId).map((a) => a.eventId),
  ).size;

  const tripStats = tripDayStats(
    trips.map((trip) => trip.stays[0] ?? { startDate: trip.startDate, endDate: trip.endDate }),
    now,
  );

  return {
    attendedEvents: attendedEventIds.size,
    upcomingEvents: upcoming,
    uniqueVenues: venues.size,
    performersSeenLive: seenPerformerIds.size,
    attendedEventsList,
    seenPerformers,
    topPerformers,
    visitedLocations: visits.length,
    visitedLocationPins: visits
      .filter((v) => v.location.latitude != null && v.location.longitude != null)
      .map((v) => ({
        id: v.location.id,
        name: v.location.name,
        latitude: v.location.latitude!,
        longitude: v.location.longitude!,
      })),
    completedDramas,
    anyStatusDramas: watchRows.length,
    watchByStatus,
    episodesWatched,
    hoursWatched,
    rewatchTotal,
    mostRewatched,
    topGenres,
    visitedPlaces: visits.map((v) => ({
      id: v.location.id,
      slug: v.location.slug,
      name: v.location.name,
      photoUrl: v.location.photoUrl,
      dramas: v.location.dramas.map((dl) => dl.drama),
    })),
    trips: tripStats.trips,
    tripsList: trips
      .map((trip) => {
        const range = trip.stays[0] ?? { startDate: trip.startDate, endDate: trip.endDate };
        return {
          id: trip.id,
          slug: trip.slug,
          title: trip.title,
          start: range.startDate.toISOString(),
          end: range.endDate.toISOString(),
          days: tripDays(range),
        };
      })
      .sort((a, b) => b.start.localeCompare(a.start)),
    longestTripDays: tripStats.longestTripDays,
    daysInThailand: tripStats.daysInThailand,
    friends: friendships,
    eventsByYear: Array.from(byYear.entries())
      .map(([year, count]) => ({
        year,
        count,
        months: byYearMonths.get(year) ?? Array<number>(12).fill(0),
      }))
      .sort((a, b) => a.year - b.year),
    communitiesJoined,
    communitiesOwned: ownedCommunities,
    communityPosts,
    communityMembersGathered,
    communityMeetups,
    wentWithThreeFriends,
    earlyBird,
    doubleDay,
    marathonWeek,
  };
}

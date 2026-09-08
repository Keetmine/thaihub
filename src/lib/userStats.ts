import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { dateKey } from "@/lib/dates";
import { DRAMA_TITLE_SELECT } from "@/lib/dramaLocale";
import { tripDayStats } from "@/lib/tripDays";

// Общий подсчёт статистики пользователя — питает и вкладку «Статистика»
// (Д1), и условия ачивок (Д2). Всё считается из уже собираемых данных:
// посещения, локации, watch-статусы, поездки, друзья.

export type UserStats = {
  attendedEvents: number;
  upcomingEvents: number;
  uniqueVenues: number;
  performersSeenLive: number;
  /** Что именно стоит за счётчиками «вживую» — списки под кликабельными
   *  плитками профиля: голое число вызывало вопрос «а какие?». Дата —
   *  ISO-строкой: список уезжает в клиентский компонент как есть. */
  attendedEventsList: { id: string; slug: string | null; title: string; date: string }[];
  seenPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  completedDramas: number;
  anyStatusDramas: number;
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
  /** Своя средняя оценка против MyDramaList по ТЕМ ЖЕ тайтлам: own —
   *  средняя своих оценок, diff — own минус средняя mdlScore (то есть
   *  минус = строже, плюс = щедрее), оба округлены до десятой. null —
   *  пар «своя оценка + оценка MDL» меньше пяти: на трёх оценках
   *  «строже на 2.1» звучит как диагноз, а это случайность. */
  ratingVsMdl: { own: number; diff: number; count: number } | null;
  trips: number;
  longestTripDays: number;
  daysInThailand: number;
  friends: number;
  eventsByYear: { year: number; count: number }[];
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

/** Состояние глазика «видела вживую» у ОДНОГО артиста: то же правило,
 *  что в своде, но без пересчёта всей статистики. */
export type SeenLiveState = {
  /** Итог, который показывает глазик. */
  seen: boolean;
  /** Даёт ли «видела» автоматика (событие афиши или личное событие
   *  поездки) — от этого зависит, что делать по клику: завести
   *  перекрывающую строку или, наоборот, удалить лишнюю. */
  auto: boolean;
};

/** Считают ли артиста увиденным автоматические источники: артисты
 *  ПРОШЕДШИХ событий афиши с отметкой «иду» и артисты прошедших личных
 *  событий поездок со своей отметкой «я там буду» (те же условия, что в
 *  computeUserStats). */
export async function autoSeenLive(userId: string, performerId: string): Promise<boolean> {
  const now = new Date();
  const [fromEvents, fromPersonal] = await Promise.all([
    prisma.eventAttendance.count({
      where: {
        userId,
        // Только афишные события: «видела вживую» и статистика профиля
        // считаются по концертам и фанмитам, а не по домашним встречам
        // сообществ (см. src/lib/catalogEvents.ts) — иначе достижения
        // накручивались бы собственными встречами.
        event: catalogEventsWhere(),
        occurrence: {
          startsAt: { lt: now },
          // У дня фестиваля свой состав, и отметка «иду 25-го» не делает
          // увиденными тех, кто играл 26-го (правка владельца
          // 2026-09-06). Нет состава у дня — считаем по составу события,
          // как было: у обычного концерта день и есть событие.
          OR: [
            { lineup: { some: { performerId } } },
            {
              lineup: { none: {} },
              event: { performers: { some: { performerId } } },
            },
          ],
        },
      },
    }),
    prisma.tripPersonalEventPerformer.count({
      where: {
        performerId,
        personalEvent: { startsAt: { lt: now }, attendances: { some: { userId } } },
      },
    }),
  ]);
  return fromEvents > 0 || fromPersonal > 0;
}

/** Итоговое состояние глазика: ручное решение (PerformerSeen) сильнее
 *  автоматики, а без него глазик просто следует за событиями. */
export async function getSeenLiveState(
  userId: string,
  performerId: string,
): Promise<SeenLiveState> {
  const [auto, manual] = await Promise.all([
    autoSeenLive(userId, performerId),
    prisma.performerSeen.findUnique({
      where: { userId_performerId: { userId, performerId } },
      select: { seen: true },
    }),
  ]);
  return { seen: manual ? manual.seen : auto, auto };
}

export async function computeUserStats(userId: string): Promise<UserStats> {
  const now = new Date();

  const [
    attendances,
    visits,
    completedDramas,
    watchRows,
    trips,
    friendships,
    memberships,
    ownedCommunities,
    communityPosts,
    ownCommunityCrowd,
    meetupAttendances,
  ] = await Promise.all([
      prisma.eventAttendance.findMany({
        // Та же причина, что в autoSeenLive: статистика — про афишу.
        where: { userId, event: catalogEventsWhere() },
        include: {
          occurrence: {
            include: {
              attendances: { select: { userId: true } },
              // Состав именно этого дня — по нему считаются увиденные
              // артисты, если он у дня есть (см. ниже).
              lineup: {
                include: {
                  performer: { select: { id: true, name: true, slug: true, photoUrl: true } },
                },
              },
            },
          },
          event: {
            include: {
              performers: { include: { performer: { select: { id: true, name: true, slug: true, photoUrl: true } } } },
            },
          },
        },
      }),
      prisma.locationVisit.findMany({
        where: { userId },
        include: { location: { select: { id: true, name: true, latitude: true, longitude: true } } },
      }),
      prisma.dramaWatchStatus.count({ where: { userId, status: "COMPLETED" } }),
      // Все статусы целиком, а не count: из них же считаются серии и
      // часы у экрана и пересмотры.
      prisma.dramaWatchStatus.findMany({
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
      }),
      // Поездки — свои И совместные, где инвайт принят: тот же критерий,
      // что у списка /trips и главной (жалоба владельца: подругу добавили
      // в поездку, а «дней в Таиланде» у неё 0). PENDING не считается —
      // приглашение ещё не значит, что человек поехал.
      prisma.trip.findMany({
        where: {
          OR: [{ userId }, { members: { some: { userId, status: "ACCEPTED" } } }],
        },
        select: {
          startDate: true,
          endDate: true,
          // Своё окно присутствия, если человек летел не на все дни
          // (АА17): по нему и считаем, иначе подруга, прилетевшая на
          // четыре дня позже, получала бы чужие дни в Таиланде.
          stays: { where: { userId }, select: { startDate: true, endDate: true } },
        },
      }),
      prisma.friendship.count({
        where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      }),
      // Дальше — только для ачивок про сообщества (АА25).
      // Членства: владелец своего сообщества тоже лежит строкой
      // CommunityMember, поэтому «вступил» и «завёл» различаем по
      // владельцу сообщества, а не по роли (роль владельца можно и
      // потерять при кривой строке в базе, ownerId — нет).
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
        select: { eventId: true, event: { select: { createdById: true } } },
      }),
    ]);

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

  const performerCounts = new Map<string, { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }>();
  // Кого именно человек видел: у дня фестиваля свой состав, и отметка
  // «иду 25-го» не приводит в увиденные тех, кто играл 26-го (правка
  // владельца 2026-09-06). У дня без своего состава берётся состав
  // события — у обычного концерта день и есть событие.
  //
  // Считаем по СОБЫТИЯМ, а не по отмеченным дням: сходил на оба дня
  // фестиваля — артист, игравший там дважды, всё равно «видел один
  // раз», как и было до расписаний.
  const seenByEvent = new Map<
    string,
    Map<string, { id: string; name: string; slug: string | null; photoUrl: string | null }>
  >();
  for (const a of attendedRows) {
    const dayCast =
      a.occurrence.lineup.length > 0
        ? a.occurrence.lineup.map((l) => l.performer)
        : a.event.performers.map((ep) => ep.performer);
    let bucket = seenByEvent.get(a.eventId);
    if (!bucket) {
      bucket = new Map();
      seenByEvent.set(a.eventId, bucket);
    }
    for (const performer of dayCast) bucket.set(performer.id, performer);
  }
  for (const bucket of seenByEvent.values()) {
    for (const performer of bucket.values()) {
      const cur = performerCounts.get(performer.id);
      if (cur) cur.count += 1;
      else performerCounts.set(performer.id, { ...performer, count: 1 });
    }
  }
  // Ручные РЕШЕНИЯ «видела вживую» (PerformerSeen): перекрывают
  // автоматику в обе стороны. seen=true — концерты до регистрации на
  // сайте, случайные встречи и события вне нашей афиши; seen=false —
  // «этого из состава я не видела» (на концерте пятеро, а разглядела
  // двоих). Совпадающего с автоматикой решения в таблице не бывает —
  // такую строку экшен удаляет.
  const manualSeen = await prisma.performerSeen.findMany({
    where: { userId },
    select: { performerId: true, seen: true },
  });
  // Третий источник — артисты на ЛИЧНЫХ событиях поездок (фанмит, ужин
  // с актёром: таких событий в нашей афише нет). Считаются только
  // ПРОШЕДШИЕ — привязать артиста к завтрашней встрече не значит уже
  // его увидеть, — и только с СОБСТВЕННОЙ отметкой «я там буду»
  // (владелец: планов создают больше, чем посещают; в совместной
  // поездке каждый отмечается сам). Автору отметка ставится при
  // создании записи по умолчанию, бэкфилл покрыл старые записи.
  const personalEventSeen = await prisma.tripPersonalEventPerformer.findMany({
    where: {
      personalEvent: {
        startsAt: { lt: now },
        attendances: { some: { userId } },
      },
    },
    select: { performerId: true },
  });
  const excludedIds = new Set(manualSeen.filter((m) => !m.seen).map((m) => m.performerId));
  const seenPerformerIds = new Set(
    [
      ...performerCounts.keys(),
      ...manualSeen.filter((m) => m.seen).map((m) => m.performerId),
      ...personalEventSeen.map((m) => m.performerId),
    ].filter((id) => !excludedIds.has(id)),
  );

  // Топ-5 «кого видели чаще» — по посещённым событиям, но снятые вручную
  // артисты из него уходят: они больше не «вживую», а число посещений
  // события у них при этом самое большое.
  const countedPerformers = Array.from(performerCounts.values()).filter(
    (p) => !excludedIds.has(p.id),
  );
  const topPerformers = countedPerformers
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Список «кого именно видели» под кликабельной плиткой профиля.
  // Карточки артистов с посещённых событий уже собраны в performerCounts;
  // у ручных отметок и личных событий там только id — дозапрашиваем.
  const extraSeenIds = [...seenPerformerIds].filter((id) => !performerCounts.has(id));
  const extraSeen = extraSeenIds.length
    ? await prisma.performer.findMany({
        where: { id: { in: extraSeenIds } },
        select: { id: true, name: true, slug: true, photoUrl: true },
      })
    : [];
  const seenPerformers = [
    ...countedPerformers
      .slice()
      .sort((a, b) => b.count - a.count)
      .map(({ id, name, slug, photoUrl }) => ({ id, name, slug, photoUrl })),
    ...extraSeen.sort((a, b) => a.name.localeCompare(b.name)),
  ];

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
  const round1 = (n: number) => Math.round(n * 10) / 10;
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

  // «Строже/щедрее MDL»: сравниваем средние ПО ОДНИМ И ТЕМ ЖЕ тайтлам —
  // своя средняя по всему списку против общей средней MDL сравнивала бы
  // разные множества сериалов и была бы просто неправдой.
  const ratedPairs = watchRows.filter(
    (row): row is (typeof watchRows)[number] & { rating: number } =>
      row.rating != null && row.drama.mdlScore != null,
  );
  const ratingVsMdl =
    ratedPairs.length >= 5
      ? {
          own: round1(ratedPairs.reduce((sum, r) => sum + r.rating, 0) / ratedPairs.length),
          diff: round1(
            ratedPairs.reduce((sum, r) => sum + (r.rating - r.drama.mdlScore!), 0) /
              ratedPairs.length,
          ),
          count: ratedPairs.length,
        }
      : null;

  const byYear = new Map<number, number>();
  const attendedDays: string[] = [];
  for (const a of attended) {
    const d = a.occurrence.startsAt;
    byYear.set(d.getFullYear(), (byYear.get(d.getFullYear()) ?? 0) + 1);
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
    episodesWatched,
    hoursWatched,
    rewatchTotal,
    mostRewatched,
    topGenres,
    ratingVsMdl,
    trips: tripStats.trips,
    longestTripDays: tripStats.longestTripDays,
    daysInThailand: tripStats.daysInThailand,
    friends: friendships,
    eventsByYear: Array.from(byYear.entries())
      .map(([year, count]) => ({ year, count }))
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

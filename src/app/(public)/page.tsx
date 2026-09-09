import Link from "@/components/AppLink";
import { unstable_cache } from "next/cache";
import { getT, type Dict } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { catalogOccurrencesWhere } from "@/lib/catalogEvents";
import { pageMetadata } from "@/lib/seo";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { getMusicNews, getLocationNews } from "@/lib/whatsNew";
import { queryOnThisDayDramas } from "@/lib/onThisDay";
import { getFriendIds } from "@/lib/friends";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
import { tripHref, dramaHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { endOfDay, formatShortDate, startOfDay } from "@/lib/dates";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { userHref, userDisplayName } from "@/lib/userProfile";
import LetterAvatar from "@/components/LetterAvatar";
import PosterTile from "@/components/PosterTile";
import EpisodeProgress from "@/components/EpisodeProgress";
import EmptyState from "@/components/EmptyState";
import MusicReleaseCard from "@/components/MusicReleaseCard";
import HomeCommunities from "./HomeCommunities";
import HomeFriendsFeed from "./HomeFriendsFeed";
import LandingPage from "./LandingPage";

export const dynamic = "force-dynamic";

// С-1: у главной не было своих метаданных вовсе — ни canonical, ни
// hreflang, а title оставался голым «MyBLHub». Заголовок с ключевыми
// словами и описание сайта — из словаря; canonical и языковые
// альтернативы собирает общий pageMetadata.
export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.home.metaTitle,
    description: t.ui.siteDescription,
    path: "/",
  });
}

/* ------------------------------------------------------------------
 * Кэш общих (неперсональных) выборок главной: «выходит сегодня» и дни
 * рождения артистов одинаковы для всех — считать их на каждый заход
 * незачем. День входит в аргументы (а значит и в ключ кэша), поэтому
 * смена суток заводит свежую запись; правка каталога сбрасывает тегом.
 * Персональные выборки (поездки, «иду», статусы) НЕ кэшируются.
 * ------------------------------------------------------------------ */

const getAiringTodayEpisodes = unstable_cache(
  async (dayStartIso: string, dayEndIso: string) =>
    prisma.dramaEpisode.findMany({
      where: {
        airDate: { gte: new Date(dayStartIso), lte: new Date(dayEndIso) },
      },
      select: {
        number: true,
        drama: {
          select: {
            id: true,
            slug: true,
            title: true,
            titleRu: true,
            posterUrl: true,
            year: true,
          },
        },
      },
      orderBy: { number: "asc" },
    }),
  ["home-airing-today"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

const getBirthdayPerformers = unstable_cache(
  async (month: number, day: number) =>
    prisma.$queryRaw<
      {
        id: string;
        name: string;
        slug: string | null;
        photoUrl: string | null;
        birthDate: Date;
      }[]
    >`
      SELECT p.id, p.name, p.slug, p."photoUrl", p."birthDate"
      FROM "Performer" p
      WHERE p."birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM p."birthDate") = ${month}
        AND EXTRACT(DAY FROM p."birthDate") = ${day}
      LIMIT 24
    `,
  ["home-birthday-performers"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

// «В этот день» — годовщины премьер (Drama.airedFrom, см.
// lib/onThisDay.ts). Сутки, а не полчаса: список меняется только со
// сменой даты, а дата входит в ключ; правка каталога сбросит тегом.
const getOnThisDayDramas = unstable_cache(
  async (month: number, day: number, year: number) =>
    queryOnThisDayDramas(month, day, year),
  ["home-on-this-day"],
  { revalidate: 86400, tags: [CATALOG_TAG] },
);

// Главная для своих: сводка вместо сразу афиши. Сюда ведёт логотип, и
// это первое, что человек видит после входа — ближайшее из «иду»
// постерами, новинки любимых артистов, планы друзей. Афиша — на /events.
/** «через 3 дня» / «завтра» / «уже идёт» — обратный отсчёт до поездки:
 *  сухие даты сами по себе не отвечают на вопрос «а скоро ли». */
function countdown(start: Date, t: Dict): string {
  const days = Math.ceil((start.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return t.home.countdownToday;
  if (days === 1) return t.home.countdownTomorrow;
  if (days < 31) return t.home.countdownDays(days);
  const months = Math.round(days / 30);
  return months <= 1 ? t.home.countdownMonth : t.home.countdownMonths(months);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ airing?: string }>;
}) {
  // ?airing=mine — «Выходит сегодня» только по отмеченным сериалам
  // (просьба владельца 2026-09-06). Состояние в адресе, а не в куке:
  // ссылкой можно поделиться, и без JS переключатель тоже работает.
  const { airing } = await searchParams;
  const onlyMineAiring = airing === "mine";
  const user = await getCurrentUser();
  if (!user) return <LandingPage />;

  const { t: dict, locale } = await getT();
  const premium = isPremiumActive(user);
  const now = new Date();

  const [
    news,
    myUpcoming,
    friendIds,
    favoritePerformers,
    upcomingTrips,
    watchingNow,
    myPersonalEvents,
    airingTodayEpisodes,
    locationNews,
    communityCount,
  ] = await Promise.all([
    // Новинки любимых артистов; если избранного ещё нет — общие.
    getMusicNews({ limit: 8, userId: user.id, onlyFavorites: true }).then(
      async (own) => (own.length > 0 ? own : getMusicNews({ limit: 8 })),
    ),
    premium
      ? prisma.eventAttendance.findMany({
          // Блок «мои ближайшие» на главной — про афишу; встречи живут
          // на страницах сообществ (см. src/lib/catalogEvents.ts).
          where: {
            userId: user.id,
            occurrence: {
              ...catalogOccurrencesWhere(),
              startsAt: { gte: now },
            },
          },
          select: {
            occurrence: { select: { startsAt: true } },
            event: {
              select: {
                id: true,
                slug: true,
                title: true,
                venue: true,
                posterUrl: true,
              },
            },
          },
          orderBy: { occurrence: { startsAt: "asc" } },
          take: 4,
        })
      : Promise.resolve([]),
    getFriendIds(user.id),
    prisma.favoritePerformer.count({ where: { userId: user.id } }),
    // Предстоящие поездки (свои + принятые совместные) — блок на главной.
    premium
      ? prisma.trip.findMany({
          where: {
            endDate: { gte: now },
            OR: [
              { userId: user.id },
              { members: { some: { userId: user.id, status: "ACCEPTED" } } },
            ],
          },
          select: {
            id: true,
            slug: true,
            title: true,
            startDate: true,
            endDate: true,
            userId: true,
          },
          orderBy: { startDate: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
    // «Смотрю сейчас» — сериалы со статусом WATCHING; не за подпиской,
    // как и весь каталог сериалов.
    prisma.dramaWatchStatus.findMany({
      where: { userId: user.id, status: "WATCHING" },
      select: {
        episodesWatched: true,
        drama: {
          select: {
            id: true,
            slug: true,
            title: true,
            titleRu: true,
            posterUrl: true,
            year: true,
            episodes: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      // Шесть — это ровно два ряда по три (правка владельца
      // 2026-09-06): сетка не оставляет дырок.
      take: 6,
    }),
    // Ж11: личные события поездок с галочкой «показывать на главной» —
    // встали в общий блок «Вы идёте» рядом с событиями афиши. Только
    // свои записи (в совместных поездках чужое личное сюда не тянем).
    premium
      ? prisma.tripPersonalEvent.findMany({
          where: {
            showOnHome: true,
            startsAt: { gte: now },
            OR: [{ trip: { userId: user.id } }, { createdById: user.id }],
          },
          select: {
            id: true,
            title: true,
            startsAt: true,
            trip: { select: { id: true, slug: true, title: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 4,
        })
      : Promise.resolve([]),
    // «Сегодня выходит новая серия»: строки расписания с сегодняшней
    // датой. Границы суток берём startOfDay/endOfDay — даты эфира лежат
    // тайским настенным временем, и сравнение с моментом `now` под утро
    // отдавало бы вчерашний день. Отдельного фильтра «онгоинги» нет и не
    // нужно: расписание ведётся только у тех сериалов, что ещё выходят,
    // а у завершённого сегодняшних дат не бывает. Выборка общая для
    // всех — из кэша (см. getAiringTodayEpisodes выше).
    getAiringTodayEpisodes(
      startOfDay(now).toISOString(),
      endOfDay(now).toISOString(),
    ),
    // «У сериала появились места съёмок» — вторая половина ленты «что
    // нового» (просьба владельца): музыка приезжает обходом YouTube
    // Music, локации — прогоном blscene.
    getLocationNews(4),
    // Гейт блока «В ваших сообществах» (АА25): главная — самая
    // посещаемая страница, и лишних запросов на ней быть не должно.
    // Один индексированный `count` (участий у человека максимум
    // горстка) решает, идти ли за темами и встречами вообще: не
    // состоит — блок не рендерится, и запросов от него ноль. Сам отбор
    // содержимого считает HomeCommunities, чтобы фильтр приватности жил
    // в одном месте, а не половиной здесь.
    prisma.communityMember.count({
      where: { userId: user.id, status: "ACTIVE" },
    }),
  ]);

  // Сдвоенный показ — две строки на один сериал: карточка всё равно
  // одна, с диапазоном серий.
  const airingTodayByDrama = new Map<
    string,
    {
      drama: (typeof airingTodayEpisodes)[number]["drama"];
      from: number;
      to: number;
    }
  >();
  for (const ep of airingTodayEpisodes) {
    const seen = airingTodayByDrama.get(ep.drama.id);
    if (seen) {
      seen.from = Math.min(seen.from, ep.number);
      seen.to = Math.max(seen.to, ep.number);
    } else {
      airingTodayByDrama.set(ep.drama.id, {
        drama: ep.drama,
        from: ep.number,
        to: ep.number,
      });
    }
  }

  // Ж11: события афиши и отмеченные личные события — один список,
  // отсортированный по дате: на главной человеку важно «что ближайшее»,
  // а не из какого раздела запись.
  const goingCards = [
    ...myUpcoming.map((a) => ({
      key: `event-${a.event.id}-${+a.occurrence.startsAt}`,
      href: eventHref(a.event),
      posterUrl: a.event.posterUrl,
      title: a.event.title,
      subtitle: a.event.venue as string | null,
      startsAt: a.occurrence.startsAt,
    })),
    ...myPersonalEvents.map((p) => ({
      key: `personal-${p.id}`,
      href: tripHref(p.trip),
      posterUrl: null,
      title: p.title,
      subtitle: p.trip.title as string | null,
      startsAt: p.startsAt,
    })),
  ]
    .sort((a, b) => +a.startsAt - +b.startsAt)
    .slice(0, 4);

  // Дни рождения «сегодня»: у артистов месяц/день сравниваем в SQL —
  // каталог на тысячи строк, целиком его тянуть нельзя. Друзей мало,
  // поэтому их отбираем в памяти.
  const todayMonth = now.getUTCMonth() + 1;
  const todayDay = now.getUTCDate();
  const [
    birthdayPerformersCached,
    onThisDayCached,
    friendBirthdayRows,
    favoriteIds,
    airingTodayStatuses,
  ] = await Promise.all([
    getBirthdayPerformers(todayMonth, todayDay),
    getOnThisDayDramas(todayMonth, todayDay, now.getUTCFullYear()),
    friendIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: friendIds }, birthDate: { not: null } },
          select: {
            id: true,
            name: true,
            username: true,
            photoUrl: true,
            birthDate: true,
          },
        })
      : Promise.resolve([]),
    prisma.favoritePerformer.findMany({
      where: { userId: user.id },
      select: { performerId: true },
    }),
    getDramaWatchStatuses([...airingTodayByDrama.keys()], user.id),
  ]);
  // Из кэша даты приходят строками (значение сериализуется) — вернуть Date.
  const birthdayPerformersRaw = birthdayPerformersCached.map((p) => ({
    ...p,
    birthDate: new Date(p.birthDate),
  }));
  const onThisDay = onThisDayCached.map((d) => ({
    ...d,
    airedFrom: new Date(d.airedFrom),
  }));

  // Витрина, а не личный список: показываем всё, что выходит сегодня, —
  // «Смотрю сейчас» ниже как раз про личное, а этот блок отвечает на
  // «что вообще выходит». Но отмеченное человеком идёт вперёд и
  // подписывается статусом: своё в общем ряду должно быть видно сразу.
  const airingTodayAll = [...airingTodayByDrama.values()].sort(
    (a, b) =>
      Number(airingTodayStatuses.has(b.drama.id)) -
        Number(airingTodayStatuses.has(a.drama.id)) ||
      a.drama.title.localeCompare(b.drama.title),
  );
  const airingTodayMineCount = airingTodayAll.filter((a) =>
    airingTodayStatuses.has(a.drama.id),
  ).length;
  const airingToday = (
    onlyMineAiring
      ? airingTodayAll.filter((a) => airingTodayStatuses.has(a.drama.id))
      : airingTodayAll
  ).slice(0, 6);

  const favoriteSet = new Set(favoriteIds.map((f) => f.performerId));
  const turns = (birthDate: Date) =>
    now.getUTCFullYear() - birthDate.getUTCFullYear();
  // Свои артисты вперёд: «сегодня др у того, кого я слежу» важнее, чем
  // у случайного человека из каталога.
  const birthdayPerformers = [...birthdayPerformersRaw]
    .sort(
      (a, b) =>
        Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 5);
  const birthdayFriends = friendBirthdayRows.filter(
    (f) =>
      f.birthDate &&
      f.birthDate.getUTCMonth() + 1 === todayMonth &&
      f.birthDate.getUTCDate() === todayDay,
  );
  const hasBirthdays =
    birthdayPerformers.length > 0 || birthdayFriends.length > 0;
  // Правая колонка ряда живёт, пока в ней есть хоть один из двух
  // «календарных» блоков: дни рождения или годовщины премьер.

  // Призывы для того, у кого страница ещё пустая (правка владельца
  // 2026-09-10: «для юзера, который только зарегался, справа куча
  // пустого пространства; добавить больше CTA»). Показываем ровно то,
  // чего у человека НЕТ, — и не показываем ничего, когда всё уже есть.
  // Ссылки ведут в разделы, а не в онбординг: тур человек уже прошёл.
  const startCards = [
    favoritePerformers === 0 && {
      href: "/artists",
      emoji: "⭐️",
      title: dict.home.startArtists,
      hint: dict.home.startArtistsHint,
    },
    watchingNow.length === 0 && {
      href: "/dramas",
      emoji: "📺",
      title: dict.home.startDramas,
      hint: dict.home.startDramasHint,
    },
    friendIds.length === 0 && {
      href: "/friends",
      emoji: "🤝",
      title: dict.home.startFriends,
      hint: dict.home.startFriendsHint,
    },
    communityCount === 0 && {
      href: "/communities",
      emoji: "🫂",
      title: dict.home.startCommunities,
      hint: dict.home.startCommunitiesHint,
    },
  ].filter(
    (c): c is { href: string; emoji: string; title: string; hint: string } =>
      !!c,
  );

  const birthdaysCard = hasBirthdays ? (
    <section className="h-100 d-flex flex-column">
      <h2 className="section-heading mb-3">🎂 {dict.home.birthdays}</h2>
      <div className="d-flex flex-column gap-3">
        {birthdayFriends.map((f) => (
          <Link
            key={f.id}
            href={userHref(f)}
            className="d-flex align-items-center gap-3 text-decoration-none"
          >
            <LetterAvatar name={f.name} photoUrl={f.photoUrl} size={2.6} />
            <span style={{ minWidth: 0 }}>
              <span className="text-white d-block text-truncate">
                {userDisplayName(f, locale)}
              </span>
              <span className="small text-secondary">
                {f.birthDate
                  ? `${turns(f.birthDate)} — ${dict.home.yourFriend}`
                  : dict.home.yourFriend}
              </span>
            </span>
          </Link>
        ))}
        {birthdayPerformers.map((p) => (
          <Link
            key={p.id}
            href={performerHref(p)}
            className="d-flex align-items-center gap-3 text-decoration-none"
          >
            <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={2.6} />
            <span style={{ minWidth: 0 }}>
              <span className="text-white d-block text-truncate">{p.name}</span>
              <span className="small text-secondary">
                {dict.home.turns(turns(p.birthDate))}
                {favoriteSet.has(p.id) ? ` · ${dict.home.inFavourites}` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  ) : null;

  {
    /* «В этот день» — ностальгия по годовщинам премьер
                (Drama.airedFrom, день+месяц = сегодня, год раньше
                текущего). Та же манера, что у дней рождения: строка =
                постер, название, подпись. Пусто сегодня — блока нет. */
  }
  const onThisDayCard =
    onThisDay.length > 0 ? (
      <section className="h-100 d-flex flex-column">
        <h2 className="section-heading mb-3">📅 {dict.home.onThisDay}</h2>
        <div className="d-flex flex-column gap-3">
          {onThisDay.map((d) => (
            <Link
              key={d.id}
              href={dramaHref(d)}
              className="d-flex align-items-center gap-3 text-decoration-none"
            >
              <LetterAvatar
                name={dramaTitleForLocale(d, locale)}
                photoUrl={d.posterUrl}
                size={2.6}
                rounded={false}
              />
              <span style={{ minWidth: 0 }}>
                <span className="text-white d-block text-truncate">
                  {dramaTitleForLocale(d, locale)}
                </span>
                <span className="small text-secondary">
                  {dict.home.onThisDayAgo(
                    now.getUTCFullYear() - d.airedFrom.getUTCFullYear(),
                  )}
                  {` · ${d.airedFrom.getUTCFullYear()}`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div>
      {/* Бенто-сетка (правка владельца 2026-09-10 с референсами):
          плитки разного размера в одной grid с `dense`, а не ряды
          колонок. Пустая плитка больше не растягивается под соседа —
          высоту задаёт содержимое, а дырки в потоке закрывает следующая
          подходящая плитка. */}
      {/* Приветствие — заголовок страницы НАД сеткой (правка владельца
          2026-09-10): внутри сетки оно выглядело ещё одной плиткой, а
          это единственный крупный текст, которому фон не нужен. Имя —
          акцентным цветом: в строке это единственное своё слово. */}
      <div className="mb-4">
        <span className="eyebrow">{dict.home.eyebrow}</span>
        <p className="bento-hero-name font-display fw-medium text-white mt-2 mb-3">
          {dict.home.hello}{" "}
          <span className="bento-hello-name">
            {userDisplayName(user, locale)}
          </span>
        </p>
        <div className="d-flex flex-wrap gap-2">
          <Link href="/events" className="chip-link">
            {dict.nav.events}
          </Link>
          <Link href="/calendar" className="chip-link">
            {dict.nav.calendar}
          </Link>
          <Link href="/trips" className="chip-link">
            {dict.nav.trips}
          </Link>
        </div>
      </div>

      <div className="bento mb-4">
        {/* «С чего начать» — те же плитки, что и у остального: в
            референсах разные размеры смотрятся цельно ровно потому, что
            оформлены одинаково. Показываем ровно то, чего у человека
            ещё нет, — это и заполняет пустые места в сетке у новичка. */}
        {startCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bento-tile bento-tile-link"
            data-span="4"
          >
            <span className="bento-cta-emoji mb-2" aria-hidden>
              {card.emoji}
            </span>
            <span className="font-display fw-medium text-white mb-1">
              {card.title}
            </span>
            <span className="small text-secondary">{card.hint}</span>
          </Link>
        ))}

        {/* «Что впереди» — план и поездки одной плиткой: и то и другое
            отвечает на вопрос «что у меня скоро». Ширину просит по
            содержимому: с картинками планов — во всю строку, с одним
            апселлом — узкой полосой, чтобы рядом встали календарные
            карточки. */}
        {/* Ширина — по содержимому, а не по важности: широкая плитка
            зияла пустотой справа от двух афиш (правка владельца
            2026-09-10). Ряд складывается из трёх равных плиток. */}
        <div className="bento-tile" data-span="4">
          <section className="h-100 d-flex flex-column">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="section-heading mb-0">{dict.home.upcoming}</h2>
              {premium && (
                <Link
                  href="/events?filter=going"
                  className="small text-secondary"
                >
                  {dict.common.all}
                </Link>
              )}
            </div>

            {upcomingTrips.length > 0 && (
              <div className="d-flex flex-column gap-2 mb-3">
                {upcomingTrips.map((t) => (
                  <Link
                    key={t.id}
                    href={tripHref(t)}
                    className="home-trip-strip d-flex flex-wrap align-items-center gap-3"
                  >
                    <span className="trip-dates mb-0">
                      {formatShortDate(t.startDate, locale)}{" "}
                      <span className="trip-dates-arrow">→</span>{" "}
                      {formatShortDate(t.endDate, locale)}
                      <span className="trip-dates-year">
                        {t.endDate.getFullYear()}
                      </span>
                    </span>
                    <span className="font-display fw-medium text-white flex-grow-1 text-truncate">
                      {t.title}
                    </span>
                    <span className="d-flex flex-wrap gap-2 flex-shrink-0">
                      {t.userId !== user.id && (
                        <span className="date-chip">{dict.home.shared}</span>
                      )}
                      <span className="date-chip">
                        {countdown(t.startDate, dict)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {!premium ? (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div>
                  <p className="font-display fw-medium text-white mb-1">
                    {dict.home.paywallTitle}
                  </p>
                  <p
                    className="small text-secondary mb-0"
                    style={{ maxWidth: "30rem" }}
                  >
                    {dict.home.paywallHint}
                  </p>
                </div>
                <Link href="/events" className="btn btn-primary flex-shrink-0">
                  {dict.home.paywallCta}
                </Link>
              </div>
            ) : goingCards.length === 0 ? (
              <EmptyState
                emoji="🎫"
                title={dict.home.emptyGoingTitle}
                hint={dict.home.emptyGoingHint}
                cta={{ href: "/events", label: dict.home.emptyGoingCta }}
                compact
              />
            ) : (
              <div className="row g-3 stagger">
                {goingCards.map((card) => (
                  <div key={card.key} className="col-6">
                    <PosterTile
                      href={card.href}
                      posterUrl={card.posterUrl}
                      title={card.title}
                      subtitle={card.subtitle}
                      chip={formatShortDate(card.startsAt, locale)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Календарные карточки — самостоятельные плитки, а не колонка
            сбоку: в бенто они сами встают рядом с «Что впереди», если
            там просторно, и переносятся под него, если нет. */}
        {/* Календарные карточки — по трети строки, рядом с «Что
            впереди»: три плитки одной высоты читаются цельно, а стопка
            рядом с короткой плиткой давала дыру снизу. */}
        {birthdaysCard && (
          <div className="bento-tile" data-span="4">
            {birthdaysCard}
          </div>
        )}
        {onThisDayCard && (
          <div className="bento-tile" data-span="4">
            {onThisDayCard}
          </div>
        )}

        {/* «Выходит сегодня» и «Смотрю сейчас» — плитки в той же сетке
            (правка владельца 2026-09-10; до бенто это был отдельный ряд
            из двух колонок). */}
        {/* «Выходит сегодня» и «Смотрю сейчас» — БЕЗ фона-плитки
            (правка владельца 2026-09-10: «не нравится, что визуально всё
            карточками»). Их держит заголовок и собственные строки-
            карточки внутри, рамка вокруг рамок только дробила бы ряд. */}
        {airingToday.length > 0 && (
          <div className="bento-tile" data-span="6">
            <section className="h-100 d-flex flex-column">
              {/* И9: из блока должен быть выход в календарь серий — раньше
              человек видел сегодняшнее и не догадывался, что есть
              расписание на месяц. Тот же вид, что «Все» у соседей. */}
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <h2 className="section-heading mb-0">
                  {dict.home.airingToday}
                </h2>
                <span className="d-flex align-items-center gap-2 small">
                  {/* Переключатель «вся афиша / только моё» (просьба
                  владельца). Показываем, только когда своё вообще есть:
                  иначе «Мои» вело бы в заведомо пустой список. */}
                  {airingTodayMineCount > 0 && (
                    <>
                      {/* Link здесь — это наш AppLink (см. импорт вверху):
                      адрес сам получает префикс языка. */}
                      <Link
                        href="/"
                        prefetch={false}
                        className={
                          onlyMineAiring
                            ? "text-secondary"
                            : "text-white fw-medium"
                        }
                      >
                        {dict.home.airingAll}
                      </Link>
                      <Link
                        href="/?airing=mine"
                        prefetch={false}
                        className={
                          onlyMineAiring
                            ? "text-white fw-medium"
                            : "text-secondary"
                        }
                      >
                        {dict.home.airingMine}
                      </Link>
                      <span className="text-secondary">·</span>
                    </>
                  )}
                  <Link href="/calendar?view=series" className="text-secondary">
                    {dict.home.airingTodayCalendar}
                  </Link>
                </span>
              </div>
              <div className="d-flex flex-column gap-1 stagger">
                {airingToday.map(({ drama, from, to }) => {
                  const marked = airingTodayStatuses.get(drama.id);
                  const subline = marked
                    ? dict.catalog.watchStatus[marked.status]
                    : drama.year
                      ? String(drama.year)
                      : null;
                  return (
                    <Link
                      key={drama.id}
                      href={dramaHref(drama)}
                      className="surface surface-hover d-flex align-items-center gap-2 airing-row text-decoration-none"
                    >
                      <span className="drama-row-poster airing-row-poster">
                        {drama.posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            loading="lazy"
                            decoding="async"
                            src={drama.posterUrl}
                            alt=""
                          />
                        ) : (
                          <span className="drama-row-poster-letter" aria-hidden>
                            {dramaTitleForLocale(drama, locale)
                              .trim()
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="flex-fill" style={{ minWidth: 0 }}>
                        <span className="font-display fw-medium text-white d-block text-truncate">
                          {dramaTitleForLocale(drama, locale)}
                        </span>
                        {subline && (
                          <span className="small text-secondary">
                            {subline}
                          </span>
                        )}
                      </span>
                      <span className="date-chip flex-shrink-0">
                        {from === to
                          ? dict.home.airingTodayEpisode(from)
                          : dict.home.airingTodayEpisodes(from, to)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {watchingNow.length > 0 && (
          <div className="bento-tile" data-span="6">
            <section className="h-100 d-flex flex-column">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <h2 className="section-heading mb-0">
                  {dict.home.watchingNow}
                </h2>
                <Link href="/dramas" className="small text-secondary">
                  {dict.common.all}
                </Link>
              </div>
              <div className="row g-3 stagger">
                {watchingNow.map(({ drama, episodesWatched }) => (
                  <div key={drama.id} className="col-4 poster-tile-cell">
                    <PosterTile
                      href={dramaHref(drama)}
                      posterUrl={drama.posterUrl}
                      title={dramaTitleForLocale(drama, locale)}
                      subtitle={drama.year ? String(drama.year) : undefined}
                      progress={
                        drama.episodes && episodesWatched != null
                          ? {
                              watched: episodesWatched,
                              total: drama.episodes,
                              label: dict.catalog.episodes.of(
                                episodesWatched,
                                drama.episodes,
                              ),
                            }
                          : null
                      }
                    />
                    {/* Править серии — отсюда, без захода на страницу:
                      ровно это человек и делает, досмотрев серию. Полоса
                      рисуется внутри постера, поэтому у счётчика своей
                      нет. Карточка здесь рабочая, а не витринная, — этим
                      она и отличается от постеров в каталоге, где
                      прогресса нет вовсе.

                      Счётчик лежит ПОВЕРХ постера (чипом в углу), но в
                      разметке — рядом с плиткой, а не внутри: плитка
                      целиком ссылка, а кнопку в ссылку класть нельзя.
                      Позиционирует .poster-tile-cell в globals.css. */}
                    <EpisodeProgress
                      dramaId={drama.id}
                      total={drama.episodes}
                      watched={episodesWatched}
                      variant="card"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* «В ваших сообществах» — ПОД личным расписанием и НАД лентой
          новинок каталога: встречи и разговоры своих важнее свежего
          сингла, но не важнее того, куда человек сам собрался. Блока
          нет вовсе у того, кто ни в одном сообществе не состоит, — и
          это не «пустая секция», а её отсутствие: показывать нечего, а
          звать вступать есть кому на витрине. Содержимое сообществ
          закрытое, поэтому отбирает его сам компонент своими запросами
            (см. HomeCommunities). */}
        {communityCount > 0 && (
          <div
            className="bento-tile"
            data-span={friendIds.length > 0 ? "7" : "12"}
          >
            <HomeCommunities userId={user.id} />
          </div>
        )}

        {/* «У друзей» — три последние записи активности друзей
            (минимальная версия Г3, см. HomeFriendsFeed). Гейт — уже
            посчитанные friendIds: без друзей ни блока, ни запросов. */}
        {friendIds.length > 0 && (
          <div
            className="bento-tile"
            data-span={communityCount > 0 ? "5" : "6"}
          >
            <HomeFriendsFeed friendIds={friendIds} viewerPremium={premium} />
          </div>
        )}

        {/* Новинки каталога — во всю строку: лента из карточек в узкой
            плитке рассыпалась бы по одной в ряд. */}
        <section className="bento-tile" data-span="12">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="section-heading mb-0">{dict.home.whatsNew}</h2>
            <span className="small text-secondary">
              {favoritePerformers > 0
                ? dict.home.newsFromFavourites
                : dict.home.newsFromCatalogue}
              {" · "}
              {/* Выход на витрину релизов /music — лента здесь только
                анонс, целиком новинки живут там. */}
              <Link href="/music" className="text-secondary">
                {dict.common.all}
              </Link>
            </span>
          </div>

          {/* Места съёмок — первыми строками ленты: их приносит прогон
            blscene, и это единственное место на витрине, где видно, что
            у сериала появились новые точки (просьба владельца
            2026-09-06). */}
          {locationNews.length > 0 && (
            <div className="row g-2 stagger mb-2">
              {locationNews.map((item) => (
                <div
                  key={`loc-${item.dramaId}`}
                  className="col-12 col-md-6 col-xl-4"
                >
                  <Link
                    href={dramaHref(item)}
                    className="surface surface-hover d-flex align-items-center gap-3 p-3 h-100 text-decoration-none"
                  >
                    <LetterAvatar
                      name={dramaTitleForLocale(item, locale)}
                      photoUrl={item.posterUrl}
                      size={4}
                      rounded={false}
                    />
                    <div style={{ minWidth: 0 }} className="flex-grow-1">
                      <span className="text-white d-block text-truncate">
                        {dramaTitleForLocale(item, locale)}
                      </span>
                      <span className="small text-secondary d-block">
                        {dict.home.newsLocations}
                      </span>
                      <span className="small text-secondary">
                        {dict.home.newsLocationsCount(item.count)}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}

          {news.length === 0 ? (
            <EmptyState
              emoji="🎧"
              title={dict.home.emptyNewsTitle}
              hint={dict.home.emptyNewsHint}
              cta={{ href: "/artists", label: dict.home.emptyNewsCta }}
              compact
            />
          ) : (
            <div className="row g-2 stagger">
              {news.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  className="col-12 col-md-6 col-xl-4"
                >
                  {/* Карточка релиза общая с витриной /music — см.
                    components/MusicReleaseCard. */}
                  <MusicReleaseCard item={item} t={dict} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

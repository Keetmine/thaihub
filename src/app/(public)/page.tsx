import Link from "@/components/AppLink";
import { unstable_cache } from "next/cache";
import { getT, type Dict } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/seo";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { getMusicNews, getLocationNews, type NewsItem } from "@/lib/whatsNew";
import { getFriendIds } from "@/lib/friends";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
import { tripHref, dramaHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { endOfDay, formatShortDate, startOfDay } from "@/lib/dates";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { userDisplayName } from "@/lib/userProfile";
import LetterAvatar from "@/components/LetterAvatar";
import PageHeader from "@/components/PageHeader";
import PosterTile from "@/components/PosterTile";
import EpisodeProgress from "@/components/EpisodeProgress";
import EmptyState from "@/components/EmptyState";
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
      where: { airDate: { gte: new Date(dayStartIso), lte: new Date(dayEndIso) } },
      select: {
        number: true,
        drama: {
          select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true, year: true },
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
      { id: string; name: string; slug: string | null; photoUrl: string | null; birthDate: Date }[]
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

/** «Сингл · 2025» под названием новинки: тип релиза (у отдельной песни —
 *  просто «песня») и год, если он известен. */
function newsSubtitle(item: NewsItem, t: Dict): string {
  const kind = item.albumType ? t.catalog.albumType[item.albumType] : t.catalog.songType;
  return [kind, item.year].filter(Boolean).join(" · ");
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
  ] = await Promise.all([
    // Новинки любимых артистов; если избранного ещё нет — общие.
    getMusicNews({ limit: 8, userId: user.id, onlyFavorites: true }).then(async (own) =>
      own.length > 0 ? own : getMusicNews({ limit: 8 }),
    ),
    premium
      ? prisma.eventAttendance.findMany({
          where: { userId: user.id, occurrence: { startsAt: { gte: now } } },
          select: {
            occurrence: { select: { startsAt: true } },
            event: {
              select: { id: true, slug: true, title: true, venue: true, posterUrl: true },
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
            OR: [
              { trip: { userId: user.id } },
              { createdById: user.id },
            ],
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
    getAiringTodayEpisodes(startOfDay(now).toISOString(), endOfDay(now).toISOString()),
    // «У сериала появились места съёмок» — вторая половина ленты «что
    // нового» (просьба владельца): музыка приезжает обходом YouTube
    // Music, локации — прогоном blscene.
    getLocationNews(4),
  ]);

  // Сдвоенный показ — две строки на один сериал: карточка всё равно
  // одна, с диапазоном серий.
  const airingTodayByDrama = new Map<
    string,
    { drama: (typeof airingTodayEpisodes)[number]["drama"]; from: number; to: number }
  >();
  for (const ep of airingTodayEpisodes) {
    const seen = airingTodayByDrama.get(ep.drama.id);
    if (seen) {
      seen.from = Math.min(seen.from, ep.number);
      seen.to = Math.max(seen.to, ep.number);
    } else {
      airingTodayByDrama.set(ep.drama.id, { drama: ep.drama, from: ep.number, to: ep.number });
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
    friendBirthdayRows,
    favoriteIds,
    airingTodayStatuses,
  ] = await Promise.all([
    getBirthdayPerformers(todayMonth, todayDay),
    friendIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: friendIds }, birthDate: { not: null } },
          select: { id: true, name: true, username: true, photoUrl: true, birthDate: true },
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
    onlyMineAiring ? airingTodayAll.filter((a) => airingTodayStatuses.has(a.drama.id)) : airingTodayAll
  ).slice(0, 6);

  const favoriteSet = new Set(favoriteIds.map((f) => f.performerId));
  const turns = (birthDate: Date) => now.getUTCFullYear() - birthDate.getUTCFullYear();
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
  const hasBirthdays = birthdayPerformers.length > 0 || birthdayFriends.length > 0;


  return (
    <div>
      <PageHeader
        eyebrow={dict.home.eyebrow}
        title={dict.home.greeting(userDisplayName(user, locale))}
        action={
          <>
            <Link href="/events" className="chip-link">
              {dict.nav.events}
            </Link>
            <Link href="/calendar" className="chip-link">
              {dict.nav.calendar}
            </Link>
            <Link href="/trips" className="chip-link">
              {dict.nav.trips}
            </Link>
          </>
        }
      />

      {/* «Что впереди» — план и поездки одной панелью: и то и другое
          отвечает на вопрос «что у меня скоро», а раздельными блоками
          в разных рядах это читалось как список одинаковых секций.
          Поездка сверху задаёт рамку периода, под ней — события. */}
      <div className="row g-4 mb-5">
      <div className={hasBirthdays ? "col-12 col-lg-8" : "col-12"}>
        <section className="glow-panel p-4 h-100">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="section-heading mb-0">{dict.home.upcoming}</h2>
            {premium && (
              <Link href="/events?filter=going" className="small text-secondary">
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
                    <span className="trip-dates-year">{t.endDate.getFullYear()}</span>
                  </span>
                  <span className="font-display fw-medium text-white flex-grow-1 text-truncate">
                    {t.title}
                  </span>
                  <span className="d-flex flex-wrap gap-2 flex-shrink-0">
                    {t.userId !== user.id && <span className="date-chip">{dict.home.shared}</span>}
                    <span className="date-chip">{countdown(t.startDate, dict)}</span>
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
                <p className="small text-secondary mb-0" style={{ maxWidth: "30rem" }}>
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
                <div key={card.key} className="col-4 col-md-3">
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

      {/* Дни рождения — тёплый акцентный блок рядом: он же держит
          асимметрию ряда. Показываем и артистов, и друзей. */}
      {hasBirthdays && (
        <div className="col-12 col-lg-4">
          <section className="surface p-4 h-100">
            <h2 className="section-heading mb-3">🎂 {dict.home.birthdays}</h2>
            <div className="d-flex flex-column gap-3">
              {birthdayFriends.map((f) => (
                <Link
                  key={f.id}
                  href={`/users/${f.username ?? f.id}`}
                  className="d-flex align-items-center gap-3 text-decoration-none"
                >
                  <LetterAvatar name={f.name} photoUrl={f.photoUrl} size={2.6} />
                  <span style={{ minWidth: 0 }}>
                    <span className="text-white d-block text-truncate">
                      {userDisplayName(f, locale)}
                    </span>
                    <span className="small text-secondary">
                      {f.birthDate ? `${turns(f.birthDate)} — ${dict.home.yourFriend}` : dict.home.yourFriend}
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
        </div>
      )}
      </div>

      {/* Ряд 2 (правка владельца 2026-09-06): слева «Выходит сегодня»
          и справа «Смотрю сейчас» — пополам, по col-6, оба одной высоты
          (align-items-stretch + h-100 у секций). «Что нового» уехало
          ПОД ряд, во всю ширину — раньше оно жило в правой колонке под
          афишей и растягивало её. */}
      <div className="row g-4 align-items-stretch">
      <div className={watchingNow.length > 0 ? "col-12 col-lg-6" : "col-12"}>
      {airingToday.length > 0 && (
        <section className="h-100 d-flex flex-column">
          {/* И9: из блока должен быть выход в календарь серий — раньше
              человек видел сегодняшнее и не догадывался, что есть
              расписание на месяц. Тот же вид, что «Все» у соседей. */}
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 className="section-heading mb-0">{dict.home.airingToday}</h2>
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
                    className={onlyMineAiring ? "text-secondary" : "text-white fw-medium"}
                  >
                    {dict.home.airingAll}
                  </Link>
                  <Link
                    href="/?airing=mine"
                    prefetch={false}
                    className={onlyMineAiring ? "text-white fw-medium" : "text-secondary"}
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
                        {dramaTitleForLocale(drama, locale).trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="flex-fill" style={{ minWidth: 0 }}>
                    <span className="font-display fw-medium text-white d-block text-truncate">
                      {dramaTitleForLocale(drama, locale)}
                    </span>
                    {subline && <span className="small text-secondary">{subline}</span>}
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
      )}
      </div>

      {watchingNow.length > 0 && (
        <div className="col-12 col-lg-6">
          <section className="h-100 d-flex flex-column">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="section-heading mb-0">{dict.home.watchingNow}</h2>
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
                            label: dict.catalog.episodes.of(episodesWatched, drama.episodes),
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
      </div>

      {/* Новинки — во всю ширину ПОД рядом (правка владельца
          2026-09-06): раньше лента жила в правой колонке и растягивала
          её сильно ниже соседа. mt-4 — тот же зазор, что между
          колонками ряда: без него заголовок ленты липнул к последней
          строке афиши. */}
      <section className="mt-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 className="section-heading mb-0">{dict.home.whatsNew}</h2>
          <span className="small text-secondary">
            {favoritePerformers > 0 ? dict.home.newsFromFavourites : dict.home.newsFromCatalogue}
          </span>
        </div>

        {/* Места съёмок — первыми строками ленты: их приносит прогон
            blscene, и это единственное место на витрине, где видно, что
            у сериала появились новые точки (просьба владельца
            2026-09-06). */}
        {locationNews.length > 0 && (
          <div className="row g-2 stagger mb-2">
            {locationNews.map((item) => (
              <div key={`loc-${item.dramaId}`} className="col-12 col-md-6 col-xl-4">
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
                    <span className="small text-secondary d-block">{dict.home.newsLocations}</span>
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
              <div key={`${item.kind}-${item.id}`} className="col-12 col-md-6 col-xl-4">
                <div className="surface surface-hover d-flex align-items-center gap-3 p-3 h-100">
                  <LetterAvatar
                    name={item.title}
                    photoUrl={item.coverUrl ?? item.performer.photoUrl}
                    size={4}
                    rounded={false}
                  />
                  <div style={{ minWidth: 0 }} className="flex-grow-1">
                    <span className="text-white d-block text-truncate">{item.title}</span>
                    <Link
                      href={performerHref(item.performer)}
                      className="small text-secondary text-decoration-none d-block text-truncate"
                    >
                      {item.performer.name}
                    </Link>
                    <span className="small text-secondary">{newsSubtitle(item, dict)}</span>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm flex-shrink-0"
                    >
                      {dict.home.listen}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

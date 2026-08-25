import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { getMusicNews } from "@/lib/whatsNew";
import { getFriendIds } from "@/lib/friends";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
import { tripHref, dramaHref } from "@/lib/slugHelpers";
import { formatShortDate } from "@/lib/dates";
import { userDisplayName } from "@/lib/userProfile";
import LetterAvatar from "@/components/LetterAvatar";
import PageHeader from "@/components/PageHeader";
import PosterTile from "@/components/PosterTile";
import EmptyState from "@/components/EmptyState";
import LandingPage from "./LandingPage";

export const dynamic = "force-dynamic";

// Главная для своих: сводка вместо сразу афиши. Сюда ведёт логотип, и
// это первое, что человек видит после входа — ближайшее из «иду»
// постерами, новинки любимых артистов, планы друзей. Афиша — на /events.
/** «через 3 дня» / «завтра» / «уже идёт» — обратный отсчёт до поездки:
 *  сухие даты сами по себе не отвечают на вопрос «а скоро ли». */
function countdown(start: Date): string {
  const days = Math.ceil((start.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "уже идёт";
  if (days === 1) return "завтра";
  if (days < 5) return `через ${days} дня`;
  if (days < 31) return `через ${days} дней`;
  const months = Math.round(days / 30);
  return months <= 1 ? "через месяц" : `через ${months} мес.`;
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return <LandingPage />;

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
        drama: {
          select: { id: true, slug: true, title: true, posterUrl: true, year: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
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
  ]);

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
  const [birthdayPerformersRaw, friendBirthdayRows, favoriteIds] = await Promise.all([
    prisma.$queryRaw<
      { id: string; name: string; slug: string | null; photoUrl: string | null; birthDate: Date }[]
    >`
      SELECT p.id, p.name, p.slug, p."photoUrl", p."birthDate"
      FROM "Performer" p
      WHERE p."birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM p."birthDate") = ${todayMonth}
        AND EXTRACT(DAY FROM p."birthDate") = ${todayDay}
      LIMIT 24
    `,
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
  ]);

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
        eyebrow="Главная"
        title={<>Привет, {userDisplayName(user)}</>}
        action={
          <>
            <Link href="/events" className="chip-link">
              Афиша
            </Link>
            <Link href="/calendar" className="chip-link">
              Календарь
            </Link>
            <Link href="/trips" className="chip-link">
              Поездки
            </Link>
          </>
        }
      />

      {/* Страница собрана асимметричными парами (8/4, затем 5/7): раньше
          это была стопка одинаковых блоков во всю ширину, и глазу не за
          что было зацепиться. */}
      <div className="row g-4 mb-5">
      <div className={hasBirthdays ? "col-12 col-lg-8" : "col-12"}>
      {/* Ближайшее из «иду» — постеры, а не строки: это то, чего человек
          ждёт, пусть выглядит как афиша на стене. */}
      <section>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 className="section-heading mb-0">Вы идёте</h2>
          {premium && (
            <Link href="/events?filter=going" className="small text-secondary">
              все →
            </Link>
          )}
        </div>
        {!premium ? (
          <div className="glow-panel p-4 d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <p className="font-display fw-medium text-white mb-1">
                Афиша и отметки «иду» — по подписке
              </p>
              <p className="small text-secondary mb-0" style={{ maxWidth: "30rem" }}>
                Полная афиша с датами и препродажами, календарь и напоминания в
                Telegram.
              </p>
            </div>
            <Link href="/events" className="btn btn-primary flex-shrink-0">
              Подробнее
            </Link>
          </div>
        ) : goingCards.length === 0 ? (
          <EmptyState
            emoji="🎫"
            title="Пока ничего не запланировано"
            hint="Найдите событие в афише и отметьте «Я пойду» — оно появится здесь постером."
            cta={{ href: "/events", label: "Посмотреть афишу" }}
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
                  chip={formatShortDate(card.startsAt)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      {/* Дни рождения — тёплый акцентный блок рядом с афишей: он же
          разбивает ряд по ширине. Показываем и артистов, и друзей. */}
      {hasBirthdays && (
        <div className="col-12 col-lg-4">
          <section className="glow-panel p-4 h-100">
            <h2 className="section-heading mb-3">🎂 Сегодня день рождения</h2>
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
                      {userDisplayName(f)}
                    </span>
                    <span className="small text-secondary">
                      {f.birthDate ? `${turns(f.birthDate)} — ваш друг` : "ваш друг"}
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
                      исполняется {turns(p.birthDate)}
                      {favoriteSet.has(p.id) ? " · в избранном" : ""}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
      </div>

      {/* Ряд 2 с обратным ритмом (5/7): «смотрю» узкой колонкой,
          поездки — широкой, чтобы даты читались крупно. */}
      <div className="row g-4 mb-5">

      {/* Предстоящие поездки — чтобы план был на виду (просьба
          владельца). Пустое состояние не рисуем: раздел и так в чипах
          сверху, а пейволл уже есть у «Вы идёте». */}
      {upcomingTrips.length > 0 && (
        <div className={watchingNow.length > 0 ? "col-12 col-lg-5" : "col-12"}>
        <section>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="section-heading mb-0">Ваши поездки</h2>
            <Link href="/trips" className="small text-secondary">
              все →
            </Link>
          </div>
          {/* Карточки-«билеты» те же, что на /trips: крупные даты вместо
              строки текста плюс обратный отсчёт — раньше блок читался
              как обычный список и терялся. */}
          <div className="d-flex flex-column gap-2 stagger">
            {upcomingTrips.map((t) => (
              <Link key={t.id} href={tripHref(t)} className="trip-card">
                <p className="trip-dates mb-1">
                  {formatShortDate(t.startDate)}{" "}
                  <span className="trip-dates-arrow">→</span>{" "}
                  {formatShortDate(t.endDate)}
                  <span className="trip-dates-year">{t.endDate.getFullYear()}</span>
                </p>
                <p className="font-display fw-medium text-white mb-2">{t.title}</p>
                <span className="d-flex flex-wrap gap-2">
                  <span className="date-chip">{countdown(t.startDate)}</span>
                  {t.userId !== user.id && <span className="date-chip">совместная</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
        </div>
      )}

      {/* Смотрю сейчас — постеры сериалов со статусом WATCHING; пустое
          состояние не рисуем, блок просто скрыт. */}
      {watchingNow.length > 0 && (
        <div className={upcomingTrips.length > 0 ? "col-12 col-lg-7" : "col-12"}>
        <section>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="section-heading mb-0">Смотрю сейчас</h2>
            <Link href="/dramas" className="small text-secondary">
              все →
            </Link>
          </div>
          <div className="row g-3 stagger">
            {watchingNow.map(({ drama }) => (
              <div key={drama.id} className="col-4 col-lg-3">
                <PosterTile
                  href={dramaHref(drama)}
                  posterUrl={drama.posterUrl}
                  title={drama.title}
                  subtitle={drama.year ? String(drama.year) : undefined}
                />
              </div>
            ))}
          </div>
        </section>
        </div>
      )}
      </div>

      {/* Новинки — то, ради чего сюда заходят между концертами. */}
      <section className="mb-5">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 className="section-heading mb-0">Что нового</h2>
          <span className="small text-secondary">
            {favoritePerformers > 0 ? "релизы ваших артистов" : "свежее в каталоге"}
          </span>
        </div>

        {news.length === 0 ? (
          <EmptyState
            emoji="🎧"
            title="Пока пусто"
            hint="Добавьте артистов в избранное — здесь появятся их новые релизы."
            cta={{ href: "/artists", label: "К артистам" }}
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
                    <span className="small text-secondary">
                      {[item.subtitle, item.year].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm flex-shrink-0"
                    >
                      Слушать ↗
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

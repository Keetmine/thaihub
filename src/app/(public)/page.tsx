import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { getMusicNews } from "@/lib/whatsNew";
import { getFriendIds } from "@/lib/friends";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
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
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return <LandingPage />;

  const premium = isPremiumActive(user);
  const now = new Date();

  const [news, myUpcoming, friendIds, favoritePerformers] = await Promise.all([
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
  ]);

  const friendsGoing =
    premium && friendIds.length > 0
      ? await prisma.eventAttendance.findMany({
          where: { userId: { in: friendIds }, occurrence: { startsAt: { gte: now } } },
          select: {
            user: { select: { id: true, name: true, username: true, photoUrl: true } },
            occurrence: { select: { startsAt: true } },
            event: { select: { id: true, slug: true, title: true } },
          },
          orderBy: { occurrence: { startsAt: "asc" } },
          take: 5,
        })
      : [];

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

      {/* Ближайшее из «иду» — постеры, а не строки: это то, чего человек
          ждёт, пусть выглядит как афиша на стене. */}
      <section className="mb-5">
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
        ) : myUpcoming.length === 0 ? (
          <EmptyState
            emoji="🎫"
            title="Пока ничего не запланировано"
            hint="Найдите событие в афише и отметьте «Я пойду» — оно появится здесь постером."
            cta={{ href: "/events", label: "Посмотреть афишу" }}
            compact
          />
        ) : (
          <div className="row g-3 stagger">
            {myUpcoming.map((a) => (
              <div
                key={`${a.event.id}-${+a.occurrence.startsAt}`}
                className="col-6 col-md-4 col-xl-3"
              >
                <PosterTile
                  href={eventHref(a.event)}
                  posterUrl={a.event.posterUrl}
                  title={a.event.title}
                  subtitle={a.event.venue}
                  chip={formatShortDate(a.occurrence.startsAt)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

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

      <section>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 className="section-heading mb-0">Друзья идут</h2>
          <Link href="/friends" className="small text-secondary">
            друзья →
          </Link>
        </div>
        {friendsGoing.length === 0 ? (
          <EmptyState
            emoji="👥"
            title={
              friendIds.length === 0
                ? "У вас пока нет друзей на MyBLHub"
                : "Друзья пока никуда не собираются"
            }
            hint={
              friendIds.length === 0
                ? "Найдите знакомых по нику — и увидите, на что идут они."
                : "Как только кто-то отметит «иду», это появится здесь."
            }
            cta={friendIds.length === 0 ? { href: "/friends", label: "Найти друзей" } : undefined}
            compact
          />
        ) : (
          <div className="row g-2 stagger">
            {friendsGoing.map((a) => (
              <div key={`${a.user.id}-${a.event.id}`} className="col-12 col-lg-6">
                <Link
                  href={eventHref(a.event)}
                  className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3 h-100"
                >
                  <LetterAvatar name={a.user.name} photoUrl={a.user.photoUrl} size={2} />
                  <span style={{ minWidth: 0 }} className="flex-grow-1">
                    <span className="text-white d-block text-truncate">{a.event.title}</span>
                    <span className="small text-secondary">
                      {userDisplayName(a.user)} · {formatShortDate(a.occurrence.startsAt)}
                    </span>
                  </span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

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
import LandingPage from "./LandingPage";

export const dynamic = "force-dynamic";

// Главная для своих: сводка вместо сразу афиши. Сюда ведёт логотип, и
// это первое, что человек видит после входа — новинки любимых артистов,
// ближайшее из «иду», планы друзей. Сама афиша живёт на /events.
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
            event: { select: { id: true, slug: true, title: true, venue: true } },
          },
          orderBy: { occurrence: { startsAt: "asc" } },
          take: 3,
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
      <span className="eyebrow">Главная</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Привет, {userDisplayName(user)}
      </h1>

      {/* Новинки — то, ради чего сюда заходят между концертами. */}
      <section className="mb-5">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 className="section-heading mb-0">Что нового</h2>
          <span className="small text-secondary">
            {favoritePerformers > 0 ? "релизы ваших артистов" : "свежее в каталоге"}
          </span>
        </div>

        {news.length === 0 ? (
          <p className="text-secondary">
            Пока пусто. Добавьте артистов в избранное — здесь появятся их новые
            релизы.
          </p>
        ) : (
          <div className="row g-2">
            {news.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="col-12 col-md-6 col-xl-4">
                <div className="surface surface-hover d-flex align-items-center gap-3 p-3 h-100">
                  <LetterAvatar
                    name={item.title}
                    photoUrl={item.coverUrl ?? item.performer.photoUrl}
                    size={3}
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

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 className="section-heading mb-0">Вы идёте</h2>
            <Link href="/events?filter=going" className="small text-secondary">
              все →
            </Link>
          </div>
          {!premium ? (
            <p className="small text-secondary">
              Афиша и отметки «иду» — по подписке.{" "}
              <Link href="/events" className="link-body-emphasis">
                Подробнее
              </Link>
            </p>
          ) : myUpcoming.length === 0 ? (
            <p className="small text-secondary">
              Ничего не запланировано.{" "}
              <Link href="/events" className="link-body-emphasis">
                Посмотреть афишу
              </Link>
            </p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {myUpcoming.map((a) => (
                <Link
                  key={`${a.event.id}-${+a.occurrence.startsAt}`}
                  href={eventHref(a.event)}
                  className="surface surface-hover text-decoration-none d-flex justify-content-between gap-3 p-3"
                >
                  <span className="text-white text-truncate">{a.event.title}</span>
                  <span className="small text-secondary flex-shrink-0">
                    {formatShortDate(a.occurrence.startsAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="col-12 col-lg-6">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 className="section-heading mb-0">Друзья идут</h2>
            <Link href="/friends" className="small text-secondary">
              друзья →
            </Link>
          </div>
          {friendsGoing.length === 0 ? (
            <p className="small text-secondary">
              {friendIds.length === 0
                ? "Добавьте друзей — увидите, на что идут они."
                : "Друзья пока никуда не собираются."}
            </p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {friendsGoing.map((a) => (
                <Link
                  key={`${a.user.id}-${a.event.id}`}
                  href={eventHref(a.event)}
                  className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
                >
                  <LetterAvatar name={a.user.name} photoUrl={a.user.photoUrl} size={2} />
                  <span style={{ minWidth: 0 }} className="flex-grow-1">
                    <span className="text-white d-block text-truncate">{a.event.title}</span>
                    <span className="small text-secondary">
                      {userDisplayName(a.user)} · {formatShortDate(a.occurrence.startsAt)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

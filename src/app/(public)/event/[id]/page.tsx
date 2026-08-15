import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTimeRangeWithMsk, formatTimeWithMsk } from "@/lib/dates";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";
import EntityMiniCard from "@/components/EntityMiniCard";
import { CalendarIcon, PinIcon, TvIcon, UsersIcon } from "@/components/icons";
import { performerHref } from "@/lib/performerSlug";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      performers: { include: { performer: true } },
      pairings: { include: { pairing: { include: { performerA: true, performerB: true } } } },
      drama: true,
      occurrences: { orderBy: { startsAt: "asc" } },
    },
  });

  if (!event) notFound();

  // --- own block: current user's favorite/attendance state for this event ---
  const currentUser = await getCurrentUser();
  let isEventFavorited = false;
  let isGoing = false;
  let friendsGoing: { id: string; name: string | null; photoUrl: string | null }[] = [];
  if (currentUser) {
    const [favorite, attendance, friendIds] = await Promise.all([
      prisma.favoriteEvent.findUnique({
        where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
      }),
      prisma.eventAttendance.findUnique({
        where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
      }),
      getFriendIds(currentUser.id),
    ]);
    isEventFavorited = !!favorite;
    isGoing = !!attendance;
    if (friendIds.length > 0) {
      const attendances = await prisma.eventAttendance.findMany({
        where: { eventId: event.id, userId: { in: friendIds } },
        select: { user: { select: { id: true, name: true, photoUrl: true } } },
      });
      friendsGoing = attendances.map((a) => a.user);
    }
  }
  // --- end own block ---

  return (
    <div>
      <Link href="/" className="eyebrow text-decoration-none">
        ← Все события
      </Link>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mt-3 mb-2">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {event.title}
        </h1>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton kind="event" id={event.id} isFavorited={isEventFavorited} variant="icon" />
          <GoingButton eventId={event.id} isGoing={isGoing} variant="icon" />
          <a
            href={`/event/${event.id}/ics`}
            className="round-icon-btn"
            aria-label="Добавить в календарь"
            data-tooltip="Добавить в календарь"
          >
            <CalendarIcon />
          </a>
        </div>
      </div>
      <div className="row g-4 mb-3">
        {event.posterUrl && (
          <div className="col-12 col-sm-4 col-md-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.posterUrl}
              alt={event.title}
              className="surface"
              style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover" }}
            />
          </div>
        )}
        <div className={event.posterUrl ? "col-12 col-sm-8 col-md-9" : "col-12"}>
          <div className="surface p-4 h-100">
            <p className="mb-2">
              <PinIcon className="icon-inline" /> <span className="text-secondary">Локация:</span>{" "}
              {event.venue}
            </p>
            {event.occurrences.map((occ) => (
              <p key={occ.id} className="mb-2">
                <CalendarIcon /> <span className="text-secondary">Дата и время:</span>{" "}
                <span className="text-capitalize">{formatHumanDate(occ.startsAt)}</span> ·{" "}
                {formatTimeRangeWithMsk(occ.startsAt, occ.endsAt)}
              </p>
            ))}
            {event.ticketPrice && (
              <p className="mb-0">
                <span className="text-secondary">Цена билетов:</span> {event.ticketPrice}
              </p>
            )}
            {(event.presaleAt || event.presaleUrl) && (
              <div className={event.drama ? "mt-3 mb-2" : "mt-3 mb-0"}>
                <p className="mb-2">
                  <span className="text-secondary">Препродажа билетов:</span>{" "}
                  {event.presaleAt ? (
                    <>
                      <span className="text-capitalize">{formatHumanDate(event.presaleAt)}</span>{" "}
                      · {formatTimeWithMsk(event.presaleAt)}
                    </>
                  ) : (
                    "уточняется"
                  )}
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {event.presaleUrl && (
                    <a
                      href={event.presaleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      Билеты
                    </a>
                  )}
                  {event.presaleAt && (
                    <a
                      href={`/event/${event.id}/ics?presale=1`}
                      className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
                    >
                      <CalendarIcon className="icon-inline" />
                      Добавить в календарь
                    </a>
                  )}
                </div>
              </div>
            )}
            {event.drama && (
              <p className="mb-0">
                <TvIcon className="icon-inline" /> <span className="text-secondary">Сериал:</span>{" "}
                <Link href={`/dramas/${event.drama.id}`} className="link-body-emphasis">
                  {event.drama.title}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {friendsGoing.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2
            className="small text-secondary text-uppercase mb-2 d-flex align-items-center gap-2"
            style={{ letterSpacing: "0.08em" }}
          >
            <UsersIcon /> {friendsGoing.length === 1 ? "Друг идёт" : "Друзья идут"}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {friendsGoing.map((f) => (
              <EntityMiniCard key={f.id} href="/friends" photoUrl={f.photoUrl} name={f.name || "Без имени"} />
            ))}
          </div>
        </div>
      )}

      {event.description && (
        <div className="surface p-4 mb-3">
          <h2
            className="small text-secondary text-uppercase mb-2"
            style={{ letterSpacing: "0.08em" }}
          >
            Описание
          </h2>
          <p className="mb-0">{event.description}</p>
        </div>
      )}

      {(event.performers.length > 0 || event.pairings.length > 0) && (
        <div className="surface p-4 mb-3">
          <h2
            className="small text-secondary text-uppercase mb-2"
            style={{ letterSpacing: "0.08em" }}
          >
            Кто выступает
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {event.performers.map(({ performer }) => (
              <EntityMiniCard
                key={performer.id}
                href={performerHref(performer)}
                photoUrl={performer.photoUrl}
                name={performer.name}
              />
            ))}
            {event.pairings.map(({ pairing }) => (
              <span key={pairing.id} className="event-chip">
                {pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCombinedDateList, formatHumanDate, formatTimeRangeWithMsk, formatTimeWithMsk } from "@/lib/dates";
import type { EventOccurrence } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import FavoriteButton from "@/components/FavoriteButton";
import EntityMiniCard from "@/components/EntityMiniCard";
import { CalendarIcon, PinIcon, TvIcon, UsersIcon } from "@/components/icons";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import PremiumUpsell from "@/components/PremiumUpsell";
import EventNoteSection, { type FriendNote } from "./EventNoteSection";
import GoingDateChips from "./GoingDateChips";
import { isPremiumActive } from "@/lib/premium";

export const dynamic = "force-dynamic";

/** Groups occurrences that share the same start/end time-of-day (e.g. a
 *  run of shows all at "18:00–20:00" on consecutive dates) so they render
 *  as one combined date line instead of one full date per occurrence —
 *  occurrences with a distinct time of their own stay in their own
 *  single-item group and keep the full weekday date format. */
function groupOccurrencesByTime(occurrences: EventOccurrence[]): EventOccurrence[][] {
  const groups = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const timeOfDay = (d: Date) => `${d.getHours()}:${d.getMinutes()}`;
    const key = `${timeOfDay(occ.startsAt)}-${occ.endsAt ? timeOfDay(occ.endsAt) : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(occ);
  }
  return Array.from(groups.values());
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const event = await prisma.event.findFirst({
    where: slugOrIdWhere(rawId),
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

  // События целиком за подпиской: без неё страница не раскрывает ничего,
  // кроме факта существования и дат (название/площадка/состав не
  // рендерятся вовсе — в HTML их нет).
  if (!isPremiumActive(currentUser)) {
    return (
      <div>
        <Link href="/" className="eyebrow text-decoration-none">
          ← Все события
        </Link>
        <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
          Событие
        </h1>
        <p className="text-secondary mb-4">
          {event.occurrences.map((o) => formatHumanDate(o.startsAt)).join(", ")}
        </p>
        <PremiumUpsell feature="Страницы событий" />
      </div>
    );
  }
  let isEventFavorited = false;
  let goingOccurrenceIds: string[] = [];
  let friendsGoing: { id: string; name: string | null; photoUrl: string | null }[] = [];
  let ownNote: { text: string; visibility: string } | null = null;
  let friendNotes: FriendNote[] = [];
  if (currentUser) {
    const [favorite, attendances, friendIds] = await Promise.all([
      prisma.favoriteEvent.findUnique({
        where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
      }),
      prisma.eventAttendance.findMany({
        where: { userId: currentUser.id, eventId: event.id },
        select: { occurrenceId: true },
      }),
      getFriendIds(currentUser.id),
    ]);
    isEventFavorited = !!favorite;
    goingOccurrenceIds = attendances.map((a) => a.occurrenceId);
    if (friendIds.length > 0) {
      const attendances = await prisma.eventAttendance.findMany({
        where: { eventId: event.id, userId: { in: friendIds } },
        select: { user: { select: { id: true, name: true, photoUrl: true } } },
      });
      // «Иду» per-дата — у идущего на все 3 дня будет 3 строки; в блоке
      // «Друзья идут» человек выводится один раз.
      friendsGoing = Array.from(new Map(attendances.map((a) => [a.user.id, a.user])).values());
    }

    // Заметки (Г6): своя + друзей с видимостью FRIENDS.
    const notes = await prisma.eventNote.findMany({
      where: {
        eventId: event.id,
        OR: [
          { userId: currentUser.id },
          ...(friendIds.length > 0
            ? [{ userId: { in: friendIds }, visibility: "FRIENDS" as const }]
            : []),
        ],
      },
      include: { user: { select: { name: true, photoUrl: true } } },
    });
    const own = notes.find((n) => n.userId === currentUser.id);
    ownNote = own ? { text: own.text, visibility: own.visibility } : null;
    friendNotes = notes
      .filter((n) => n.userId !== currentUser.id)
      .map((n) => ({ id: n.id, text: n.text, userName: n.user.name, userPhotoUrl: n.user.photoUrl }));
  }
  // --- end own block ---

  return (
    <div>
      <Link href="/" className="eyebrow text-decoration-none">
        ← Все события
      </Link>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mt-3 mb-3">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {event.title}
        </h1>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton kind="event" id={event.id} isFavorited={isEventFavorited} variant="icon" />
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
            {groupOccurrencesByTime(event.occurrences).map((group) => {
              const first = group[0];
              return (
                <p key={group.map((o) => o.id).join("-")} className="mb-2">
                  <CalendarIcon /> <span className="text-secondary">Дата и время:</span>{" "}
                  {group.length === 1 ? (
                    <span className="text-capitalize">{formatHumanDate(first.startsAt)}</span>
                  ) : (
                    formatCombinedDateList(group.map((o) => o.startsAt))
                  )}{" "}
                  · {formatTimeRangeWithMsk(first.startsAt, first.endsAt)}
                </p>
              );
            })}
            {currentUser && (
              <div className="mb-2">
                <GoingDateChips
                  occurrences={event.occurrences.map((o) => ({ id: o.id, startsAt: o.startsAt }))}
                  goingIds={goingOccurrenceIds}
                />
              </div>
            )}
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
                  {/* Напоминание о препродаже имеет смысл только до её
                      старта — для уже прошедшей кнопку не показываем. */}
                  {event.presaleAt && event.presaleAt > new Date() && (
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
            {(event.performers.length > 0 || event.pairings.length > 0) && (
              <div className={event.drama ? "mt-3 mb-3" : "mt-3 mb-0"}>
                <p className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
                  Кто выступает
                </p>
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
            {event.drama && (
              <p className="mb-0">
                <TvIcon className="icon-inline" /> <span className="text-secondary">Сериал:</span>{" "}
                <Link href={dramaHref(event.drama)} className="link-body-emphasis">
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

      <EventNoteSection eventId={event.id} ownNote={ownNote} friendNotes={friendNotes} />

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

    </div>
  );
}

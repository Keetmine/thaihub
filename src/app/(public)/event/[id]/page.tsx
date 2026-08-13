import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatHumanDate, formatTime } from "@/lib/dates";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";
import { CalendarIcon, PinIcon } from "@/components/icons";

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
    },
  });

  if (!event) notFound();

  // --- own block: current user's favorite/attendance state for this event ---
  const currentUser = await getCurrentUser();
  let isEventFavorited = false;
  let isGoing = false;
  if (currentUser) {
    const [favorite, attendance] = await Promise.all([
      prisma.favoriteEvent.findUnique({
        where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
      }),
      prisma.eventAttendance.findUnique({
        where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
      }),
    ]);
    isEventFavorited = !!favorite;
    isGoing = !!attendance;
  }
  // --- end own block ---

  return (
    <div>
      <Link href="/" className="eyebrow text-decoration-none">
        ← Все события
      </Link>
      <div className="position-relative">
        {/* --- own block: corner favorite heart (Booking.com-style) --- */}
        <FavoriteButton
          kind="event"
          id={event.id}
          isFavorited={isEventFavorited}
          variant="corner"
        />
        {/* --- end own block --- */}
        <h1 className="display-1-tight mt-3 mb-2 pe-5" style={{ fontSize: "2.25rem" }}>
          {event.title}
        </h1>
      </div>
      <p className="text-secondary mb-4 text-capitalize">
        {formatHumanDate(event.startsAt)} · {formatTime(event.startsAt)}
        {event.endsAt ? `–${formatTime(event.endsAt)}` : ""}
      </p>

      <div className="surface p-4 mb-3">
        <p className="mb-3">
          <PinIcon /> {event.venue}
        </p>

        {event.performers.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {event.performers.map(({ performer }) => (
              <Link
                key={performer.id}
                href={`/performers/${performer.id}`}
                className="event-chip text-decoration-none"
              >
                {performer.name}
              </Link>
            ))}
          </div>
        )}

        {/* Pairings — added alongside the performer chips above */}
        {event.pairings.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {event.pairings.map(({ pairing }) => (
              <span key={pairing.id} className="event-chip">
                {pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`}
              </span>
            ))}
          </div>
        )}

        {event.description && (
          <p className="text-secondary mb-0">{event.description}</p>
        )}
      </div>

      <div className="surface p-4">
        {(event.presaleAt || event.presaleUrl) && (
          <>
            <h2
              className="small text-secondary text-uppercase mb-2"
              style={{ letterSpacing: "0.08em" }}
            >
              Препродажа билетов
            </h2>
            {event.presaleAt && (
              <p className="mb-3 text-capitalize">
                {formatHumanDate(event.presaleAt)} · {formatTime(event.presaleAt)}
              </p>
            )}
          </>
        )}

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
          <a href={`/event/${event.id}/ics`} className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2">
            <CalendarIcon />
            Добавить в календарь
          </a>
          {/* --- own block: going toggle (favorite heart moved to the corner above) --- */}
          <GoingButton eventId={event.id} isGoing={isGoing} />
          {/* --- end own block --- */}
        </div>
      </div>
    </div>
  );
}

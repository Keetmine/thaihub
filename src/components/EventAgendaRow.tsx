import Link from "next/link";
import { formatTime } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { PinIcon, UserIcon, UsersIcon } from "@/components/icons";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";

export default function EventAgendaRow({
  event,
  isFavorited = false,
  isGoing = false,
  friendsGoing = [],
}: {
  event: EventWithPerformers;
  isFavorited?: boolean;
  isGoing?: boolean;
  friendsGoing?: { id: string; name: string | null; photoUrl: string | null }[];
}) {
  return (
    <div className="agenda-row">
      <div className="corner-actions corner-actions-row">
        <FavoriteButton kind="event" id={event.id} isFavorited={isFavorited} variant="icon" />
        <GoingButton eventId={event.id} isGoing={isGoing} variant="icon" />
      </div>
      <div className="agenda-time">
        <span className="agenda-time-start">{formatTime(event.startsAt)}</span>
        {event.endsAt && (
          <span className="agenda-time-end">–{formatTime(event.endsAt)}</span>
        )}
      </div>
      <span className="agenda-dash">—</span>
      <div className="agenda-body">
        <h3 className="h6 font-display mb-1">
          <Link href={`/event/${event.id}`} className="text-reset text-decoration-none">
            {event.title}
          </Link>
        </h3>
        <p className="small text-secondary mb-0 d-flex flex-wrap align-items-center gap-2">
          {event.performers.length > 0 && (
            <span className="d-inline-flex align-items-center gap-1">
              <UserIcon />
              {event.performers.map(({ performer }, i) => (
                <span key={performer.id}>
                  {i > 0 && ", "}
                  <Link href={`/performers/${performer.id}`} className="agenda-performer-link">
                    {performer.name}
                  </Link>
                </span>
              ))}
            </span>
          )}
          <span className="d-inline-flex align-items-center gap-1">
            <PinIcon /> {event.venue}
          </span>
          {friendsGoing.length > 0 && (
            <span
              className="d-inline-flex align-items-center gap-1"
              title={friendsGoing.map((f) => f.name || "Друг").join(", ")}
            >
              <UsersIcon />
              {friendsGoing.length === 1
                ? `${friendsGoing[0].name || "Друг"} идёт`
                : `${friendsGoing.length} друзей идут`}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

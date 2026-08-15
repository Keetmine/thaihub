import Link from "next/link";
import { formatShortDate, formatTime } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { performerHref } from "@/lib/performerSlug";
import { PinIcon, UserIcon, UsersIcon } from "@/components/icons";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";
import MskTimeInfo from "@/components/MskTimeInfo";

export default function EventAgendaRow({
  event,
  isFavorited = false,
  isGoing = false,
  friendsGoing = [],
  showDate = false,
}: {
  event: EventWithPerformers;
  isFavorited?: boolean;
  isGoing?: boolean;
  friendsGoing?: { id: string; name: string | null; photoUrl: string | null }[];
  // Set on flat (non day-grouped) lists — home/day pages already show the
  // date as a section heading above a batch of rows, so only pages that
  // list events without that heading (performer/drama/location/search)
  // need the row itself to carry the date.
  showDate?: boolean;
}) {
  return (
    <div className="agenda-row">
      <div className="corner-actions corner-actions-row">
        <FavoriteButton kind="event" id={event.id} isFavorited={isFavorited} variant="icon" />
        <GoingButton eventId={event.id} isGoing={isGoing} variant="icon" />
      </div>
      <div className="agenda-time">
        {showDate && (
          <span className="agenda-date">{formatShortDate(event.startsAt)}</span>
        )}
        <span className="agenda-time-start">{formatTime(event.startsAt)}</span>
        {event.endsAt && (
          <span className="agenda-time-end">–{formatTime(event.endsAt)}</span>
        )}
        <MskTimeInfo
          startsAt={event.startsAt}
          endsAt={event.endsAt}
          className="agenda-time-info-stacked"
        />
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
                  <Link href={performerHref(performer)} className="agenda-performer-link">
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

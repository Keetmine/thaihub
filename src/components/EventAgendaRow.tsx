import Link from "next/link";
import { formatTime } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";

export default function EventAgendaRow({ event }: { event: EventWithPerformers }) {
  return (
    <div className="agenda-row">
      <div className="agenda-time">
        <span className="agenda-time-start">{formatTime(event.startsAt)}</span>
        {event.endsAt && (
          <span className="agenda-time-end">–{formatTime(event.endsAt)}</span>
        )}
      </div>
      <span className="agenda-dash">—</span>
      <div className="agenda-body">
        <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2">
          <h3 className="h6 font-display mb-1">
            <Link href={`/event/${event.id}`} className="text-reset text-decoration-none">
              {event.title}
            </Link>
          </h3>
          {event.performers.length > 0 && (
            <p className="small text-secondary mb-1 flex-shrink-0">
              {event.performers.map(({ performer }, i) => (
                <span key={performer.id}>
                  {i > 0 && ", "}
                  <Link href={`/performers/${performer.id}`} className="agenda-performer-link">
                    {performer.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
        <p className="small text-secondary mb-0">
          <span aria-hidden="true">🍭</span> {event.venue}
        </p>
        {event.description && (
          <p className="small mt-2 mb-0 text-secondary">{event.description}</p>
        )}
      </div>
    </div>
  );
}

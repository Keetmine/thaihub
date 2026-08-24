import Link from "next/link";
import { formatTime } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { eventHref } from "@/lib/eventSlug";
import { PinIcon, UsersIcon } from "@/components/icons";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";
import MskTimeInfo from "@/components/MskTimeInfo";
import EventRowCast from "@/components/EventRowCast";

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Card row for event listings (home, trips, day view): a date block,
 *  the event's poster when it has one, and the details — replaces the
 *  old text-only agenda row, which read as a wall of repeating lines
 *  once a day had more than a couple of events. */
export default function EventCard({
  ticketUrl,
  event,
  isFavorited = false,
  isGoing = false,
  friendsGoing = [],
}: {
  /** Прикреплённый билет текущего юзера (показывается 🎫-кнопкой). */
  ticketUrl?: string | null;
  event: EventWithPerformers;
  isFavorited?: boolean;
  isGoing?: boolean;
  friendsGoing?: { id: string; name: string | null; photoUrl: string | null }[];
}) {
  const d = event.startsAt;
  const monthShort = d
    .toLocaleDateString("ru-RU", { month: "short" })
    .replace(/\.$/, "");

  return (
    <div className="event-card">
      <div className="corner-actions corner-actions-row">
        <FavoriteButton kind="event" id={event.id} isFavorited={isFavorited} variant="icon" />
        <GoingButton occurrenceId={event.occurrenceId} isGoing={isGoing} isPast={event.startsAt < new Date()} variant="icon" />
      </div>

      <div className="event-card-date">
        <span className="event-card-day">{d.getDate()}</span>
        <span className="event-card-month">{monthShort}</span>
        <span className="event-card-weekday">{WEEKDAYS_SHORT[d.getDay()]}</span>
      </div>

      <Link href={eventHref(event)} className="event-card-poster flex-shrink-0">
        {event.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.posterUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          /* Без постера — та же геометрия с первой буквой: карточки не
             прыгают по выравниванию. */
          <span className="event-card-poster-fallback" aria-hidden>
            {event.title.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </Link>

      <div className="event-card-body">
        {/* Иерархия строки: белое название сверху, ниже серой строкой
            время и площадка, ещё тише — состав. Время стоит рядом с
            адресом (просьба владельца): в шапке чип перетягивал
            внимание с названия. */}
        <div className="event-row-head">
          <h3 className="h5 font-display mb-0">
            <Link href={eventHref(event)} className="text-reset text-decoration-none">
              {event.title}
            </Link>
          </h3>
        </div>
        {/* Площадка — обычный span, не flex-строка: в flex длинное
            название площадки сжималось в столбик по одному слову на
            узких экранах. */}
        <p className="event-row-venue mb-0">
          {event.hasTime !== false && (
            <span className="date-chip event-row-time">
              {formatTime(event.startsAt)}
              {event.endsAt && <>–{formatTime(event.endsAt)}</>}
              <MskTimeInfo startsAt={event.startsAt} endsAt={event.endsAt} />
            </span>
          )}
          <span>
            <PinIcon /> {event.venue}
          </span>
          {ticketUrl && (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="d-inline-flex align-items-center gap-1 text-decoration-none"
              style={{ color: "var(--bs-primary-text-emphasis)" }}
            >
              🎫 Мой билет
            </a>
          )}
          {friendsGoing.length > 0 && (
            <span
              className="d-inline-flex align-items-center gap-1"
              title={friendsGoing.map((f) => f.name || "Друг").join(", ")}
            >
              <UsersIcon className="icon-inline" />
              {friendsGoing.length === 1
                ? `${friendsGoing[0].name || "Друг"} идёт`
                : `${friendsGoing.length} друзей идут`}
            </span>
          )}
        </p>
        <EventRowCast performers={event.performers} />
      </div>
    </div>
  );
}

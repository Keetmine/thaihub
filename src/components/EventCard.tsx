import Link from "next/link";
import { formatTime } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { performerHref } from "@/lib/performerSlug";
import { eventHref } from "@/lib/eventSlug";
import { PinIcon, UserIcon, UsersIcon } from "@/components/icons";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";
import MskTimeInfo from "@/components/MskTimeInfo";

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

      {event.posterUrl && (
        <Link href={eventHref(event)} className="event-card-poster flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.posterUrl} alt="" loading="lazy" />
        </Link>
      )}

      <div className="event-card-body">
        <h3 className="h5 font-display mb-1">
          <Link href={eventHref(event)} className="text-reset text-decoration-none">
            {event.title}
          </Link>
        </h3>
        {/* Время — неразрывный блок, локация — обычный span: в flex без
            wrap длинное название площадки сжималось в столбик по одному
            слову на узких экранах. */}
        <p className="small text-secondary mb-1 d-flex flex-wrap align-items-center column-gap-2 row-gap-0">
          {event.hasTime !== false && (
            <span className="d-inline-flex align-items-center gap-1 text-nowrap">
              {formatTime(event.startsAt)}
              {event.endsAt && <>–{formatTime(event.endsAt)}</>}
              <MskTimeInfo startsAt={event.startsAt} endsAt={event.endsAt} />
            </span>
          )}
          <span>
            <PinIcon /> {event.venue}
          </span>
        </p>
        {(event.performers.length > 0 || friendsGoing.length > 0) && (
          <p className="small text-secondary mb-0 d-flex flex-wrap align-items-center gap-2">
            {/* Инлайн-текст, не flex: иначе gap контейнера отрывал
                запятые от имён («William , Lego»). */}
            {event.performers.length > 0 && (
              <span>
                <UserIcon className="icon-inline" />{" "}
                {/* Фестивальный состав в 20+ имён ломал вёрстку — режем
                    до первых и показываем «и ещё N» (все — на странице
                    события). */}
                {event.performers.slice(0, 6).map(({ performer }, i) => (
                  <span key={performer.id}>
                    {i > 0 && ", "}
                    <Link href={performerHref(performer)} className="agenda-performer-link">
                      {performer.name}
                    </Link>
                  </span>
                ))}
                {event.performers.length > 6 && (
                  <span className="text-secondary"> и ещё {event.performers.length - 6}…</span>
                )}
              </span>
            )}
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
        )}
      </div>
    </div>
  );
}

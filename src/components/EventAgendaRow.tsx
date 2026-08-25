"use client";

import AppLink from "@/components/AppLink";
import { formatShortDate } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { eventHref } from "@/lib/eventSlug";
import { PinIcon, UsersIcon } from "@/components/icons";
import FavoriteButton from "@/components/FavoriteButton";
import LetterAvatar from "@/components/LetterAvatar";
import GoingButton from "@/components/GoingButton";
import EventRowCast from "@/components/EventRowCast";
import { TzTimeText } from "@/components/MskTimeInfo";
import { useLocale, useT } from "@/components/LocaleProvider";

export default function EventAgendaRow({
  event,
  isFavorited = false,
  isGoing = false,
  friendsGoing = [],
  showDate = false,
  extraDates = 0,
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
  /** Сколько ещё дат у события помимо показанной («+2 даты») — для
   *  списков, где событие выводится одной строкой (избранное). */
  extraDates?: number;
}) {
  const t = useT();
  const locale = useLocale();
  const hasTime = event.hasTime !== false;

  return (
    <div className="agenda-row">
      <div className="corner-actions corner-actions-row">
        <span data-tour="favorite">
          <FavoriteButton kind="event" id={event.id} isFavorited={isFavorited} variant="icon" />
        </span>
        <GoingButton occurrenceId={event.occurrenceId} isGoing={isGoing} isPast={event.startsAt < new Date()} variant="icon" />
      </div>
      <AppLink href={eventHref(event)} className="flex-shrink-0 d-none d-sm-block" tabIndex={-1}>
        <LetterAvatar name={event.title} photoUrl={event.posterUrl} size={3.25} rounded={false} />
      </AppLink>
      <div className="agenda-body">
        {/* Иерархия строки: белое название + чип даты/времени рядом с
            ним, ниже серая площадка, ещё тише — состав. Отдельной узкой
            колонки времени слева больше нет: она держала время такой же
            заметной, как название, и резала ширину под текст. */}
        <div className="event-row-head">
          <h3 className="h6 font-display mb-0">
            <AppLink href={eventHref(event)} className="text-reset text-decoration-none">
              {event.title}
            </AppLink>
          </h3>
          {(showDate || hasTime) && (
            <span className="date-chip event-row-time">
              {showDate && formatShortDate(event.startsAt, locale)}
              {hasTime && (
                <TzTimeText startsAt={event.startsAt} endsAt={event.endsAt} />
              )}
            </span>
          )}
          {extraDates > 0 && (
            <span className="date-chip event-row-time event-row-time-quiet">
              {t.events.card.extraDates(extraDates)}
            </span>
          )}
        </div>
        <p className="event-row-venue mb-0">
          <span>
            <PinIcon /> {event.venue}
          </span>
          {friendsGoing.length > 0 && (
            <span
              className="d-inline-flex align-items-center gap-1"
              title={friendsGoing.map((f) => f.name || t.events.card.friend).join(", ")}
            >
              <UsersIcon className="icon-inline" />
              {friendsGoing.length === 1
                ? t.events.card.oneFriendGoing(friendsGoing[0].name || t.events.card.friend)
                : t.events.card.manyFriendsGoing(friendsGoing.length)}
            </span>
          )}
        </p>
        <EventRowCast performers={event.performers} />
      </div>
    </div>
  );
}

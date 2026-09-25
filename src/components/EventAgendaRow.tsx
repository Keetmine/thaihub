"use client";

import AppLink from "@/components/AppLink";
import { formatShortDate } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { eventHref } from "@/lib/eventSlug";
import { PinIcon, UsersIcon } from "@/components/icons";
import LetterAvatar from "@/components/LetterAvatar";
import GoingButton from "@/components/GoingButton";
import MaybeButton from "@/components/MaybeButton";
import EventRowCast from "@/components/EventRowCast";
import { TzTimeText } from "@/components/MskTimeInfo";
import { useLocale, useT } from "@/components/LocaleProvider";

export default function EventAgendaRow({
  event,
  isGoing = false,
  isMaybe = false,
  friendsGoing = [],
  showDate = false,
  extraDates = 0,
}: {
  event: EventWithPerformers;
  isGoing?: boolean;
  /** «Возможно пойду» на эту дату: кандидат, а не план. Карточка
   *  приглушается и получает плашку — см. MaybeButton. */
  isMaybe?: boolean;
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
    // Кандидат («возможно пойду») приглушается: в плане поездки он
    // стоит рядом с твёрдыми планами, и по виду должно быть сразу
    // понятно, что это ещё вариант (правка владельца 2026-09-15).
    <div className={`agenda-row ${isMaybe && !isGoing ? "is-maybe-row" : ""}`}>
      <div className="corner-actions corner-actions-row">
        {/* «Возможно» — только у будущих дат: у прошедшей отмечать
            кандидата бессмысленно, там уже либо ходили, либо нет.
            data-tour: шаг тура показывает отметки карточки — раньше он
            стоял на сердечке избранного, которого больше нет. */}
        {event.startsAt >= new Date() && (
          <span data-tour="favorite">
            <MaybeButton occurrenceId={event.occurrenceId} isMaybe={isMaybe} />
          </span>
        )}
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
                <TzTimeText startsAt={event.startsAt} endsAt={event.endsAt} timezone={event.timezone} />
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
                ? (event.startsAt < new Date()
                    ? t.events.card.oneFriendWent
                    : t.events.card.oneFriendGoing)(friendsGoing[0].name || t.events.card.friend)
                : (event.startsAt < new Date()
                    ? t.events.card.manyFriendsWent
                    : t.events.card.manyFriendsGoing)(friendsGoing.length)}
            </span>
          )}
        </p>
        <EventRowCast performers={event.performers} />
      </div>
    </div>
  );
}

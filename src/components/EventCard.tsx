"use client";

import { useCallback, useState } from "react";
import AppLink from "@/components/AppLink";
import { formatTime, shortMonthName, shortWeekdayName } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { eventHref } from "@/lib/eventSlug";
import { PinIcon, UsersIcon } from "@/components/icons";
import FavoriteButton from "@/components/FavoriteButton";
import GoingButton from "@/components/GoingButton";
import MskTimeInfo from "@/components/MskTimeInfo";
import EventRowCast from "@/components/EventRowCast";
import { useLocale, useT } from "@/components/LocaleProvider";

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
  hideDate = false,
}: {
  /** Прикреплённый билет текущего юзера (показывается 🎫-кнопкой). */
  ticketUrl?: string | null;
  event: EventWithPerformers;
  isFavorited?: boolean;
  isGoing?: boolean;
  friendsGoing?: { id: string; name: string | null; photoUrl: string | null }[];
  /** Второе и следующие события одного дня: число уже стоит строкой
   *  выше, повторять его незачем. Место при этом сохраняется — иначе
   *  постеры соседних строк разъехались бы по горизонтали. */
  hideDate?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const d = event.startsAt;
  // Постер бывает битым: файл переехал, источник его удалил. Буквенный
  // фолбэк раньше срабатывал, только когда постера не было вовсе, — и
  // на месте пропавшего оставалась пустая рамка.
  //
  // Одного onError мало: разметка приходит с сервера, браузер начинает
  // грузить картинку сразу, и ошибка успевает случиться ДО гидратации —
  // React к тому моменту обработчик ещё не повесил и события не видит.
  // Поэтому при монтировании ещё и спрашиваем саму картинку: загрузка
  // завершилась (complete), а ширины нет (naturalWidth === 0) — значит
  // не вышло.
  const [posterFailed, setPosterFailed] = useState(false);
  const checkPoster = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setPosterFailed(true);
  }, []);

  return (
    <div className="event-card">
      <div className="corner-actions corner-actions-row">
        <FavoriteButton kind="event" id={event.id} isFavorited={isFavorited} variant="icon" />
        <GoingButton occurrenceId={event.occurrenceId} isGoing={isGoing} isPast={event.startsAt < new Date()} variant="icon" />
      </div>

      <div className="event-card-date">
        {!hideDate && (
          <>
            <span className="event-card-day">{d.getDate()}</span>
            <span className="event-card-month">{shortMonthName(d, locale)}</span>
            <span className="event-card-weekday">{shortWeekdayName(d, locale)}</span>
          </>
        )}
      </div>

      <AppLink href={eventHref(event)} className="event-card-poster flex-shrink-0">
        {event.posterUrl && !posterFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={checkPoster}
            src={event.posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          /* Без постера — та же геометрия с первой буквой: карточки не
             прыгают по выравниванию. */
          <span className="event-card-poster-fallback" aria-hidden>
            {event.title.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </AppLink>

      <div className="event-card-body">
        {/* Иерархия строки: белое название сверху, ниже серой строкой
            время и площадка, ещё тише — состав. Время стоит рядом с
            адресом (просьба владельца): в шапке чип перетягивал
            внимание с названия. */}
        <div className="event-row-head">
          <h3 className="h5 font-display mb-0">
            <AppLink href={eventHref(event)} className="text-reset text-decoration-none">
              {event.title}
            </AppLink>
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
              🎫 {t.events.card.myTicket}
            </a>
          )}
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

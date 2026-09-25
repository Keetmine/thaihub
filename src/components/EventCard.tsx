"use client";

import { useCallback, useState } from "react";
import AppLink from "@/components/AppLink";
import { uploadSrcSet } from "@/lib/imageVariants";
import { formatTime, shortMonthName, shortWeekdayName } from "@/lib/dates";
import type { EventWithPerformers } from "@/lib/types";
import { eventHref } from "@/lib/eventSlug";
import { communityHref } from "@/lib/slugHelpers";
import { PinIcon, UsersIcon } from "@/components/icons";
import GoingButton from "@/components/GoingButton";
import MaybeButton from "@/components/MaybeButton";
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
  isGoing = false,
  isMaybe = false,
  clashCount = 0,
  friendsGoing = [],
  actions,
  meta,
}: {
  /** Прикреплённый билет текущего юзера (показывается 🎫-кнопкой). */
  ticketUrl?: string | null;
  event: EventWithPerformers;
  isGoing?: boolean;
  /** «Возможно пойду» на эту дату: кандидат, а не план. Карточка
   *  приглушается и получает плашку — см. MaybeButton. */
  isMaybe?: boolean;
  friendsGoing?: { id: string; name: string | null; photoUrl: string | null }[];
  /** Сколько других дел стоит в это же время — подсказка у кандидата:
   *  ради неё кандидаты и выводятся в плане (правка владельца
   *  2026-09-15: «в один день и одно время два эвента, пойду на один»). */
  clashCount?: number;
  /** Дополнительные действия в углу карточки, СЛЕВА от «возможно»/«иду»
   *  — правка встречи сообщества (правка владельца 2026-09-09). Слотом,
   *  а не флагом: карточка одна на всю афишу и знать про сообщества ей
   *  незачем. */
  actions?: React.ReactNode;
  /** Тихая строка в теле карточки под площадкой — «Позвал(а) X · идут:
   *  N» у встречи сообщества. Раньше она стояла ПОД карточкой отдельным
   *  рядом, и это читалось как чужой текст рядом с карточкой. */
  meta?: React.ReactNode;
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
    <div className={`event-card ${isMaybe && !isGoing ? "is-maybe-row" : ""}`}>
      <div className="corner-actions corner-actions-row">
        {actions}
        {/* «Возможно» — только у будущих дат: у прошедшей отмечать
            кандидата бессмысленно, там уже либо ходили, либо нет. */}
        {event.startsAt >= new Date() && (
          <MaybeButton occurrenceId={event.occurrenceId} isMaybe={isMaybe} />
        )}
        <GoingButton occurrenceId={event.occurrenceId} isGoing={isGoing} isPast={event.startsAt < new Date()} variant="icon" />
      </div>

      <div className="event-card-date">
        <span className="event-card-day">{d.getDate()}</span>
        <span className="event-card-month">{shortMonthName(d, locale)}</span>
        <span className="event-card-weekday">{shortWeekdayName(d, locale)}</span>
      </div>

      {/* tabIndex={-1}, как у постера в EventAgendaRow: ссылка дублирует
          переход по названию, а alt="" оставляет её без имени — фокус на
          «пустой» ссылке только путал бы скринридер. */}
      <AppLink href={eventHref(event)} className="event-card-poster flex-shrink-0" tabIndex={-1}>
        {event.posterUrl && !posterFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={checkPoster}
            src={event.posterUrl}
            srcSet={uploadSrcSet(event.posterUrl)}
            sizes="4rem"
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
          {/* Кандидат: плашка «возможно» и, если в это же время стоит
              что-то ещё, — прямая подсказка про накладку. Пунктирная
              рамка вместо заливки: это ещё не решение. */}
          {isMaybe && !isGoing && (
            <span className="maybe-badge">
              {t.widgets.maybe.badge}
              {clashCount > 0 && (
                <span className="maybe-clash"> · {t.widgets.maybe.clash(clashCount)}</span>
              )}
            </span>
          )}
          {/* Встреча сообщества: карточка остаётся обычной карточкой
              события (просьба владельца — «одинакового вида»), но рядом
              с названием стоит тихий чип с названием сообщества. В
              афише на вкладке «Сообщества» без него было не понять,
              ЧЬЯ это встреча (жалоба владельца 2026-09-08). Чип, а не
              строка ниже: серую строку под названием он бы догрузил
              четвёртым элементом и потерялся между площадкой и
              составом. */}
          {event.community && (
            <AppLink
              href={communityHref(event.community)}
              className="date-chip event-row-community tooltip-wide"
              // Чип несёт только название; «встреча сообщества» —
              // в подсказке и в подписи для скринридера. tooltip-wide:
              // фраза с названием в одну строку не влезает и обрезалась
              // бы многоточием.
              data-tooltip={t.events.card.communityMeetup(event.community.title)}
              aria-label={t.events.card.communityMeetup(event.community.title)}
            >
              <UsersIcon className="icon-inline" />
              <span className="event-row-community-name">{event.community.title}</span>
            </AppLink>
          )}
        </div>
        {/* Площадка — обычный span, не flex-строка: в flex длинное
            название площадки сжималось в столбик по одному слову на
            узких экранах. */}
        <p className="event-row-venue mb-0">
          {event.hasTime !== false && (
            <span className="date-chip event-row-time">
              {formatTime(event.startsAt)}
              {event.endsAt && <>–{formatTime(event.endsAt)}</>}
              <MskTimeInfo startsAt={event.startsAt} endsAt={event.endsAt} timezone={event.timezone} />
            </span>
          )}
          {/* Онлайн-встреча: на месте площадки — бейдж «Онлайн» (venue у
              неё хранится пустым, см. eventActions сообществ). Чип тот
              же, что у времени: это такой же факт строки, а пин с пустым
              текстом выглядел бы как недогруженные данные. */}
          {event.isOnline ? (
            <span className="date-chip">{t.events.card.online}</span>
          ) : (
            <span>
              <PinIcon /> {event.venue}
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
              🎫 {t.events.card.myTicket}
            </a>
          )}
          {friendsGoing.length > 0 && (
            <span
              // Своя подсказка вместо браузерного title (АА5): на сайте
              // все подсказки одного вида. tooltip-wide — список имён в
              // одну строку не влезает.
              className="d-inline-flex align-items-center gap-1 tooltip-wide"
              data-tooltip={friendsGoing.map((f) => f.name || t.events.card.friend).join(", ")}
              // tabIndex как у подсказки MskTimeInfo: имена друзей живут
              // только в data-tooltip, и без фокуса с клавиатуры их было
              // не открыть вовсе.
              tabIndex={0}
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
        {meta && <div className="small text-secondary d-flex flex-wrap gap-3">{meta}</div>}
      </div>
    </div>
  );
}

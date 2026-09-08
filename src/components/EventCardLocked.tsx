"use client";

import { shortMonthName, shortWeekdayName } from "@/lib/dates";
import { useLocale, useT } from "@/components/LocaleProvider";

/**
 * Карточка события для пользователей без подписки: настоящая только
 * дата — вместо названия/площадки/состава рендерятся размытые серые
 * плашки. Ключевое свойство: реальные данные события в разметку НЕ
 * попадают вовсе (сервер их сюда просто не передаёт), поэтому «снять
 * блюр» через девтулзы невозможно — раскрывать нечего.
 *
 * `membersOnly` — та же карточка на вкладке «Встречи» сообщества для
 * постороннего. Гейт там другой: встречу открывает ЧЛЕНСТВО, а не
 * подписка (участие в сообществах бесплатное), и подпись «По подписке»
 * врала бы — звала бы человека платить за то, что открывается кнопкой
 * «Вступить» (аудит 2026-09, п.2.1).
 */
export default function EventCardLocked({
  startsAt,
  membersOnly = false,
}: {
  startsAt: Date;
  membersOnly?: boolean;
}) {
  const t = useT();
  const locale = useLocale();

  return (
    <div
      className="event-card event-card-locked"
      aria-label={membersOnly ? t.events.card.lockedMembersAria : t.events.card.lockedAria}
    >
      <div className="event-card-date">
        <span className="event-card-day">{startsAt.getDate()}</span>
        <span className="event-card-month">{shortMonthName(startsAt, locale)}</span>
        <span className="event-card-weekday">{shortWeekdayName(startsAt, locale)}</span>
      </div>

      <div className="event-card-locked-poster" />

      <div className="event-card-body">
        <div className="locked-bar locked-bar-title" />
        <div className="locked-bar locked-bar-line" />
        <div className="locked-bar locked-bar-line locked-bar-short" />
      </div>

      <span className="event-card-locked-badge">
        {membersOnly ? t.events.card.lockedBadgeMembers : t.events.card.lockedBadge}
      </span>
    </div>
  );
}

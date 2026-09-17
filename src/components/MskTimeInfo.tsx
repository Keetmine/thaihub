"use client";

import { EVENT_DEFAULT_TIMEZONE, formatTimeInZone, sameOffset, tzShortLabel } from "@/lib/timezones";
import { formatTime } from "@/lib/dates";
import { useViewerTimezone } from "./TimezoneProvider";
import { useT, useLocale } from "@/components/LocaleProvider";
import { InfoIcon } from "@/components/icons";

/** Small hover-only "i" icon explaining that a shown time is Thai time,
 *  with the viewer's-timezone equivalent in the tooltip — used on every
 *  list-style event display. Таймзона — из настроек юзера (контекст
 *  TimezoneProvider, дефолт МСК). The single event detail page shows the
 *  converted time inline instead. */
export default function MskTimeInfo({
  startsAt,
  endsAt,
  timezone = EVENT_DEFAULT_TIMEZONE,
  className,
}: {
  startsAt: Date | string;
  endsAt?: Date | string | null;
  /** Зона события (Event.timezone). Каталог — Бангкок; у встречи
   *  сообщества своя, и подсказка говорит «время по Минску», а не
   *  «тайское время» (правка владельца 2026-09-17). */
  timezone?: string;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const tz = useViewerTimezone();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const short = tzShortLabel(tz, locale);
  const converted = end
    ? `${formatTimeInZone(start, tz, timezone)}–${formatTimeInZone(end, tz, timezone)}`
    : formatTimeInZone(start, tz, timezone);
  // Зоны совпадают по смещению — «МСК: 12:00» рядом с «время: МСК»
  // повторяло бы то же число; остаётся только чья зона.
  const label =
    timezone === EVENT_DEFAULT_TIMEZONE
      ? t.events.card.thaiTime(short, converted)
      : sameOffset(timezone, tz, start)
        ? t.events.card.zoneTimeSame(tzShortLabel(timezone, locale))
        : t.events.card.zoneTime(tzShortLabel(timezone, locale), short, converted);

  return (
    <span className={`agenda-time-info ${className ?? ""}`} data-tooltip={label} tabIndex={0}>
      <InfoIcon />
    </span>
  );
}

/** Вариант для узкой колонки времени в EventAgendaRow: вместо отдельной
 *  иконки (не влезала и переносилась на свою строку) тултип несёт само
 *  время — пунктирное подчёркивание как аффорданс. */
export function TzTimeText({
  startsAt,
  endsAt,
  timezone = EVENT_DEFAULT_TIMEZONE,
  className,
}: {
  startsAt: Date | string;
  endsAt?: Date | string | null;
  /** Зона события — см. MskTimeInfo. */
  timezone?: string;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const tz = useViewerTimezone();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const short = tzShortLabel(tz, locale);
  const converted = end
    ? `${formatTimeInZone(start, tz, timezone)}–${formatTimeInZone(end, tz, timezone)}`
    : formatTimeInZone(start, tz, timezone);
  // Зоны совпадают по смещению — «МСК: 12:00» рядом с «время: МСК»
  // повторяло бы то же число; остаётся только чья зона.
  const label =
    timezone === EVENT_DEFAULT_TIMEZONE
      ? t.events.card.thaiTime(short, converted)
      : sameOffset(timezone, tz, start)
        ? t.events.card.zoneTimeSame(tzShortLabel(timezone, locale))
        : t.events.card.zoneTime(tzShortLabel(timezone, locale), short, converted);
  // Строго formatTime (UTC-часы): по соглашению проекта в базе лежит
  // тайское «настенное» время, и все остальные подписи читают его так
  // же. Раньше здесь стояло d.getHours() — время браузера, и зритель из
  // Москвы видел 17:00 там, где афиша показывала 14:00, хотя подсказка
  // обещала тайское.

  return (
    <span
      className={className}
      data-tooltip={label}
      tabIndex={0}
      style={{ textDecoration: "underline dotted", textUnderlineOffset: "3px", cursor: "help" }}
    >
      {formatTime(start)}
      {end && `–${formatTime(end)}`}
    </span>
  );
}

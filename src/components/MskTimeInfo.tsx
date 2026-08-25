"use client";

import { formatTimeInZone, tzShortLabel } from "@/lib/timezones";
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
  className,
}: {
  startsAt: Date | string;
  endsAt?: Date | string | null;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const tz = useViewerTimezone();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const short = tzShortLabel(tz, locale);
  const label = t.events.card.thaiTime(
    short,
    end
      ? `${formatTimeInZone(start, tz)}–${formatTimeInZone(end, tz)}`
      : formatTimeInZone(start, tz),
  );

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
  className,
}: {
  startsAt: Date | string;
  endsAt?: Date | string | null;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const tz = useViewerTimezone();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const short = tzShortLabel(tz, locale);
  const label = t.events.card.thaiTime(
    short,
    end
      ? `${formatTimeInZone(start, tz)}–${formatTimeInZone(end, tz)}`
      : formatTimeInZone(start, tz),
  );
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

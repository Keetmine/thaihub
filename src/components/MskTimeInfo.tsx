"use client";

import { formatTimeInZone, tzShortLabel } from "@/lib/timezones";
import { useViewerTimezone } from "./TimezoneProvider";
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
  const tz = useViewerTimezone();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const short = tzShortLabel(tz);
  const label = end
    ? `Тайское время. ${short}: ${formatTimeInZone(start, tz)}–${formatTimeInZone(end, tz)}`
    : `Тайское время. ${short}: ${formatTimeInZone(start, tz)}`;

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
  const tz = useViewerTimezone();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const short = tzShortLabel(tz);
  const label = end
    ? `Тайское время. ${short}: ${formatTimeInZone(start, tz)}–${formatTimeInZone(end, tz)}`
    : `Тайское время. ${short}: ${formatTimeInZone(start, tz)}`;
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <span
      className={className}
      data-tooltip={label}
      tabIndex={0}
      style={{ textDecoration: "underline dotted", textUnderlineOffset: "3px", cursor: "help" }}
    >
      {fmt(start)}
      {end && `–${fmt(end)}`}
    </span>
  );
}

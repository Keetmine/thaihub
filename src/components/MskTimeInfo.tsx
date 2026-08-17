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

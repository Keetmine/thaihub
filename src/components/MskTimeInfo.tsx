import { formatTime, toMskTime } from "@/lib/dates";
import { InfoIcon } from "@/components/icons";

/** Small hover-only "i" icon explaining that a shown time is Thai time,
 *  with the Moscow equivalent in the tooltip — used on every list-style
 *  event display. The single event detail page shows the MSK time inline
 *  instead (there's room, and it's the one page worth reading closely). */
export default function MskTimeInfo({
  startsAt,
  endsAt,
  className,
}: {
  startsAt: Date;
  endsAt?: Date | null;
  className?: string;
}) {
  const label = endsAt
    ? `Тайское время. МСК: ${formatTime(toMskTime(startsAt))}–${formatTime(toMskTime(endsAt))}`
    : `Тайское время. МСК: ${formatTime(toMskTime(startsAt))}`;

  return (
    <span className={`agenda-time-info ${className ?? ""}`} data-tooltip={label} tabIndex={0}>
      <InfoIcon />
    </span>
  );
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function buildEventICS(event: {
  id: string;
  title: string;
  venue: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
}): string {
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ThaiHub//Event//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@thaitrack`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(event.startsAt)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICSText(event.title)}`,
    `LOCATION:${escapeICSText(event.venue)}`,
    ...(event.description ? [`DESCRIPTION:${escapeICSText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * A live, subscribable feed of several events in one VCALENDAR — used for
 * the per-user "subscribe to my calendar" ICS feed (all events the user is
 * going to), as opposed to buildEventICS's one-off single-event download.
 */
export function buildFeedICS(
  events: {
    id: string;
    title: string;
    venue: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date | null;
  }[],
): string {
  const vevents = events.flatMap((event) => {
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000);
    return [
      "BEGIN:VEVENT",
      `UID:${event.id}@thaitrack`,
      `DTSTAMP:${toICSDate(new Date())}`,
      `DTSTART:${toICSDate(event.startsAt)}`,
      `DTEND:${toICSDate(end)}`,
      `SUMMARY:${escapeICSText(event.title)}`,
      `LOCATION:${escapeICSText(event.venue)}`,
      ...(event.description ? [`DESCRIPTION:${escapeICSText(event.description)}`] : []),
      "END:VEVENT",
    ];
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ThaiHub//Feed//RU",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:ThaiHub — мои события",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    ...vevents,
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/** Reminder for a ticket presale window, as its own (short) calendar entry. */
export function buildPresaleICS(event: {
  id: string;
  title: string;
  venue: string;
  presaleAt: Date;
  presaleUrl: string | null;
}): string {
  const end = new Date(event.presaleAt.getTime() + 60 * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ThaiHub//Presale//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}-presale@thaitrack`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(event.presaleAt)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICSText(`Препродажа: ${event.title}`)}`,
    `LOCATION:${escapeICSText(event.venue)}`,
    ...(event.presaleUrl ? [`DESCRIPTION:${escapeICSText(event.presaleUrl)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

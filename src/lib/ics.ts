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

type IcsEvent = {
  title: string;
  venue: string;
  description: string | null;
  occurrences: { id: string; startsAt: Date; endsAt: Date | null }[];
};

function buildVEvents(event: IcsEvent): string[] {
  return event.occurrences.flatMap((occ) => {
    const end = occ.endsAt ?? new Date(occ.startsAt.getTime() + 2 * 60 * 60 * 1000);
    return [
      "BEGIN:VEVENT",
      // UID is per-occurrence (not per-Event) — a multi-day event is
      // still several distinct calendar entries, one per date.
      `UID:${occ.id}@thaitrack`,
      `DTSTAMP:${toICSDate(new Date())}`,
      `DTSTART:${toICSDate(occ.startsAt)}`,
      `DTEND:${toICSDate(end)}`,
      `SUMMARY:${escapeICSText(event.title)}`,
      `LOCATION:${escapeICSText(event.venue)}`,
      ...(event.description ? [`DESCRIPTION:${escapeICSText(event.description)}`] : []),
      "END:VEVENT",
    ];
  });
}

/** One event's full calendar file — one VEVENT per occurrence/date. */
export function buildEventICS(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyBLHub//Event//RU",
    "CALSCALE:GREGORIAN",
    ...buildVEvents(event),
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * A live, subscribable feed of several events (each possibly multi-day)
 * in one VCALENDAR — used for the per-user "subscribe to my calendar" ICS
 * feed (all events the user is going to), as opposed to buildEventICS's
 * one-off single-event download.
 */
export function buildFeedICS(events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyBLHub//Feed//RU",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:MyBLHub — мои события",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    ...events.flatMap(buildVEvents),
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
    "PRODID:-//MyBLHub//Presale//RU",
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

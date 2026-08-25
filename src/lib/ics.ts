import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { events as enEvents } from "@/lib/i18n/en/events";
import { events as ruEvents } from "@/lib/i18n/ru/events";

// Словари берём напрямую, а не через getDict: тот тянет next/headers, а
// файл календаря собирается и там, где запроса под рукой нет
// (см. userProfile.ts — тот же приём).
const EVENTS: Record<Locale, typeof enEvents> = { en: enEvents, ru: ruEvents };

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
    "PRODID:-//MyBLHub//Event//EN",
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
 *
 * Язык — необязательный последний аргумент (как у форматтеров в
 * src/lib/dates.ts), по умолчанию английский: это язык сайта по
 * умолчанию. Фид опрашивает календарное приложение по токен-ссылке,
 * своей сессии и своего языка у него нет, а в профиле выбранный язык не
 * хранится — так что на деле имя календаря сейчас всегда английское.
 */
export function buildFeedICS(events: IcsEvent[], locale: Locale = DEFAULT_LOCALE): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyBLHub//Feed//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeICSText(EVENTS[locale].ics.calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    ...events.flatMap(buildVEvents),
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * Reminder for a ticket presale window, as its own (short) calendar entry.
 *
 * Язык — необязательный последний аргумент, по умолчанию английский:
 * заголовок «Presale: …» человек читает уже в своём календаре. Файл
 * скачивается кнопкой со страницы события, так что язык зрителя там
 * известен — маршрут /event/[id]/ics передаёт его явно.
 */
export function buildPresaleICS(
  event: {
    id: string;
    title: string;
    venue: string;
    presaleAt: Date;
    presaleUrl: string | null;
  },
  locale: Locale = DEFAULT_LOCALE,
): string {
  const end = new Date(event.presaleAt.getTime() + 60 * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyBLHub//Presale//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}-presale@thaitrack`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(event.presaleAt)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICSText(EVENTS[locale].ics.presale(event.title))}`,
    `LOCATION:${escapeICSText(event.venue)}`,
    ...(event.presaleUrl ? [`DESCRIPTION:${escapeICSText(event.presaleUrl)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

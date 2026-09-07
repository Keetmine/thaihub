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

// Время события в базе — тайские «настенные» часы, разложенные по
// UTC-полям (см. lib/dates.ts): 11:00 в Бангкоке лежит как 11:00Z.
// Календарю же нужен НАСТОЯЩИЙ момент, поэтому перед выгрузкой снимаем
// смещение Бангкока. Без этого календарь читал 11:00 как 11:00 UTC и
// показывал москвичу 14:00 вместо 07:00 (правка 2026-09-09, находка
// владельца на препродаже билетов).
//
// Константой, а не библиотекой зон: в Таиланде нет перехода на летнее
// время, смещение +7 постоянно — как и четыре часа до Москвы, которые
// вычитает formatTimeWithMsk.
const BANGKOK_OFFSET_MINUTES = 7 * 60;

function toICSDate(d: Date): string {
  const utc = new Date(d.getTime() - BANGKOK_OFFSET_MINUTES * 60 * 1000);
  return toICSInstant(utc);
}

/** Настоящий момент времени — без пересчёта. Для DTSTAMP: он про то,
 *  когда собран файл, а не про тайское расписание. */
function toICSInstant(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Дата без времени — `20260912`, для событий с `hasTime = false`.
 *  Их полночь настенная и никакому моменту не соответствует: сдвинув её
 *  на -7 часов, мы бы увезли событие во вчерашний вечер. */
function toICSDay(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

type IcsEvent = {
  title: string;
  venue: string;
  description: string | null;
  occurrences: { id: string; startsAt: Date; endsAt: Date | null; hasTime?: boolean }[];
};

/** Дата на день позже — конец однодневного «весь день»: в iCalendar
 *  DTEND у таких записей не входит в событие. */
function nextDay(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

function buildVEvents(event: IcsEvent): string[] {
  return event.occurrences.flatMap((occ) => {
    const end = occ.endsAt ?? new Date(occ.startsAt.getTime() + 2 * 60 * 60 * 1000);
    // У события без времени в базе стоит настенная полночь (hasTime =
    // false). Такое отдаём датой, а не моментом: иначе в календаре оно
    // встанет на конкретный час, которого мы не знаем.
    const allDay = occ.hasTime === false;
    return [
      "BEGIN:VEVENT",
      // UID is per-occurrence (not per-Event) — a multi-day event is
      // still several distinct calendar entries, one per date.
      `UID:${occ.id}@thaitrack`,
      `DTSTAMP:${toICSInstant(new Date())}`,
      ...(allDay
        ? [
            `DTSTART;VALUE=DATE:${toICSDay(occ.startsAt)}`,
            `DTEND;VALUE=DATE:${toICSDay(nextDay(occ.endsAt ?? occ.startsAt))}`,
          ]
        : [`DTSTART:${toICSDate(occ.startsAt)}`, `DTEND:${toICSDate(end)}`]),
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
    `DTSTAMP:${toICSInstant(new Date())}`,
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

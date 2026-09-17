import type { Locale } from "@/lib/i18n/config";

// Таймзоны для «времени в скобках» рядом со временем события. В базе
// лежит настенное время события в его зоне (`Event.timezone`; каталог —
// Бангкок, ICT, UTC+7, без перехода на летнее время; встречи сообществ
// — зона сообщества); конвертация в зону зрителя — через Intl
// (лето/зима зон с DST учитываются автоматически).

export const DEFAULT_TIMEZONE = "Europe/Moscow";

/**
 * value — IANA-зона (хранится в User.timezone), short — подпись в
 * скобках («МСК 14:00» / «MSK 14:00»), label — название в настройках.
 *
 * Подписи двуязычные: время в скобках стоит рядом с тайским на каждой
 * карточке события, и «МСК» посреди английской страницы читается как
 * опечатка.
 */
type TzEntry = {
  value: string;
  short: Record<Locale, string>;
  label: Record<Locale, string>;
};

export const TIMEZONES: TzEntry[] = [
  tz("Europe/Moscow", ["МСК", "MSK"], ["Москва (UTC+3)", "Moscow (UTC+3)"]),
  tz("Europe/Kyiv", ["Киев", "Kyiv"], ["Киев (UTC+2/+3)", "Kyiv (UTC+2/+3)"]),
  tz("Europe/Minsk", ["Минск", "Minsk"], ["Минск (UTC+3)", "Minsk (UTC+3)"]),
  tz("Asia/Yekaterinburg", ["ЕКБ", "YEK"], ["Екатеринбург (UTC+5)", "Yekaterinburg (UTC+5)"]),
  tz("Asia/Novosibirsk", ["НСК", "NSK"], ["Новосибирск (UTC+7)", "Novosibirsk (UTC+7)"]),
  tz("Asia/Vladivostok", ["ВЛД", "VLA"], ["Владивосток (UTC+10)", "Vladivostok (UTC+10)"]),
  tz("Asia/Almaty", ["Алматы", "Almaty"], ["Алматы (UTC+5)", "Almaty (UTC+5)"]),
  tz("Asia/Tbilisi", ["Тбилиси", "Tbilisi"], ["Тбилиси (UTC+4)", "Tbilisi (UTC+4)"]),
  tz("Asia/Yerevan", ["Ереван", "Yerevan"], ["Ереван (UTC+4)", "Yerevan (UTC+4)"]),
  tz("Europe/Berlin", ["Берлин", "Berlin"], ["Берлин (UTC+1/+2)", "Berlin (UTC+1/+2)"]),
  tz("Europe/Warsaw", ["Варшава", "Warsaw"], ["Варшава (UTC+1/+2)", "Warsaw (UTC+1/+2)"]),
  tz("Europe/London", ["Лондон", "London"], ["Лондон (UTC+0/+1)", "London (UTC+0/+1)"]),
  tz("Asia/Bangkok", ["БКК", "BKK"], ["Бангкок (UTC+7, тайское)", "Bangkok (UTC+7, Thai time)"]),
  tz("America/New_York", ["Нью-Йорк", "New York"], ["Нью-Йорк (UTC-5/-4)", "New York (UTC-5/-4)"]),
  tz("America/Los_Angeles", ["ЛА", "LA"], ["Лос-Анджелес (UTC-8/-7)", "Los Angeles (UTC-8/-7)"]),
];

function tz(value: string, short: [string, string], label: [string, string]): TzEntry {
  return {
    value,
    short: { ru: short[0], en: short[1] },
    label: { ru: label[0], en: label[1] },
  };
}

export function isKnownTimezone(tz: string): boolean {
  return TIMEZONES.some((t) => t.value === tz);
}

export function tzShortLabel(tz: string, locale: Locale = "ru"): string {
  const entry = TIMEZONES.find((t) => t.value === tz);
  return entry ? entry.short[locale] : locale === "ru" ? "МСК" : "MSK";
}

/** Зона, в которой лежат часы каталожных событий: Бангкок. У встреч
 *  сообществ своя (`Event.timezone`, с 2026-09-17). */
export const EVENT_DEFAULT_TIMEZONE = "Asia/Bangkok";

/** Смещение зоны от UTC в миллисекундах в данный момент — через Intl,
 *  чтобы лето/зима зон с DST считались сами. */
function zoneOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - at.getTime();
}

/** Настенное время события (как лежит в базе, в UTC-полях) → реальный
 *  момент. Зона события — `Event.timezone`; для Бангкока — константа
 *  −7 часов (перехода на летнее время там нет), для остальных —
 *  смещение зоны через Intl с одной поправкой на границу DST. */
export function wallClockToInstant(d: Date, fromTz: string = EVENT_DEFAULT_TIMEZONE): Date {
  // UTC-компоненты, а не локальные: настенное время лежит в UTC-слоте
  // (см. комментарий в lib/dates.ts), иначе результат зависел бы от
  // зоны сервера/браузера.
  const asUtc = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  );
  if (fromTz === EVENT_DEFAULT_TIMEZONE) return new Date(asUtc - 7 * 3600_000);
  try {
    const first = zoneOffsetMs(fromTz, new Date(asUtc));
    let instant = asUtc - first;
    const second = zoneOffsetMs(fromTz, new Date(instant));
    if (second !== first) instant = asUtc - second;
    return new Date(instant);
  } catch {
    return new Date(asUtc - 7 * 3600_000);
  }
}

/** Совпадают ли смещения двух зон в момент события: тогда «в скобках»
 *  показывать нечего — время то же самое. */
export function sameOffset(tzA: string, tzB: string, d: Date): boolean {
  if (tzA === tzB) return true;
  try {
    const at = wallClockToInstant(d, tzA);
    return zoneOffsetMs(tzA, at) === zoneOffsetMs(tzB, at);
  } catch {
    return false;
  }
}

/** «HH:mm» события в заданной зоне. Вход — настенное время события в
 *  его зоне (`fromTz`, по умолчанию Бангкок). */
export function formatTimeInZone(d: Date, tz: string, fromTz: string = EVENT_DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(wallClockToInstant(d, fromTz));
  } catch {
    // Неизвестная зона в базе — не роняем страницу, откатываемся на МСК.
    return formatTimeInZone(d, DEFAULT_TIMEZONE, fromTz);
  }
}

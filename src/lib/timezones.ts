import type { Locale } from "@/lib/i18n/config";

// Таймзоны для «времени в скобках» рядом с тайским. Все события — в
// Таиланде (ICT, UTC+7, без перехода на летнее время), в базе лежит
// тайское настенное время; конвертация в зону зрителя — через Intl
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

/** Тайское настенное время (как лежит в базе) → реальный момент:
 *  компоненты даты минус 7 часов ICT. */
function thaiWallClockToInstant(d: Date): Date {
  return new Date(
    // UTC-компоненты, а не локальные: тайское настенное время лежит в
    // UTC-слоте (см. комментарий в lib/dates.ts), иначе результат
    // зависел бы от зоны сервера/браузера.
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ) -
      7 * 3600_000,
  );
}

/** «HH:mm» события в заданной зоне (вход — тайское настенное время). */
export function formatTimeInZone(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(thaiWallClockToInstant(d));
  } catch {
    // Неизвестная зона в базе — не роняем страницу, откатываемся на МСК.
    return formatTimeInZone(d, DEFAULT_TIMEZONE);
  }
}

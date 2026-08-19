// Таймзоны для «времени в скобках» рядом с тайским. Все события — в
// Таиланде (ICT, UTC+7, без перехода на летнее время), в базе лежит
// тайское настенное время; конвертация в зону зрителя — через Intl
// (лето/зима зон с DST учитываются автоматически).

export const DEFAULT_TIMEZONE = "Europe/Moscow";

/** value — IANA-зона (хранится в User.timezone), short — подпись в
 *  скобках («МСК 14:00»), label — название в настройках. */
export const TIMEZONES: { value: string; short: string; label: string }[] = [
  { value: "Europe/Moscow", short: "МСК", label: "Москва (UTC+3)" },
  { value: "Europe/Kyiv", short: "Киев", label: "Киев (UTC+2/+3)" },
  { value: "Europe/Minsk", short: "Минск", label: "Минск (UTC+3)" },
  { value: "Asia/Yekaterinburg", short: "ЕКБ", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Novosibirsk", short: "НСК", label: "Новосибирск (UTC+7)" },
  { value: "Asia/Vladivostok", short: "ВЛД", label: "Владивосток (UTC+10)" },
  { value: "Asia/Almaty", short: "Алматы", label: "Алматы (UTC+5)" },
  { value: "Asia/Tbilisi", short: "Тбилиси", label: "Тбилиси (UTC+4)" },
  { value: "Asia/Yerevan", short: "Ереван", label: "Ереван (UTC+4)" },
  { value: "Europe/Berlin", short: "Берлин", label: "Берлин (UTC+1/+2)" },
  { value: "Europe/Warsaw", short: "Варшава", label: "Варшава (UTC+1/+2)" },
  { value: "Europe/London", short: "Лондон", label: "Лондон (UTC+0/+1)" },
  { value: "Asia/Bangkok", short: "БКК", label: "Бангкок (UTC+7, тайское)" },
  { value: "America/New_York", short: "Нью-Йорк", label: "Нью-Йорк (UTC-5/-4)" },
  { value: "America/Los_Angeles", short: "ЛА", label: "Лос-Анджелес (UTC-8/-7)" },
];

export function isKnownTimezone(tz: string): boolean {
  return TIMEZONES.some((t) => t.value === tz);
}

export function tzShortLabel(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.short ?? "МСК";
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

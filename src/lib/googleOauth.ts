// Общий помощник Google OAuth (см. /api/auth/google/*): redirect URI
// должен байт-в-байт совпадать в обоих запросах и в консоли Google.
export function googleRedirectUri(origin: string): string {
  return `${publicOrigin(origin)}/api/auth/google/callback`;
}

/**
 * Внешний адрес сайта. За реверс-прокси `request.url` содержит адрес,
 * на который слушает контейнер (0.0.0.0:3000) — редирект после входа
 * уводил браузер именно туда. APP_URL знает, как сайт выглядит снаружи;
 * origin остаётся фолбэком для локальной разработки без APP_URL.
 */
export function publicOrigin(origin: string): string {
  return (process.env.APP_URL || origin).replace(/\/$/, "");
}

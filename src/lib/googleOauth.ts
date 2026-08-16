// Общий помощник Google OAuth (см. /api/auth/google/*): redirect URI
// должен байт-в-байт совпадать в обоих запросах и в консоли Google.
export function googleRedirectUri(origin: string): string {
  const base = process.env.APP_URL || origin;
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

import { headers } from "next/headers";

// Простой in-memory лимитер (fixed window) для логина/регистрации —
// процесс один (single-container deploy), внешняя зависимость не нужна.
// Память ограничена: окна чистятся при каждом обращении.
type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

const WINDOW_MS = 10 * 60 * 1000;
// 30 попыток за 10 минут: брутфорсу всё ещё тесно, а полный e2e-прогон
// (10+ логинов с одного IP) и семья за одним роутером — проходят.
const MAX_ATTEMPTS = 30;

async function clientKey(scope: string): Promise<string> {
  const h = await headers();
  // За Caddy реальный адрес — первый в X-Forwarded-For.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${scope}:${ip}`;
}

/**
 * Бросает с понятным сообщением после MAX_ATTEMPTS попыток за 10 минут
 * с одного IP. Считает только вызовы этой функции — вызывать в начале
 * действия, до проверки пароля (иначе перебор бесплатен до успеха).
 */
export async function assertRateLimit(scope: "login" | "signup"): Promise<void> {
  const key = await clientKey(scope);
  const now = Date.now();

  for (const [k, w] of windows) {
    if (w.resetAt <= now) windows.delete(k);
  }

  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  w.count += 1;
  if (w.count > MAX_ATTEMPTS) {
    throw new Error("Слишком много попыток — подождите несколько минут");
  }
}

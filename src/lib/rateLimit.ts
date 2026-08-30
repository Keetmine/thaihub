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
  // Caddy (reverse_proxy) ДОПИСЫВАЕТ адрес клиента в КОНЕЦ
  // X-Forwarded-For, а начало списка может прислать сам клиент —
  // доверять можно только последнему элементу. Первый элемент давал
  // бесплатный обход лимита: подставляй новый заголовок на каждый
  // запрос и перебирай пароли без ограничений.
  const chain = h.get("x-forwarded-for")?.split(",") ?? [];
  const ip = chain[chain.length - 1]?.trim() || "unknown";
  return `${scope}:${ip}`;
}

/**
 * Бросает с понятным сообщением после MAX_ATTEMPTS попыток за 10 минут
 * с одного IP. Считает только вызовы этой функции — вызывать в начале
 * действия, до проверки пароля (иначе перебор бесплатен до успеха).
 */
export async function assertRateLimit(scope: "login" | "signup"): Promise<void> {
  // Обход для e2e: полный прогон логинится десятки раз с одного IP и
  // упирался в лимит невнятными таймаутами. Двойное условие — в проде
  // (NODE_ENV=production) переменная не действует, ослабить боевой
  // лимитер ею нельзя.
  if (process.env.E2E_RATE_LIMIT_OFF === "1" && process.env.NODE_ENV !== "production") return;
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

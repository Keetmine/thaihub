import net from "net";

// Защита от SSRF для всех мест, где сервер ходит по адресу, который
// приехал не из нашего кода: пользовательские maps-ссылки, og:image со
// страницы «оригинала» фанфика, картинки из спарсенного HTML. Без этой
// проверки подсунутая ссылка на http://192.168.1.1/… или
// http://localhost:5432/… заставила бы сервер стучаться в свою же
// внутреннюю сеть (метаданные облака, БД, соседние контейнеры).
//
// Проверяем ЛИТЕРАЛЫ и очевидные имена, без DNS-резолва: приложение
// живёт в одном контейнере без облачных метаданных, и главный риск —
// именно прямые адреса. DNS-rebinding сюда не пролезает тем же путём,
// потому что fetchPublicUrl перепроверяет каждый редирект-хоп.

/** Хостнеймы, которые означают «свою» машину/сеть, даже не будучи IP. */
const BLOCKED_HOSTNAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true; // не разобрали — считаем опасным
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8 — «this network», в Linux ведёт на localhost
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local (и облачные метаданные)
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 192 && b === 0) || // 192.0.0.0/24 IETF
    a >= 224 // multicast и «зарезервировано»
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:10.0.0.1) — проверяем вложенный IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") || // fc00::/7 unique local
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // fe80::/10 link-local
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

/**
 * Бросает, если по адресу нельзя ходить с сервера. Возвращает разобранный
 * URL — чтобы вызывающий работал уже с провалидированным объектом.
 *
 * Важно: WHATWG URL сам нормализует хитрые записи IPv4 (0x7f000001,
 * 017700000001, 2130706433) в каноничную точечную форму, поэтому после
 * `new URL()` достаточно проверить каноничный hostname.
 */
export function assertPublicHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`urlGuard: не URL: ${url.slice(0, 200)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`urlGuard: запрещённый протокол ${parsed.protocol}`);
  }
  // У IPv6 hostname приходит в скобках: [::1]
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_HOSTNAME.test(host)) {
    throw new Error(`urlGuard: запрещённый хост ${host || "(пустой)"}`);
  }
  const ipKind = net.isIP(host);
  if (ipKind === 4 && isPrivateIPv4(host)) {
    throw new Error(`urlGuard: приватный IPv4 ${host}`);
  }
  if (ipKind === 6 && isPrivateIPv6(host)) {
    throw new Error(`urlGuard: приватный IPv6 ${host}`);
  }
  return parsed;
}

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;

export type FetchPublicOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /**
   * Дополнительный фильтр на каждый хоп (включая исходный URL) ПОВЕРХ
   * общей проверки. Нужен для пользовательских maps-ссылок: там мало
   * запретить приватные адреса — ходить можно только на Google.
   * Вернул false — обрыв с ошибкой.
   */
  allowHost?: (parsed: URL) => boolean;
};

/**
 * fetch с ручным следованием редиректам: КАЖДЫЙ хоп перепроверяется
 * assertPublicHttpUrl (и allowHost, если задан). Автоматический
 * redirect-follow у обычного fetch — классическая дыра: первый адрес
 * публичный, а 302 уводит на http://169.254.169.254/….
 */
export async function fetchPublicUrl(url: string, options: FetchPublicOptions = {}): Promise<Response> {
  const { headers, timeoutMs = DEFAULT_TIMEOUT_MS, allowHost } = options;

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = assertPublicHttpUrl(current);
    if (allowHost && !allowHost(parsed)) {
      throw new Error(`urlGuard: хост ${parsed.hostname} вне списка разрешённых`);
    }

    const res = await fetch(current, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      // Тело редиректа не нужно — отпускаем соединение.
      void res.body?.cancel().catch(() => {});
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error(`urlGuard: больше ${MAX_REDIRECTS} редиректов: ${url.slice(0, 200)}`);
}

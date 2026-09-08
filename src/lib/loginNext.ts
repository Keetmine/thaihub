import { stripLocale } from "@/lib/i18n/config";

/**
 * Валидация `?next=` — адреса возврата после входа.
 *
 * Значение приходит из URL, то есть подконтрольно кому угодно: ссылку
 * `/login?next=…` можно прислать жертве в личку. Поэтому правило
 * строгое — только внутренний путь; всё, что на него не похоже,
 * молча отбрасывается (форма поведёт в /account, как раньше), а не
 * «чинится»: починка таких строк — классический источник обходов.
 *
 * Отсекаем:
 * - не-строки, пустое и неправдоподобно длинное;
 * - всё, что не начинается ровно с одного `/`: `https://evil`,
 *   `//evil.com` (протокол-относительный переход на чужой домен);
 * - обратный слэш где угодно: браузеры читают `/\evil.com` как `//`;
 * - управляющие символы (CR/LF-инъекции в Location);
 * - сами /login и /signup — иначе вход зацикливается на форму.
 *
 * Языковой префикс срезаем: потребители подставляют его обратно через
 * localeHref по языку текущей страницы, и `/ru/trips` в next дал бы
 * `/ru/ru/trips`.
 */
export function sanitizeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 1024) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  if (/[\x00-\x1f\x7f]/.test(raw)) return null;

  // Query-часть оставляем как есть (фильтры страницы — часть возврата),
  // префикс языка срезаем только у пути.
  const qIndex = raw.search(/[?#]/);
  const pathOnly = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const rest = qIndex === -1 ? "" : raw.slice(qIndex);
  const path = stripLocale(pathOnly).path;

  if (/^\/(login|signup)(\/|$)/.test(path)) return null;
  return `${path}${rest}`;
}

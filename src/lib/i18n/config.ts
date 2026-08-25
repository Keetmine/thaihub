/**
 * Языки сайта.
 *
 * Английский — язык по умолчанию и живёт на ТЕКУЩИХ адресах
 * (`/events`, `/dramas/…`), русский — под префиксом `/ru`. Так сделано
 * ради поиска: страницы уже проиндексированы по адресам без префикса, и
 * если бы английский уехал на `/en`, весь накопленный вес пришлось бы
 * переносить редиректами. Заодно это отвечает просьбе владельца
 * «по умолчанию английский».
 */
export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Кука с явно выбранным языком: переключатель ставит её на год. */
export const LOCALE_COOKIE = "locale";

/** Заголовок, которым proxy передаёт язык серверным компонентам. */
export const LOCALE_HEADER = "x-locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Путь без языкового префикса: `/ru/events` → `/events`, `/ru` → `/`.
 * Английские адреса возвращаются как есть.
 */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) {
    const rest = pathname.slice(m[0].length);
    return { locale: m[1], path: rest === "" ? "/" : rest };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/**
 * Адрес для нужного языка. Английский — без префикса, остальные — с ним.
 * Внешние ссылки, якоря и mailto не трогаем.
 */
export function localeHref(href: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return href;
  if (!href.startsWith("/")) return href;
  if (href.startsWith("//")) return href;
  return `/${locale}${href === "/" ? "" : href}`;
}

/**
 * Язык из заголовка Accept-Language. Нужен только для первого захода:
 * дальше выбор живёт в куке. Русский отдаём русскоязычным, всем
 * остальным — английский.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  // «ru-RU,ru;q=0.9,en;q=0.8» — берём первый языковой тег с наибольшим
  // весом; разбор простой, потому что решение бинарное.
  const parts = header
    .split(",")
    .map((p) => {
      const [tag, q] = p.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    if (tag.startsWith("ru")) return "ru";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

import { headers } from "next/headers";
import { en, type Dict } from "./en";
import { ru } from "./ru";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale } from "./config";

export * from "./config";
export type { Dict };

const DICTS: Record<Locale, Dict> = { en, ru };

export function getDict(locale: Locale): Dict {
  return DICTS[locale];
}

/**
 * Язык текущего запроса в серверных компонентах. Его кладёт proxy в
 * заголовок: сам путь читать нельзя — русские страницы отдаются
 * рерайтом, и в компоненте путь уже без префикса `/ru`.
 */
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const value = h.get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Язык + словарь одним вызовом — самый частый случай на странице. */
export async function getT(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: getDict(locale) };
}

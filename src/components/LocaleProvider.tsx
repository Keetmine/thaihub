"use client";

import { createContext, useContext } from "react";
import { en, type Dict } from "@/lib/i18n/en";
import { ru } from "@/lib/i18n/ru";
import { DEFAULT_LOCALE, localeHref, type Locale } from "@/lib/i18n/config";

// Язык зрителя — через контекст, как таймзона: пробрасывать его пропсами
// сквозь каждую кнопку нереально. Провайдер ставит публичный layout,
// значение приходит с сервера (из заголовка, который выставил proxy).
const DICTS: Record<Locale, Dict> = { en, ru };

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Словарь текущего языка в клиентских компонентах. */
export function useT(): Dict {
  return DICTS[useContext(LocaleContext)];
}

/** Адрес с языковым префиксом — для ручных переходов (router.push). */
export function useLocaleHref(): (href: string) => string {
  const locale = useContext(LocaleContext);
  return (href: string) => localeHref(href, locale);
}

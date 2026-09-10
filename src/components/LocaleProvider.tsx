"use client";

import { createContext, useContext, useMemo } from "react";
import { en, type Dict } from "@/lib/i18n/en";
import { ru } from "@/lib/i18n/ru";
import { DEFAULT_LOCALE, localeHref, type Locale } from "@/lib/i18n/config";
import {
  buildContentDict,
  type ContentDict,
  type ContentOverrides,
} from "@/lib/contentDictionary";

// Язык зрителя — через контекст, как таймзона: пробрасывать его пропсами
// сквозь каждую кнопку нереально. Провайдер ставит публичный layout,
// значение приходит с сервера (из заголовка, который выставил proxy).
const DICTS: Record<Locale, Dict> = { en, ru };

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
// Правки словаря повторяющихся значений (жанры, занятия…) — тем же
// контекстом: их правит владелец в админке, и клиентская таблица
// каталога обязана видеть те же подписи, что серверная страница.
const OverridesContext = createContext<ContentOverrides>({});

export function LocaleProvider({
  locale,
  contentOverrides = {},
  children,
}: {
  locale: Locale;
  contentOverrides?: ContentOverrides;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>
      <OverridesContext.Provider value={contentOverrides}>{children}</OverridesContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Словарь текущего языка в клиентских компонентах. */
export function useT(): Dict {
  return DICTS[useContext(LocaleContext)];
}

/** Переводчик повторяющихся значений каталога в клиентских компонентах.
 *  Серверный близнец — `getContentDict()` в contentDictionary.server.ts;
 *  правило разрешения у них одно (buildContentDict). */
export function useContentDict(): ContentDict {
  const locale = useContext(LocaleContext);
  const overrides = useContext(OverridesContext);
  return useMemo(() => buildContentDict(locale, overrides), [locale, overrides]);
}

/** Адрес с языковым префиксом — для ручных переходов (router.push). */
export function useLocaleHref(): (href: string) => string {
  const locale = useContext(LocaleContext);
  return (href: string) => localeHref(href, locale);
}

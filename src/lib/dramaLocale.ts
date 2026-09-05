import type { Locale } from "@/lib/i18n/config";

/**
 * Название и описание сериала на языке зрителя.
 *
 * Русские тексты приходят с dorama.land (см.
 * features/doramaland-import.md) и есть не у всех записей — поэтому
 * это подстановка с запасным вариантом, а не перевод: нет русского —
 * показываем английское, как раньше. Английская версия сайта русских
 * текстов не видит вовсе.
 *
 * Без единого серверного импорта: помощником пользуются и серверные
 * страницы, и клиентские компоненты.
 */

/** Поля, без которых `dramaTitleForLocale` молча отдаст английское:
 *  узкий `select` в Prisma обязан брать оба. Кладите `...DRAMA_TITLE_SELECT`
 *  в select сериала вместо голого `title: true`. */
export const DRAMA_TITLE_SELECT = { title: true, titleRu: true } as const;

/** Тот же набор полей типом — для пропсов и сигнатур. */
export type DramaTitleFields = { title: string; titleRu?: string | null };

export function dramaTitleForLocale(d: DramaTitleFields, locale: Locale): string {
  return locale === "ru" && d.titleRu ? d.titleRu : d.title;
}

export function dramaSynopsisForLocale(
  d: { synopsis?: string | null; synopsisRu?: string | null },
  locale: Locale,
): string | null {
  const en = d.synopsis ?? null;
  return locale === "ru" && d.synopsisRu ? d.synopsisRu : en;
}

/** Сравнение для сортировки по названию на языке зрителя: у Prisma
 *  `orderBy: { title }` — английский порядок, и на /ru русские названия
 *  вставали бы вразнобой. Латиница идёт перед кириллицей и в ICU, и в
 *  алфавитных рейках (сортировка букв по коду), так что группы по буквам
 *  не рассыпаются. */
export function compareDramaTitles(
  a: DramaTitleFields,
  b: DramaTitleFields,
  locale: Locale,
): number {
  return dramaTitleForLocale(a, locale).localeCompare(dramaTitleForLocale(b, locale), locale);
}

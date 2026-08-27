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

export function dramaTitleForLocale(
  d: { title: string; titleRu?: string | null },
  locale: Locale,
): string {
  return locale === "ru" && d.titleRu ? d.titleRu : d.title;
}

export function dramaSynopsisForLocale(
  d: { synopsis?: string | null; synopsisRu?: string | null },
  locale: Locale,
): string | null {
  const en = d.synopsis ?? null;
  return locale === "ru" && d.synopsisRu ? d.synopsisRu : en;
}

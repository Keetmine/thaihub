import { revalidateTag } from "next/cache";

/** Общий тег кэшированных каталожных выборок (sitemap и т.п.).
 *  Любая админская правка каталога сбрасывает его через logAudit;
 *  TTL самих кэшей подстраховывает записи, идущие мимо аудита
 *  (например, импортёры). */
export const CATALOG_TAG = "catalog";

/** Сброс каталожного кэша. Вне HTTP-контекста (CLI-скрипты, крон)
 *  revalidateTag бросает — там кэша процесса Next всё равно нет,
 *  поэтому молча пропускаем. */
export function invalidateCatalogCache(): void {
  try {
    // Двухаргументная форма — конвенция этой версии Next
    // (см. node_modules/next/dist/docs/.../revalidateTag.md);
    // "max" = stale-while-revalidate.
    revalidateTag(CATALOG_TAG, "max");
  } catch {
    // не в запросе — сбрасывать нечего
  }
}

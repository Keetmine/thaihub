/**
 * С-5: серверные «страницы буквы» каталогов (`?letter=X`).
 *
 * Краулер без JS видел лишь десятки ссылок из тысяч записей каталога —
 * клиентские алфавитные списки дорисовывают строки на скролле. Буквы
 * рейки теперь настоящие ссылки `?letter=X`, а по такому адресу сервер
 * рендерит ПОЛНЫЙ список записей на букву обычными ссылками; режим с JS
 * по умолчанию (без параметра) не меняется.
 */

/** Буквы, по которым существуют серверные страницы. Латиница + «0-9» —
 *  названия каталога приходят с MDL/blscene и практически все латиницей;
 *  группа цифр совпадает с группировкой в алфавитных списках. */
export const CATALOG_LETTERS = [
  "0-9",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
] as const;

export function isCatalogLetter(value: string | undefined | null): value is string {
  return !!value && (CATALOG_LETTERS as readonly string[]).includes(value);
}

/** Префиксы для startsWith-условий: буква — она сама, «0-9» — десять
 *  цифр (в Prisma нет «начинается с цифры», OR по префиксам есть). */
export function letterPrefixes(letter: string): string[] {
  return letter === "0-9" ? "0123456789".split("") : [letter];
}

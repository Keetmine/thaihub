import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n";
import {
  buildContentDict,
  type ContentDict,
  type ContentDictKind,
  type ContentOverrides,
} from "@/lib/contentDictionary";

/**
 * Правки словаря из базы. Серверная половина `contentDictionary.ts` —
 * отдельным файлом, потому что тот импортируют клиентские компоненты, и
 * prisma уехала бы к ним в бандл (та же причина, что у
 * `communities.server.ts`).
 */

/** Тег сброса: правка в админке обнуляет кэш сразу, без ожидания TTL. */
export const CONTENT_DICT_TAG = "content-dictionary";

/**
 * Строк здесь единицы — весь словарь одним запросом и в кэш на сутки.
 * TTL длинный намеренно: справочник меняется вручную и редко, а тег
 * сбрасывает его в тот же миг, когда владелец нажала «Сохранить».
 */
export const loadContentOverrides = unstable_cache(
  async (): Promise<ContentOverrides> => {
    const rows = await prisma.contentTranslation.findMany({
      select: { kind: true, source: true, ru: true },
    });
    const out: ContentOverrides = {};
    for (const row of rows) {
      const kind = row.kind as ContentDictKind;
      (out[kind] ??= {})[row.source] = row.ru;
    }
    return out;
  },
  ["content-dictionary"],
  { revalidate: 86400, tags: [CONTENT_DICT_TAG] },
);

/** Переводчик значений для серверного компонента: язык берётся из запроса. */
export async function getContentDict(): Promise<ContentDict> {
  const [locale, overrides] = await Promise.all([getLocale(), loadContentOverrides()]);
  return buildContentDict(locale, overrides);
}

import { prisma } from "@/lib/prisma";
import { NOTIFICATION_TEMPLATES, templateDef, type TemplateOverrides } from "@/lib/notificationTemplates";
import { getDict, LOCALES, type Locale } from "@/lib/i18n";

/**
 * Где живут правки текстов уведомлений (`/admin/notifications`).
 *
 * Отдельно от реестра (`notificationTemplates.ts`) намеренно: реестр
 * чистый и его импортируют и страницы, и юнит-тесты, а сюда ходит
 * Prisma. В базе лежат ТОЛЬКО переписанные строки — «сбросить» значит
 * удалить строку, и правка словаря в коде снова начинает работать.
 */

/**
 * Правки всех языков разом. Читаются редко, а нужны на каждое
 * уведомление и на каждую страницу колокольчика, поэтому лежат в
 * памяти процесса с коротким сроком годности. Сохранение из админки
 * сбрасывает кэш само (`resetTemplateCache`) — минута ожидания нужна
 * лишь на случай правки мимо приложения.
 */
const CACHE_TTL_MS = 60 * 1000;
let cache: { at: number; byLocale: Record<string, TemplateOverrides> } | null = null;

export function resetTemplateCache(): void {
  cache = null;
}

export async function loadTemplateOverrides(): Promise<Record<string, TemplateOverrides>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.byLocale;
  const byLocale: Record<string, TemplateOverrides> = {};
  try {
    const rows = await prisma.notificationTemplate.findMany({
      select: { key: true, locale: true, text: true },
    });
    for (const row of rows) {
      // Ключи, которых больше нет в реестре (повод убрали), просто
      // игнорируем: строка в базе не должна ронять отрисовку.
      if (!templateDef(row.key)) continue;
      (byLocale[row.locale] ??= {})[row.key] = row.text;
    }
  } catch (error) {
    // Уведомление важнее правки текста: не прочиталось — рисуем
    // словарём, как до появления этой таблицы.
    console.error("loadTemplateOverrides failed", error);
    return {};
  }
  cache = { at: Date.now(), byLocale };
  return byLocale;
}

/** Правки для одного языка — то, что принимают рендеры реестра. */
export async function templateOverridesFor(locale: Locale): Promise<TemplateOverrides> {
  return (await loadTemplateOverrides())[locale] ?? {};
}

/** Строка для страницы админки: что правится, чем сейчас и переписано ли. */
export type TemplateRow = {
  key: string;
  byLocale: Record<Locale, { current: string; fallback: string; overridden: boolean }>;
};

export async function listTemplateRows(): Promise<TemplateRow[]> {
  const overrides = await loadTemplateOverrides();
  return NOTIFICATION_TEMPLATES.map((def) => ({
    key: def.key,
    byLocale: Object.fromEntries(
      LOCALES.map((locale) => {
        const fallback = def.fallback(getDict(locale));
        const override = overrides[locale]?.[def.key];
        return [
          locale,
          { current: override ?? fallback, fallback, overridden: override !== undefined },
        ];
      }),
    ) as TemplateRow["byLocale"],
  }));
}

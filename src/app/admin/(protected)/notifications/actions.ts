"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { NOTIFICATION_TEMPLATES, templateDef } from "@/lib/notificationTemplates";
import { resetTemplateCache } from "@/lib/notificationTemplateStore";
import { LOCALES, isLocale } from "@/lib/i18n";

/**
 * Сохранить тексты уведомлений (см. lib/notificationTemplates.ts).
 *
 * Пишем ТОЛЬКО то, что отличается от словарного текста: строка в базе —
 * это «переписано руками», и копия дефолта в ней означала бы, что
 * будущая правка словаря в коде до сайта уже не доедет. Совпал с
 * дефолтом или очищен — строка удаляется, и текст снова берётся из
 * словаря.
 *
 * Форма присылает все поля разом (по одному на ключ и язык): у страницы
 * одна кнопка «Сохранить», как у /admin/settings.
 */
export async function saveNotificationTemplates(formData: FormData): Promise<void> {
  await requireAdmin();

  const writes: { key: string; locale: string; text: string }[] = [];
  const drops: { key: string; locale: string }[] = [];

  for (const def of NOTIFICATION_TEMPLATES) {
    for (const locale of LOCALES) {
      const field = `${def.key}::${locale}`;
      const raw = formData.get(field);
      // Поля нет в форме вовсе — значит, страница его не показывала:
      // молча ничего не трогаем (иначе частичная форма стирала бы всё).
      if (typeof raw !== "string") continue;
      const text = raw.trim();
      const { getDict } = await import("@/lib/i18n");
      const fallback = def.fallback(getDict(locale));
      if (!text || text === fallback) drops.push({ key: def.key, locale });
      else writes.push({ key: def.key, locale, text });
    }
  }

  for (const w of writes) {
    await prisma.notificationTemplate.upsert({
      where: { key_locale: { key: w.key, locale: w.locale } },
      create: w,
      update: { text: w.text },
    });
  }
  if (drops.length > 0) {
    await prisma.notificationTemplate.deleteMany({
      where: { OR: drops.map((d) => ({ key: d.key, locale: d.locale })) },
    });
  }

  // Правки живут в памяти процесса минуту — после сохранения страница
  // должна показать новое сразу, а не «когда-нибудь».
  resetTemplateCache();
  revalidatePath("/admin/notifications");
}

/** Вернуть одному тексту словарный вид — удалением строки. */
export async function resetNotificationTemplate(key: string, locale: string): Promise<void> {
  await requireAdmin();
  if (!templateDef(key) || !isLocale(locale)) throw new Error("Неизвестный текст уведомления");
  await prisma.notificationTemplate.deleteMany({ where: { key, locale } });
  resetTemplateCache();
  revalidatePath("/admin/notifications");
}

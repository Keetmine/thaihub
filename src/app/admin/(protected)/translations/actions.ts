"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  CONTENT_DICT_DEFAULTS,
  CONTENT_DICT_KINDS,
  contentDictKey,
  type ContentDictKind,
} from "@/lib/contentDictionary";
import { CONTENT_DICT_TAG } from "@/lib/contentDictionary.server";

/**
 * Правка словаря повторяющихся значений (жанры, страны, занятия…).
 *
 * Хранится только то, что ОТЛИЧАЕТСЯ от значения по умолчанию: пустое
 * поле и текст, совпавший с дефолтом, удаляют строку. Иначе таблица
 * заросла бы копиями кода, и обновить дефолт стало бы нельзя — старая
 * копия перебивала бы его вечно.
 */
export async function saveContentTranslations(formData: FormData): Promise<void> {
  await requireCatalogEditor();

  const rawKind = String(formData.get("kind") ?? "");
  if (!CONTENT_DICT_KINDS.includes(rawKind as ContentDictKind)) return;
  const kind = rawKind as ContentDictKind;

  // Форма присылает пары «источник → перевод» одного вида: значения
  // приходят полем `ru:<источник>`, чтобы не заводить парные массивы и
  // не гадать о совпадении их порядка.
  const changed: string[] = [];
  for (const [field, value] of formData.entries()) {
    if (!field.startsWith("ru:")) continue;
    const source = contentDictKey(field.slice(3));
    if (!source) continue;
    const ru = String(value).trim();
    const isDefault = ru === (CONTENT_DICT_DEFAULTS[kind][source] ?? "");

    if (!ru || isDefault) {
      const removed = await prisma.contentTranslation.deleteMany({ where: { kind, source } });
      if (removed.count > 0) changed.push(source);
      continue;
    }
    const existing = await prisma.contentTranslation.findUnique({
      where: { kind_source: { kind, source } },
      select: { ru: true },
    });
    if (existing?.ru === ru) continue;
    await prisma.contentTranslation.upsert({
      where: { kind_source: { kind, source } },
      update: { ru },
      create: { kind, source, ru },
    });
    changed.push(source);
  }

  if (changed.length > 0) {
    await logAudit({
      action: "UPDATE",
      entityType: "ContentTranslation",
      entityId: kind,
      entityLabel: kind,
      note: `словарь: ${changed.slice(0, 20).join(", ")}${changed.length > 20 ? "…" : ""}`,
    });
  }

  // Кэш словаря живёт сутки — без сброса правка доехала бы до витрины
  // только завтра.
  // Второй аргумент — профиль сброса, как у CATALOG_TAG в lib/catalogCache.
  revalidateTag(CONTENT_DICT_TAG, "max");
  revalidatePath("/admin/translations");
}

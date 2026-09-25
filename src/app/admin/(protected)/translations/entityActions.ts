"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { invalidateCatalogCache } from "@/lib/catalogCache";
import {
  TRANSLATABLE_FIELDS,
  parseTranslations,
  translationColumns,
  type TranslatableEntity,
} from "@/lib/entityTranslations";

/**
 * Сохранение переводов одной записи каталога. Одна общая точка на все
 * пять сущностей: форма у них одинаковая (оригинал слева, перевод
 * справа), и пять копий этого экшена разъехались бы.
 */

/** Куда писать и что ревалидировать — по виду сущности. */
const TARGETS: Record<
  TranslatableEntity,
  {
    /** null у сериала: его переводы лежат колонками, json не читаем. */
    load: (id: string) => Promise<{ translations: unknown } | null>;
    save: (id: string, translations: unknown) => Promise<unknown>;
    /** Запись в настоящие колонки (`titleRu`…) — только у сериала. */
    saveColumns?: (id: string, values: Record<string, string | null>) => Promise<unknown>;
    adminPath: (id: string) => string;
    label: string;
  }
> = {
  drama: {
    // json у сериала не используется — грузим заглушку, чтобы общий
    // код не расходился на две ветки ради одной сущности.
    load: async (id) =>
      (await prisma.drama.findUnique({ where: { id }, select: { id: true } }))
        ? { translations: null }
        : null,
    save: async () => undefined,
    saveColumns: (id, values) => prisma.drama.update({ where: { id }, data: values }),
    adminPath: (id) => `/admin/dramas/${id}/edit`,
    label: "Drama",
  },
  performer: {
    load: (id) => prisma.performer.findUnique({ where: { id }, select: { translations: true } }),
    save: (id, translations) =>
      prisma.performer.update({ where: { id }, data: { translations: translations as never } }),
    adminPath: (id) => `/admin/performers/${id}/edit`,
    label: "Performer",
  },
  event: {
    load: (id) => prisma.event.findUnique({ where: { id }, select: { translations: true } }),
    save: (id, translations) =>
      prisma.event.update({ where: { id }, data: { translations: translations as never } }),
    adminPath: (id) => `/admin/events/${id}/edit`,
    label: "Event",
  },
  location: {
    load: (id) => prisma.location.findUnique({ where: { id }, select: { translations: true } }),
    save: (id, translations) =>
      prisma.location.update({ where: { id }, data: { translations: translations as never } }),
    adminPath: (id) => `/admin/locations/${id}/edit`,
    label: "Location",
  },
  novel: {
    load: (id) => prisma.novel.findUnique({ where: { id }, select: { translations: true } }),
    save: (id, translations) =>
      prisma.novel.update({ where: { id }, data: { translations: translations as never } }),
    adminPath: (id) => `/admin/novels/${id}/edit`,
    label: "Novel",
  },
  agency: {
    load: (id) => prisma.agency.findUnique({ where: { id }, select: { translations: true } }),
    save: (id, translations) =>
      prisma.agency.update({ where: { id }, data: { translations: translations as never } }),
    adminPath: (id) => `/admin/agencies/${id}/edit`,
    label: "Agency",
  },
};

export async function saveEntityTranslations(formData: FormData): Promise<void> {
  await requireCatalogEditor();

  const entity = String(formData.get("entity") ?? "") as TranslatableEntity;
  const id = String(formData.get("id") ?? "");
  const target = TARGETS[entity];
  if (!target || !id) return;

  const row = await target.load(id);
  if (!row) return;

  // Переписываем ТОЛЬКО русскую половину: другие языки (если появятся)
  // и незнакомые ключи из json трогать нельзя — форма про них не знает.
  const all = parseTranslations(row.translations);
  const ru: Record<string, string | string[]> = {};
  for (const field of TRANSLATABLE_FIELDS[entity]) {
    // Поля, которого в форме нет вовсе, не трогаем — переносим как было.
    // Факты артиста правятся в форме артиста строка к строке (правка
    // владельца 2026-09-26), и вкладка перевода их не показывает: без
    // этого каждое её сохранение стирало бы русские факты.
    if (!formData.has(`ru:${field.name}`)) {
      const kept = all.ru?.[field.name];
      if (kept != null && kept !== "" && !(Array.isArray(kept) && kept.length === 0)) {
        ru[field.name] = kept as string | string[];
      }
      continue;
    }
    const raw = String(formData.get(`ru:${field.name}`) ?? "").trim();
    if (!raw) continue;
    // Списки (факты, клипы) — по строке на пункт, как в остальных
    // формах админки с многострочными полями.
    ru[field.name] =
      field.kind === "list"
        ? raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : raw;
  }

  if (target.saveColumns) {
    // Сериал: перевод — настоящие колонки (`titleRu`, `synopsisRu`).
    await target.saveColumns(id, translationColumns(entity, ru));
  } else {
    const next = { ...all, ru };
    // Пустой перевод — это отсутствие перевода: не держим `{ ru: {} }`,
    // чтобы «переведено 0 из 5» считалось одинаково и до, и после правки.
    const cleaned = Object.keys(ru).length > 0 ? next : { ...all, ru: undefined };
    await target.save(id, cleaned);
  }

  await logAudit({
    action: "UPDATE",
    entityType: target.label,
    entityId: id,
    entityLabel: id,
    note: `перевод: ${Object.keys(ru).join(", ") || "очищен"}`,
  });

  // Витрина кэширует списки каталога — перевод должен доехать сразу.
  invalidateCatalogCache();
  revalidatePath(target.adminPath(id));
}

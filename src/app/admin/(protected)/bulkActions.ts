"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { DramaStatus } from "@/generated/prisma/client";
import { DRAMA_STATUS_LABELS } from "@/lib/dramaStatus";

// Массовые действия над списками каталога. Всё, что здесь делается,
// пишется в историю правок одной строкой BULK (см. src/lib/audit.ts) —
// иначе разом удалённые два десятка карточек не оставили бы следа.

export type BulkEntity = "performer" | "drama" | "event" | "location" | "novel" | "agency";

const ENTITY_META: Record<
  BulkEntity,
  { auditType: string; titleField: "name" | "title"; paths: string[] }
> = {
  performer: { auditType: "Performer", titleField: "name", paths: ["/admin/performers", "/performers"] },
  drama: { auditType: "Drama", titleField: "title", paths: ["/admin/dramas", "/dramas"] },
  event: { auditType: "Event", titleField: "title", paths: ["/admin/events", "/"] },
  location: { auditType: "Location", titleField: "name", paths: ["/admin/locations", "/locations"] },
  novel: { auditType: "Novel", titleField: "title", paths: ["/admin/novels", "/novels"] },
  agency: { auditType: "Agency", titleField: "name", paths: ["/admin/performers", "/agencies"] },
};

async function labelsFor(entity: BulkEntity, ids: string[]): Promise<string[]> {
  const where = { id: { in: ids } };
  switch (entity) {
    case "performer":
      return (await prisma.performer.findMany({ where, select: { name: true } })).map((r) => r.name);
    case "drama":
      return (await prisma.drama.findMany({ where, select: { title: true } })).map((r) => r.title);
    case "event":
      return (await prisma.event.findMany({ where, select: { title: true } })).map((r) => r.title);
    case "location":
      return (await prisma.location.findMany({ where, select: { name: true } })).map((r) => r.name);
    case "novel":
      return (await prisma.novel.findMany({ where, select: { title: true } })).map((r) => r.title);
    case "agency":
      return (await prisma.agency.findMany({ where, select: { name: true } })).map((r) => r.name);
  }
}

/** Короткая сводка для истории: первые пять названий и «ещё N». */
function summarize(labels: string[]): string {
  const head = labels.slice(0, 5).join(", ");
  return labels.length > 5 ? `${head} и ещё ${labels.length - 5}` : head;
}

export async function bulkDelete(entity: BulkEntity, ids: string[]): Promise<void> {
  await requireCatalogEditor();
  if (ids.length === 0) return;
  const meta = ENTITY_META[entity];
  const labels = await labelsFor(entity, ids);

  const where = { id: { in: ids } };
  switch (entity) {
    case "performer":
      await prisma.performer.deleteMany({ where });
      break;
    case "drama":
      await prisma.drama.deleteMany({ where });
      break;
    case "event":
      await prisma.event.deleteMany({ where });
      break;
    case "location":
      await prisma.location.deleteMany({ where });
      break;
    case "novel":
      await prisma.novel.deleteMany({ where });
      break;
    case "agency":
      await prisma.agency.deleteMany({ where });
      break;
  }

  await logAudit({
    action: "BULK",
    entityType: meta.auditType,
    // У массового действия нет одной записи-владельца — id первой строки
    // просто даёт ссылке куда указывать, смысл несёт note.
    entityId: ids[0],
    entityLabel: `${ids.length} записей`,
    note: `удалено: ${summarize(labels)}`,
  });
  for (const p of meta.paths) revalidatePath(p);
}

/** Перевесить выбранных исполнителей на другое агентство. Заменяет их
 *  текущие привязки: массовое действие для разбора импорта, где артисты
 *  осели не в том лейбле. */
export async function bulkSetPerformerAgency(ids: string[], agencyId: string): Promise<void> {
  await requireCatalogEditor();
  if (ids.length === 0 || !agencyId) return;
  const [agency, labels] = await Promise.all([
    prisma.agency.findUnique({ where: { id: agencyId }, select: { name: true } }),
    labelsFor("performer", ids),
  ]);
  if (!agency) throw new Error("Агентство не найдено");

  await prisma.$transaction([
    prisma.performerAgency.deleteMany({ where: { performerId: { in: ids } } }),
    prisma.performerAgency.createMany({
      data: ids.map((performerId) => ({ performerId, agencyId })),
      skipDuplicates: true,
    }),
  ]);

  await logAudit({
    action: "BULK",
    entityType: "Performer",
    entityId: ids[0],
    entityLabel: `${ids.length} исполнителей`,
    note: `агентство → «${agency.name}»: ${summarize(labels)}`,
  });
  revalidatePath("/admin/performers");
  revalidatePath("/artists");
  revalidatePath(`/agencies/${agencyId}`);
}

const DRAMA_STATUSES = Object.keys(DRAMA_STATUS_LABELS) as DramaStatus[];

export async function bulkSetDramaStatus(ids: string[], status: string): Promise<void> {
  await requireCatalogEditor();
  if (ids.length === 0) return;
  if (!DRAMA_STATUSES.includes(status as DramaStatus)) {
    throw new Error("Неизвестный статус");
  }
  const labels = await labelsFor("drama", ids);
  await prisma.drama.updateMany({ where: { id: { in: ids } }, data: { status: status as DramaStatus } });
  await logAudit({
    action: "BULK",
    entityType: "Drama",
    entityId: ids[0],
    entityLabel: `${ids.length} сериалов`,
    note: `статус → ${DRAMA_STATUS_LABELS[status as DramaStatus]}: ${summarize(labels)}`,
  });
  revalidatePath("/admin/dramas");
  revalidatePath("/dramas");
}

/** Сменить агентство-производителя у выбранных сериалов (и основное
 *  поле, и таблицу связей — их читают разные экраны). */
export async function bulkSetDramaAgency(ids: string[], agencyId: string): Promise<void> {
  await requireCatalogEditor();
  if (ids.length === 0 || !agencyId) return;
  const [agency, labels] = await Promise.all([
    prisma.agency.findUnique({ where: { id: agencyId }, select: { name: true } }),
    labelsFor("drama", ids),
  ]);
  if (!agency) throw new Error("Агентство не найдено");

  await prisma.$transaction([
    prisma.drama.updateMany({ where: { id: { in: ids } }, data: { agencyId } }),
    prisma.dramaAgency.deleteMany({ where: { dramaId: { in: ids } } }),
    prisma.dramaAgency.createMany({
      data: ids.map((dramaId) => ({ dramaId, agencyId })),
      skipDuplicates: true,
    }),
  ]);

  await logAudit({
    action: "BULK",
    entityType: "Drama",
    entityId: ids[0],
    entityLabel: `${ids.length} сериалов`,
    note: `агентство → «${agency.name}»: ${summarize(labels)}`,
  });
  revalidatePath("/admin/dramas");
  revalidatePath("/dramas");
}

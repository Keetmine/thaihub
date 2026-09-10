"use server";

import { revalidatePath } from "next/cache";
import { pairingLabel } from "@/lib/pairingLabel";
import { prisma } from "@/lib/prisma";
import type { PairingStatus } from "@/generated/prisma/client";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PAIRING_STATUS_LABELS } from "./pairingStatus";

export async function createPairing(formData: FormData) {
  await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const performerAId = String(formData.get("performerAId") ?? "").trim();
  const performerBId = String(formData.get("performerBId") ?? "").trim();
  const status: PairingStatus = formData.get("status") === "PAST" ? "PAST" : "CURRENT";

  if (!performerAId || !performerBId) {
    throw new Error("Выберите обоих исполнителей");
  }
  if (performerAId === performerBId) {
    throw new Error("Пейринг должен состоять из двух разных исполнителей");
  }

  const [performerAIdSorted, performerBIdSorted] = [performerAId, performerBId].sort();

  try {
    await prisma.pairing.create({
      data: {
        name: name || null,
        status,
        performerAId: performerAIdSorted,
        performerBId: performerBIdSorted,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new Error("Такой пейринг уже существует");
    }
    throw error;
  }

  revalidatePath("/admin/pairings");
  revalidatePath("/admin/events");
  revalidatePath("/admin/events/new");
}

export async function deletePairing(id: string) {
  await requireCatalogEditor();
  await prisma.pairing.delete({ where: { id } });
  revalidatePath("/admin/pairings");
  revalidatePath("/admin/events");
}

export async function setPairingStatus(id: string, status: PairingStatus) {
  await requireCatalogEditor();
  const pairing = await prisma.pairing.update({ where: { id }, data: { status } });
  revalidatePath("/admin/pairings");
  revalidatePath("/admin/performers");
  revalidatePath(`/performers/${pairing.performerAId}`);
  revalidatePath(`/performers/${pairing.performerBId}`);
}

/** Меняет A и B местами — порядок в названии важен (TAY × New, а не
 *  New × TAY): везде пара выводится как «A × B». */
export async function swapPairingOrder(id: string): Promise<void> {
  await requireCatalogEditor();
  const pairing = await prisma.pairing.findUnique({ where: { id } });
  if (!pairing) throw new Error("Пейринг не найден");
  await prisma.pairing.update({
    where: { id },
    data: { performerAId: pairing.performerBId, performerBId: pairing.performerAId },
  });
  revalidatePath("/admin/pairings");
  revalidatePath("/artists");
}

// Массовые действия списка (BulkList). Живут здесь, а не в общем
// bulkActions.ts: там каталожные сущности с одним полем-названием, а у
// пейринга подписи нет вовсе — она собирается из имён обоих участников.

/** Пейринги выбранных строк вместе с участниками: имена нужны и для
 *  записи в историю, и чтобы сбросить кэш страниц обоих артистов. */
async function loadPairings(ids: string[]) {
  return prisma.pairing.findMany({
    where: { id: { in: ids } },
    select: {
      name: true,
      performerAId: true,
      performerBId: true,
      performerA: { select: { name: true } },
      performerB: { select: { name: true } },
    },
  });
}

type LoadedPairing = Awaited<ReturnType<typeof loadPairings>>[number];

/** Короткая сводка для истории: первые пять названий и «ещё N» — как в
 *  общем bulkActions.ts, история читается одинаково везде. */
function summarize(labels: string[]): string {
  const head = labels.slice(0, 5).join(", ");
  return labels.length > 5 ? `${head} и ещё ${labels.length - 5}` : head;
}

/** Сбрасывает страницы обоих участников: пейринг виден на карточке
 *  артиста, и после массовой правки они бы висели со старым составом. */
function revalidatePairingPages(rows: LoadedPairing[]): void {
  revalidatePath("/admin/pairings");
  revalidatePath("/admin/performers");
  for (const p of rows) {
    revalidatePath(`/performers/${p.performerAId}`);
    revalidatePath(`/performers/${p.performerBId}`);
  }
}

export async function bulkDeletePairings(ids: string[]): Promise<void> {
  await requireCatalogEditor();
  if (ids.length === 0) return;
  const rows = await loadPairings(ids);
  await prisma.pairing.deleteMany({ where: { id: { in: ids } } });

  await logAudit({
    action: "BULK",
    entityType: "Pairing",
    // У массового действия нет одной записи-владельца — id первой строки
    // просто даёт ссылке куда указывать, смысл несёт note.
    entityId: ids[0],
    entityLabel: `${ids.length} пейрингов`,
    note: `удалено: ${summarize(rows.map(pairingLabel))}`,
  });
  revalidatePairingPages(rows);
  revalidatePath("/admin/events");
}

export async function bulkSetPairingStatus(ids: string[], status: string): Promise<void> {
  await requireCatalogEditor();
  if (ids.length === 0) return;
  if (!(status in PAIRING_STATUS_LABELS)) throw new Error("Неизвестный статус");
  const next = status as PairingStatus;
  const rows = await loadPairings(ids);
  await prisma.pairing.updateMany({ where: { id: { in: ids } }, data: { status: next } });

  await logAudit({
    action: "BULK",
    entityType: "Pairing",
    entityId: ids[0],
    entityLabel: `${ids.length} пейрингов`,
    note: `статус → ${PAIRING_STATUS_LABELS[next]}: ${summarize(rows.map(pairingLabel))}`,
  });
  revalidatePairingPages(rows);
}

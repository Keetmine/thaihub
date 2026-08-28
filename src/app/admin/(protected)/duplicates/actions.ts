"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { mergeDramas, mergePerformers } from "@/lib/duplicates";
import { requireAdmin } from "@/lib/auth";

/** И5: «не сливать» — скрыть группу из списка дублей. Ремейк с тем же
 *  названием или тёзки — не дубли, но раньше убрать их было нельзя.
 *  Обратимо (restore ниже), поэтому без подтверждения. */
export async function dismissDuplicateGroupAction(
  entityType: "drama" | "performer",
  memberKey: string,
): Promise<void> {
  await requireAdmin();
  await prisma.duplicateDismissal.upsert({
    where: { entityType_memberKey: { entityType, memberKey } },
    create: { entityType, memberKey },
    update: {},
  });
  revalidatePath("/admin/duplicates");
}

export async function restoreDuplicateGroupAction(
  entityType: "drama" | "performer",
  memberKey: string,
): Promise<void> {
  await requireAdmin();
  await prisma.duplicateDismissal.deleteMany({ where: { entityType, memberKey } });
  revalidatePath("/admin/duplicates");
}

export async function mergeDramasAction(keeperId: string, loserIds: string[]) {
  await requireAdmin();
  await mergeDramas(keeperId, loserIds);
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/dramas");
  revalidatePath("/dramas");
  clearComparison();
}

export async function mergePerformersAction(keeperId: string, loserIds: string[]) {
  await requireAdmin();
  await mergePerformers(keeperId, loserIds);
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/performers");
  revalidatePath("/artists");
  clearComparison();
}

/**
 * Сбрасывает сравнение после удачного слияния.
 *
 * Две сравниваемые записи живут в адресе (`?a=…&b=…`), и поля формы
 * заполняются из него же. После слияния проигравшая запись удалена —
 * страница перерисовывалась с теми же параметрами, не находила её и
 * писала «Не найдено: …» ровно про то, что человек только что успешно
 * слил. Поля при этом оставались заполненными, и перезагрузка не
 * помогала: состояние-то в адресе.
 *
 * `redirect` бросает исключение — поэтому вызывать его надо последним,
 * после revalidatePath.
 */
function clearComparison(): never {
  redirect("/admin/duplicates");
}

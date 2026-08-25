"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";

/**
 * Кнопка «Остановить» у идущего импорта. Прерывать прогон силой нельзя
 * — уже записанное в каталог должно остаться, — поэтому экшен только
 * поднимает флаг, а импорт замечает его между элементами и выходит сам
 * (checkImportCancelled в src/lib/importRun.ts). До этого массовый
 * импорт нельзя было ни остановить, ни переждать иначе как до конца
 * списка.
 */
export async function cancelImportRun(
  runId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCatalogEditor();

  // Только RUNNING: у завершённого прогона останавливать нечего, а
  // повторный клик по устаревшей странице не должен трогать историю.
  const { count } = await prisma.importRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: { cancelRequested: true },
  });

  revalidatePath("/admin/imports");

  if (count === 0) return { ok: false, error: "Этот импорт уже не выполняется" };
  return { ok: true };
}

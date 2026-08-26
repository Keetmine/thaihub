"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mergeDramas, mergePerformers } from "@/lib/duplicates";
import { requireAdmin } from "@/lib/auth";

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

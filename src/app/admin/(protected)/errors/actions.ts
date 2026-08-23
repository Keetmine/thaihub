"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function clearErrorLog(): Promise<void> {
  await requireAdmin();
  await prisma.errorLog.deleteMany({});
  revalidatePath("/admin/errors");
}

/** Удалить группу целиком: список показывает ошибки сгруппированными по
 *  digest (fallback — по message), и чистить их по одной записи стало
 *  бессмысленно. Ключ группы — пара digest+message, как в groupBy. */
export async function deleteErrorGroup(
  digest: string | null,
  message: string,
): Promise<void> {
  await requireAdmin();
  await prisma.errorLog.deleteMany({ where: { digest, message } });
  revalidatePath("/admin/errors");
}

/** Пометить все текущие ошибки разобранными: бейдж в сайдбаре считает
 *  только непросмотренные, иначе он горел бы вечно. */
export async function markErrorsReviewed(): Promise<void> {
  await requireAdmin();
  await prisma.errorLog.updateMany({
    where: { reviewedAt: null },
    data: { reviewedAt: new Date() },
  });
  revalidatePath("/admin/errors");
  revalidatePath("/admin");
}

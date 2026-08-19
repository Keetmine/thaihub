"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function clearErrorLog(): Promise<void> {
  await requireAdmin();
  await prisma.errorLog.deleteMany({});
  revalidatePath("/admin/errors");
}

export async function deleteErrorEntry(id: string): Promise<void> {
  await requireAdmin();
  await prisma.errorLog.delete({ where: { id } });
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

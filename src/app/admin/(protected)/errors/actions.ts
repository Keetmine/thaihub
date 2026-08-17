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

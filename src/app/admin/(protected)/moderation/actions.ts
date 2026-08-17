"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function resolveReport(id: string): Promise<void> {
  await requireAdmin();
  await prisma.report.update({ where: { id }, data: { status: "RESOLVED" } });
  revalidatePath("/admin/moderation");
}

export async function deleteReport(id: string): Promise<void> {
  await requireAdmin();
  await prisma.report.delete({ where: { id } });
  revalidatePath("/admin/moderation");
}

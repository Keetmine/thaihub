"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { FeedbackStatus } from "@/generated/prisma/client";

export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  await requireAdmin();
  await prisma.feedback.update({ where: { id }, data: { status } });
  revalidatePath("/admin/feedback");
}

export async function deleteFeedback(id: string): Promise<void> {
  await requireAdmin();
  await prisma.feedback.delete({ where: { id } });
  revalidatePath("/admin/feedback");
}

// Массовые действия для BulkList. Историю правок обращения не пишут —
// как и точечные кнопки выше: это не каталог, а входящая почта, и
// журнал правок про неё ничего не рассказывает.

const FEEDBACK_STATUSES: FeedbackStatus[] = ["NEW", "DONE"];

export async function bulkDeleteFeedback(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  await prisma.feedback.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/admin/feedback");
}

export async function bulkSetFeedbackStatus(ids: string[], status: string): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  // Статус приезжает строкой из <select> в панели — глазами по enum'у
  // его никто не проверит, поэтому сверяем сами.
  if (!FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
    throw new Error("Неизвестный статус");
  }
  await prisma.feedback.updateMany({
    where: { id: { in: ids } },
    data: { status: status as FeedbackStatus },
  });
  revalidatePath("/admin/feedback");
}

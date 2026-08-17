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

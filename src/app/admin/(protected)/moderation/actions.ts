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

/** Типы юзер-контента, которыми управляет очередь модерации. */
export type ModContentType =
  | "review"
  | "comment"
  | "note"
  | "placeList"
  | "artistList"
  | "place";

/** Удаление контента прямо из очереди модерации. */
export async function adminDeleteContent(type: ModContentType, id: string): Promise<void> {
  await requireAdmin();
  switch (type) {
    case "review":
      await prisma.review.delete({ where: { id } });
      break;
    case "comment":
      await prisma.comment.delete({ where: { id } });
      break;
    case "note":
      await prisma.eventNote.delete({ where: { id } });
      break;
    case "placeList":
      await prisma.placeList.delete({ where: { id } });
      break;
    case "artistList":
      await prisma.performerList.delete({ where: { id } });
      break;
    case "place":
      // Только своё место юзера — каталожные локации тут не трогаем.
      await prisma.location.deleteMany({ where: { id, createdByUserId: { not: null } } });
      break;
  }
  revalidatePath("/admin/moderation");
}

/** Правка текста контента (отзыв/комментарий/заметка) из модерации —
 *  например, вычистить ссылку или оскорбление, не удаляя запись. */
export async function adminUpdateContentText(
  type: ModContentType,
  id: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("Пустой текст — используйте удаление");
  switch (type) {
    case "review":
      await prisma.review.update({ where: { id }, data: { text } });
      break;
    case "comment":
      await prisma.comment.update({ where: { id }, data: { text } });
      break;
    case "note":
      await prisma.eventNote.update({ where: { id }, data: { text } });
      break;
    default:
      throw new Error("Этот тип контента не редактируется");
  }
  revalidatePath("/admin/moderation");
}

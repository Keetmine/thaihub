"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function resolveReport(id: string): Promise<void> {
  await requireAdmin();
  await prisma.report.update({ where: { id }, data: { status: "RESOLVED" } });
  revalidatePath("/admin/moderation");
}

/** Возврат разобранной жалобы в очередь: пометить «решено» можно
 *  случайно, а до появления истории жалоб отменить это было нечем. */
export async function reopenReport(id: string): Promise<void> {
  await requireAdmin();
  await prisma.report.update({ where: { id }, data: { status: "NEW" } });
  revalidatePath("/admin/moderation");
}

export async function deleteReport(id: string): Promise<void> {
  await requireAdmin();
  await prisma.report.delete({ where: { id } });
  revalidatePath("/admin/moderation");
}

/**
 * Типы юзер-контента, которыми управляет очередь модерации.
 *
 * Сообщества (АА25) тут же, а не своими экшенами: «админ сносит чужое»
 * должно жить в одном месте — вторая копия того же switch рано или
 * поздно разъедется с первой и начнёт, например, забывать про проверку
 * `communityId` у встречи.
 */
export type ModContentType =
  | "review"
  | "comment"
  | "note"
  | "placeList"
  | "artistList"
  | "place"
  | "community"
  | "communityPost"
  | "communityMeetup"
  | "communityLink";

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
    // Сообщества и их содержимое — deleteMany, а не delete: очередь
    // жалоб живёт долго, и объект по жалобе часто уже снесли сами
    // хозяева. «Удалить то, чего нет» должно быть безобидным, а не 500.
    case "community":
      await prisma.community.deleteMany({ where: { id } });
      break;
    case "communityPost":
      await prisma.communityPost.deleteMany({ where: { id } });
      break;
    case "communityMeetup":
      // Встреча — это Event со ссылкой на сообщество. Условие
      // `communityId: { not: null }` тут не формальность: без него
      // ошибочный id из жалобы снёс бы каталожное событие афиши.
      await prisma.event.deleteMany({ where: { id, communityId: { not: null } } });
      break;
    case "communityLink":
      await prisma.communityLink.deleteMany({ where: { id } });
      break;
  }
  revalidatePath("/admin/moderation");
  // Тем же действием обновляем админский раздел сообществ и витрину:
  // удалённое не должно висеть в списке до следующего жёсткого обновления.
  revalidatePath("/admin/communities");
  revalidatePath("/communities");
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

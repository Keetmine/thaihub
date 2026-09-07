"use server";

import { redirect } from "next/navigation";
import { adminDeleteContent } from "../moderation/actions";

/**
 * Удалить сообщество с карточки — и уйти обратно в список.
 *
 * Отдельная обёртка над общим `adminDeleteContent` нужна ровно ради
 * редиректа: карточка удалённого сообщества после обновления
 * превратилась бы в 404, и админ бы решил, что что-то сломалось, а не
 * что всё получилось. Само удаление — там же, где и всё остальное
 * админское удаление чужого контента (см. `ModContentType`).
 */
export async function adminDeleteCommunityAndReturn(id: string): Promise<void> {
  await adminDeleteContent("community", id);
  redirect("/admin/communities");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Отзывы и комментарии живут у трёх типов объектов — экшены общие,
 *  тип задаётся kind. path — страница для revalidate. */
export type ReviewKind = "drama" | "novel" | "event";

function targetWhere(kind: ReviewKind, id: string) {
  if (kind === "drama") return { dramaId: id };
  if (kind === "novel") return { novelId: id };
  return { eventId: id };
}

function pagePath(kind: ReviewKind, id: string): string {
  if (kind === "drama") return `/dramas/${id}`;
  if (kind === "novel") return `/novels/${id}`;
  return `/event/${id}`;
}

/** Сохранить (создать/обновить) свой отзыв: оценка 1–10 + текст.
 *  Пустой текст с оценкой допустим («только оценка» как на Кинопоиске —
 *  нет: у нас отзыв = оценка + текст, текст обязателен). */
export async function saveReview(kind: ReviewKind, id: string, formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rating = Number(formData.get("rating"));
  const text = String(formData.get("text") ?? "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) throw new Error("Оценка от 1 до 10");
  if (!text) throw new Error("Напишите текст отзыва");

  const where = targetWhere(kind, id);
  const existing = await prisma.review.findFirst({ where: { userId: user.id, ...where } });
  if (existing) {
    await prisma.review.update({ where: { id: existing.id }, data: { rating, text } });
  } else {
    await prisma.review.create({ data: { userId: user.id, ...where, rating, text } });
  }
  revalidatePath(pagePath(kind, id));
}

export async function deleteReview(kind: ReviewKind, id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.review.deleteMany({ where: { userId: user.id, ...targetWhere(kind, id) } });
  revalidatePath(pagePath(kind, id));
}

export async function addComment(kind: ReviewKind, id: string, formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("Пустой комментарий");
  if (text.length > 3000) throw new Error("Слишком длинный комментарий");
  await prisma.comment.create({ data: { userId: user.id, ...targetWhere(kind, id), text } });
  revalidatePath(pagePath(kind, id));
}

/** Удалить комментарий может автор или админ (модерация). */
export async function deleteComment(commentId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return;
  if (comment.userId !== user.id && !user.isAdmin) throw new Error("Нельзя удалить чужой комментарий");
  await prisma.comment.delete({ where: { id: commentId } });
  const kind: ReviewKind = comment.dramaId ? "drama" : comment.novelId ? "novel" : "event";
  revalidatePath(pagePath(kind, (comment.dramaId ?? comment.novelId ?? comment.eventId)!));
}

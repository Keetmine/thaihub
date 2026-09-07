"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { notifyUser } from "@/lib/notifications";
import { getT } from "@/lib/i18n";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action, и клиент видел generic error boundary
 *  вместо причины (см. promoActions.ts). */
export type ReviewActionResult = { ok: true } | { ok: false; error: string };

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

/**
 * Оценка из формы: шкала 0.5-10 с шагом 0.5 (правка владельца
 * 2026-09-07 — половинки, как у MyDramaList). Пусто или мусор — null:
 * для разделов это «не оценивал», для общей оценки вызывающий сам
 * превращает null в ошибку.
 */
function parseRating(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 10) return null;
  return Math.round(n * 2) / 2;
}

/** Сохранить (создать/обновить) свой отзыв: общая оценка + текст, плюс
 *  необязательные оценки по разделам (сюжет/актёры/музыка — набор
 *  зависит от типа записи). Текст обязателен: «только оценка» у нас не
 *  отзыв, для неё есть звёздочка на самом сериале (АА2). */
export async function saveReview(
  kind: ReviewKind,
  id: string,
  formData: FormData,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();

  const rating = parseRating(formData.get("rating"));
  const text = String(formData.get("text") ?? "").trim();
  if (rating == null) {
    return { ok: false, error: t.reviews.errors.ratingRange };
  }
  // Оценки по разделам необязательны (правка владельца 2026-09-07):
  // пустое поле — «не оценивал этот раздел», а не ноль.
  const ratingStory = parseRating(formData.get("ratingStory"));
  const ratingActing = parseRating(formData.get("ratingActing"));
  const ratingMusic = parseRating(formData.get("ratingMusic"));
  if (!text) return { ok: false, error: t.reviews.errors.textRequired };

  // Чекбокс «Виден только мне»: приватный отзыв видит только автор, в
  // средний рейтинг он не входит. Автор проверяется самой выборкой —
  // update идёт только в свою строку (existing ищется по userId).
  const isPrivate = formData.get("isPrivate") === "on";

  const where = targetWhere(kind, id);
  const existing = await prisma.review.findFirst({ where: { userId: user.id, ...where } });
  const data = { rating, ratingStory, ratingActing, ratingMusic, text, isPrivate };
  if (existing) {
    await prisma.review.update({ where: { id: existing.id }, data });
  } else {
    await prisma.review.create({ data: { userId: user.id, ...where, ...data } });
  }
  revalidatePath(pagePath(kind, id));
  return { ok: true };
}

export async function deleteReview(kind: ReviewKind, id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.review.deleteMany({ where: { userId: user.id, ...targetWhere(kind, id) } });
  revalidatePath(pagePath(kind, id));
}

export async function addComment(
  kind: ReviewKind,
  id: string,
  formData: FormData,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: t.reviews.errors.emptyComment };
  if (text.length > 3000) return { ok: false, error: t.reviews.errors.tooLongComment };

  // Ответ: один уровень вложенности — ответ на ответ прикрепляется к корню.
  let parentId: string | null = String(formData.get("parentId") ?? "").trim() || null;
  let parentAuthor: { id: string; telegramId: string | null; name: string | null } | null = null;
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, ...targetWhere(kind, id) },
      include: { user: { select: { id: true, telegramId: true, name: true } } },
    });
    if (!parent) return { ok: false, error: t.reviews.errors.parentNotFound };
    parentId = parent.parentId ?? parent.id;
    parentAuthor = parent.user;
  }

  await prisma.comment.create({
    data: { userId: user.id, ...targetWhere(kind, id), parentId, text },
  });

  // Автору родителя — уведомление на сайте (и в Telegram, если привязан).
  if (parentAuthor) {
    await notifyUser({
      userId: parentAuthor.id,
      actorId: user.id,
      kind: "COMMENT_REPLY",
      actorName: user.name,
      body: text.slice(0, 200),
      href: pagePath(kind, id),
    });
  }
  revalidatePath(pagePath(kind, id));
  return { ok: true };
}

/** Лайк/анлайк комментария. Возвращает новое число лайков. */
export async function toggleCommentLike(commentId: string): Promise<{ liked: boolean; count: number }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const existing = await prisma.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId: user.id } },
  });
  if (existing) {
    await prisma.commentLike.delete({ where: { commentId_userId: { commentId, userId: user.id } } });
  } else {
    await prisma.commentLike.create({ data: { commentId, userId: user.id } });
    // Автору — только на сайте: лайки идут потоком, в Telegram это был
    // бы спам (см. TELEGRAM_KINDS в lib/notifications.ts).
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, text: true, dramaId: true, novelId: true, eventId: true },
    });
    if (comment) {
      await notifyUser({
        userId: comment.userId,
        actorId: user.id,
        kind: "COMMENT_LIKE",
        actorName: user.name,
        body: comment.text.slice(0, 120),
      });
    }
  }
  const count = await prisma.commentLike.count({ where: { commentId } });
  return { liked: !existing, count };
}

/** Удалить комментарий может автор или админ (модерация). */
export async function deleteComment(commentId: string): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return { ok: true };
  if (comment.userId !== user.id && !user.isAdmin) {
    return { ok: false, error: (await getT()).t.reviews.errors.cannotDeleteOthers };
  }
  await prisma.comment.delete({ where: { id: commentId } });
  // Комментарий к теме сообщества (АА25) живёт не на странице каталога:
  // у него нет ни dramaId, ни novelId, ни eventId, и общий pagePath
  // собрал бы путь из null. Обсуждения зовут свой deletePostComment
  // (там ещё и права шире — чужое убирают хозяева сообщества), но этот
  // экшен общий, и промахнуться путём он не должен.
  if (comment.postId) {
    const post = await prisma.communityPost.findUnique({
      where: { id: comment.postId },
      select: { community: { select: { id: true, slug: true } } },
    });
    if (post) revalidatePath(`/communities/${post.community.slug ?? post.community.id}`);
    return { ok: true };
  }
  const kind: ReviewKind = comment.dramaId ? "drama" : comment.novelId ? "novel" : "event";
  revalidatePath(pagePath(kind, (comment.dramaId ?? comment.novelId ?? comment.eventId)!));
  return { ok: true };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { performerNameWhere, performerOptionLabel } from "@/lib/searchWhere";
import { artistListHref } from "@/lib/slugHelpers";
import type { TripVisibility } from "@/generated/prisma/client";
import { isPremiumActive } from "@/lib/premium";
import { getLocale, getT, localeHref } from "@/lib/i18n";

// Кастомные списки актёров («пил пиво», «видела вживую»…) — публичный
// (не админский) функционал: владелец распоряжается только своими
// списками, каждая мутация перепроверяет userId.

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

async function requireOwnList(listId: string) {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: t.lists.errors.signInRequired };
  const list = await prisma.performerList.findFirst({
    where: { id: listId, userId: user.id },
  });
  if (!list) return { ok: false as const, error: t.lists.errors.listNotFound };
  return { ok: true as const, user, list };
}

export async function createPerformerList(formData: FormData): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  // Новые списки — платные (кнопка скрыта в интерфейсе, но экшен
  // вызывается напрямую). Уже созданные списки остаются доступны их
  // владельцам независимо от подписки.
  if (!isPremiumActive(user)) redirect(localeHref("/calendar", locale));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: t.lists.errors.listTitleRequired };
  const description = String(formData.get("description") ?? "").trim();

  const list = await prisma.performerList.create({
    data: { userId: user.id, title, description: description || null },
  });
  revalidatePath("/lists");
  redirect(localeHref(artistListHref(list), locale));
}

export async function updatePerformerList(
  listId: string,
  formData: FormData,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own.ok) return own;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: (await getT()).t.lists.errors.listTitleRequired };
  const description = String(formData.get("description") ?? "").trim();
  await prisma.performerList.update({
    where: { id: listId },
    data: { title, description: description || null },
  });
  revalidatePath("/lists");
  return { ok: true };
}

export async function deletePerformerList(listId: string): Promise<ActionError | void> {
  const own = await requireOwnList(listId);
  if (!own.ok) return own;
  await prisma.performerList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  redirect(localeHref("/lists", await getLocale()));
}

export async function setPerformerListVisibility(
  listId: string,
  visibility: TripVisibility,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own.ok) return own;
  await prisma.performerList.update({ where: { id: listId }, data: { visibility } });
  revalidatePath("/lists");
  return { ok: true };
}

export async function addPerformerToList(
  listId: string,
  performerId: string,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own.ok) return own;
  const max = await prisma.performerListItem.aggregate({
    where: { listId },
    _max: { position: true },
  });
  await prisma.performerListItem.upsert({
    where: { listId_performerId: { listId, performerId } },
    create: { listId, performerId, position: (max._max.position ?? 0) + 1 },
    update: {},
  });
  revalidatePath("/lists");
  return { ok: true };
}

export async function removePerformerFromList(
  listId: string,
  performerId: string,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own.ok) return own;
  await prisma.performerListItem.deleteMany({ where: { listId, performerId } });
  revalidatePath("/lists");
  return { ok: true };
}

/** Поиск актёров для добавления в список (доступен любому залогиненному).
 *  Анониму — пустой список, а не ошибка: комбобоксы показываются только
 *  залогиненным, а бросок в проде превращался в generic error boundary. */
export async function searchPerformersForList(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.performer.findMany({
    where: performerNameWhere(q),
    select: { id: true, name: true, realName: true, photoUrl: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return rows.map((p) => ({ id: p.id, name: performerOptionLabel(p), photoUrl: p.photoUrl }));
}

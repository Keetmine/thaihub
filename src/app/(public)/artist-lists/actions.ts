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

async function requireOwnList(listId: string) {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) throw new Error(t.lists.errors.signInRequired);
  const list = await prisma.performerList.findFirst({
    where: { id: listId, userId: user.id },
  });
  if (!list) throw new Error(t.lists.errors.listNotFound);
  return { user, list };
}

export async function createPerformerList(formData: FormData) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  // Новые списки — платные (кнопка скрыта в интерфейсе, но экшен
  // вызывается напрямую). Уже созданные списки остаются доступны их
  // владельцам независимо от подписки.
  if (!isPremiumActive(user)) redirect(localeHref("/calendar", locale));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error(t.lists.errors.listTitleRequired);
  const description = String(formData.get("description") ?? "").trim();

  const list = await prisma.performerList.create({
    data: { userId: user.id, title, description: description || null },
  });
  revalidatePath("/lists");
  redirect(localeHref(artistListHref(list), locale));
}

export async function updatePerformerList(listId: string, formData: FormData) {
  await requireOwnList(listId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error((await getT()).t.lists.errors.listTitleRequired);
  const description = String(formData.get("description") ?? "").trim();
  await prisma.performerList.update({
    where: { id: listId },
    data: { title, description: description || null },
  });
  revalidatePath("/lists");
}

export async function deletePerformerList(listId: string) {
  await requireOwnList(listId);
  await prisma.performerList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  redirect(localeHref("/lists", await getLocale()));
}

export async function setPerformerListVisibility(
  listId: string,
  visibility: TripVisibility,
): Promise<void> {
  await requireOwnList(listId);
  await prisma.performerList.update({ where: { id: listId }, data: { visibility } });
  revalidatePath("/lists");
}

export async function addPerformerToList(listId: string, performerId: string): Promise<void> {
  await requireOwnList(listId);
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
}

export async function removePerformerFromList(listId: string, performerId: string): Promise<void> {
  await requireOwnList(listId);
  await prisma.performerListItem.deleteMany({ where: { listId, performerId } });
  revalidatePath("/lists");
}

/** Поиск актёров для добавления в список (доступен любому залогиненному). */
export async function searchPerformersForList(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error((await getT()).t.lists.errors.signInRequired);
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

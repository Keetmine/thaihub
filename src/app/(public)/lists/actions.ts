"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import type { TripVisibility } from "@/generated/prisma/client";

function parseVisibility(raw: unknown): TripVisibility {
  return raw === "PUBLIC" || raw === "FRIENDS" ? raw : "PRIVATE";
}

async function requireOwnList(listId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list || list.userId !== user.id) throw new Error("Список не найден");
  return { user, list };
}

export async function createPlaceList(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) throw new Error("Укажите название списка");

  const list = await prisma.placeList.create({
    data: {
      userId: user.id,
      title,
      description: description || null,
      visibility: parseVisibility(formData.get("visibility")),
    },
  });
  revalidatePath("/lists");
  redirect(`/lists/${list.id}`);
}

export async function deletePlaceList(listId: string) {
  await requireOwnList(listId);
  await prisma.placeList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  redirect("/lists");
}

export async function setPlaceListVisibility(listId: string, visibility: string) {
  const { list } = await requireOwnList(listId);
  await prisma.placeList.update({
    where: { id: list.id },
    data: { visibility: parseVisibility(visibility) },
  });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
}

export async function addPlaceToList(listId: string, locationId: string) {
  const { list } = await requireOwnList(listId);
  await prisma.placeListItem.upsert({
    where: { listId_locationId: { listId: list.id, locationId } },
    update: {},
    create: { listId: list.id, locationId },
  });
  revalidatePath(`/lists/${listId}`);
}

export async function removePlaceFromList(listId: string, locationId: string) {
  const { list } = await requireOwnList(listId);
  await prisma.placeListItem.deleteMany({ where: { listId: list.id, locationId } });
  revalidatePath(`/lists/${listId}`);
}

export async function setPlaceNote(listId: string, locationId: string, formData: FormData) {
  const { list } = await requireOwnList(listId);
  const note = String(formData.get("note") ?? "").trim();
  await prisma.placeListItem.updateMany({
    where: { listId: list.id, locationId },
    data: { note: note || null },
  });
  revalidatePath(`/lists/${listId}`);
}

/** Асинхронный поиск локаций для комбобоксов (каталог локаций растёт —
 *  тот же паттерн, что searchPerformerOptions). */
export async function searchLocationOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.location.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

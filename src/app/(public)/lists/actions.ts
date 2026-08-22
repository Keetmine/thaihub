"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import type { TripVisibility } from "@/generated/prisma/client";
import { resolveMapsCoords, resolveMapsCoordsViaHttp } from "@/lib/blscene";
import { isLocationCategory } from "@/lib/locationCategories";

function parseVisibility(raw: unknown): TripVisibility {
  return raw === "PUBLIC" || raw === "FRIENDS" ? raw : "PRIVATE";
}

// Координаты из maps-ссылки пользователя. Сначала дешёвый HTTP-резолв
// (редиректы коротких ссылок часто несут координаты прямо в URL);
// браузер — только fallback для ссылок формата ?q=адрес&ftid=…, и
// строго по одному: параллельные клики выстраиваются в очередь, чтобы
// несколько Chromium (~250 МБ каждый) не уронили веб-процесс по памяти.
let mapsBrowserQueue: Promise<unknown> = Promise.resolve();

async function resolveUserMapsCoords(url: string) {
  const viaHttp = await resolveMapsCoordsViaHttp(url);
  if (viaHttp) return viaHttp;

  const task = mapsBrowserQueue.then(async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      return await resolveMapsCoords(url, browser);
    } finally {
      await browser.close();
    }
  });
  mapsBrowserQueue = task.catch(() => {});
  return task;
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
  const user = await getCurrentUser();
  return prisma.location.findMany({
    where: {
      // Ищем и по названию места, и по названию сериала, который там
      // снимали («кафе из Bad Buddy» находится по «bad buddy»).
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { dramas: { some: { drama: { title: { contains: q, mode: "insensitive" } } } } },
      ],
      // Каталог + собственные места искателя (чужие пользовательские не
      // показываем).
      AND: [{ OR: [{ createdByUserId: null }, ...(user ? [{ createdByUserId: user.id }] : [])] }],
    },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/**
 * Создание своего места (не из каталога дорам) сразу в список: название +
 * ссылка Google Maps ИЛИ голые координаты «13.75, 100.50». Длинные
 * maps-ссылки несут координаты в URL (regex), короткие maps.app.goo.gl
 * резолвятся через resolveUserMapsCoords (HTTP-редиректы, браузер — в
 * крайнем случае и по одному). Такое место помечено createdByUserId и в
 * общий каталог локаций не попадает.
 */
export async function createOwnPlace(listId: string, formData: FormData) {
  const { user, list } = await requireOwnList(listId);

  const name = String(formData.get("name") ?? "").trim();
  const mapsInput = String(formData.get("mapsUrl") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  if (!name) throw new Error("Укажите название места");

  let coords: { lat: number; lng: number } | null = null;
  if (mapsInput) {
    // Голые координаты «13.7563, 100.5018» — без похода куда-либо.
    const raw = mapsInput.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (raw) {
      coords = { lat: parseFloat(raw[1]), lng: parseFloat(raw[2]) };
    } else {
      coords = await resolveUserMapsCoords(mapsInput);
    }
  }

  const rawCategory = String(formData.get("category") ?? "").trim();
  const location = await prisma.location.create({
    data: {
      name,
      createdByUserId: user.id,
      photoUrl: photoUrl || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      category: rawCategory && isLocationCategory(rawCategory) ? rawCategory : null,
    },
  });
  await prisma.placeListItem.create({
    data: { listId: list.id, locationId: location.id, note: note || null },
  });
  revalidatePath(`/lists/${listId}`);
}

/** Редактирование названия/описания списка. */
export async function updatePlaceList(listId: string, formData: FormData) {
  const { list } = await requireOwnList(listId);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) throw new Error("Укажите название списка");
  await prisma.placeList.update({
    where: { id: list.id },
    data: { title, description: description || null },
  });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
}

/** Редактирование СВОЕГО места (созданного пользователем): название,
 *  фото, ссылка/координаты. Каталожные локации отсюда не редактируются. */
export async function updateOwnPlace(locationId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.createdByUserId !== user.id) throw new Error("Место не найдено");

  const name = String(formData.get("name") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const mapsInput = String(formData.get("mapsUrl") ?? "").trim();
  if (!name) throw new Error("Укажите название места");

  let coords: { lat: number; lng: number } | null = null;
  if (mapsInput) {
    const raw = mapsInput.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (raw) coords = { lat: parseFloat(raw[1]), lng: parseFloat(raw[2]) };
    else coords = await resolveUserMapsCoords(mapsInput);
  }

  const rawCategory = String(formData.get("category") ?? "").trim();
  await prisma.location.update({
    where: { id: locationId },
    data: {
      name,
      photoUrl: photoUrl || null,
      category: rawCategory && isLocationCategory(rawCategory) ? rawCategory : null,
      ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
    },
  });
  revalidatePath("/lists");
}

/** Перестановка места в списке кнопками вверх/вниз: перечитываем текущий
 *  порядок, свапаем соседей и переписываем position всем подряд —
 *  надёжнее, чем жонглировать парой значений при position-дефолте 0. */
export async function movePlaceInList(listId: string, locationId: string, direction: "up" | "down") {
  const { list } = await requireOwnList(listId);
  const items = await prisma.placeListItem.findMany({
    where: { listId: list.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const idx = items.findIndex((i) => i.locationId === locationId);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= items.length) return;
  [items[idx], items[target]] = [items[target], items[idx]];
  await prisma.$transaction(
    items.map((item, i) =>
      prisma.placeListItem.update({
        where: { listId_locationId: { listId: list.id, locationId: item.locationId } },
        data: { position: i },
      }),
    ),
  );
  revalidatePath(`/lists/${listId}`);
}

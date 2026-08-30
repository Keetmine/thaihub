"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import type { TripVisibility } from "@/generated/prisma/client";
import { isLocationCategory } from "@/lib/locationCategories";
import { canUseLocation, createOwnLocation, resolveUserMapsCoords } from "@/lib/ownLocation";
import { getLocale, getT, localeHref } from "@/lib/i18n";

function parseVisibility(raw: unknown): TripVisibility {
  return raw === "PUBLIC" || raw === "FRIENDS" ? raw : "PRIVATE";
}

/** Ошибки валидации/доступа возвращаются значением, а не броском: в
 *  проде Next минифицирует текст исключения из server action, и клиент
 *  видит generic error boundary вместо причины (см. promoActions.ts).
 *  Экшены, которые при успехе делают redirect, типизированы как
 *  `ActionError | void` — успешная ветка до return не доходит. */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

/** Список текущего юзера или null (нет/чужой) — вызывающий экшен
 *  превращает null в `{ ok: false, error: "Список не найден" }`. */
async function requireOwnList(listId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list || list.userId !== user.id) return null;
  return { user, list };
}

export async function createPlaceList(formData: FormData): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return { ok: false, error: t.lists.errors.listTitleRequired };

  const list = await prisma.placeList.create({
    data: {
      userId: user.id,
      title,
      description: description || null,
      visibility: parseVisibility(formData.get("visibility")),
    },
  });
  revalidatePath("/lists");
  redirect(localeHref(`/lists/${list.id}`, locale));
}

export async function deletePlaceList(listId: string): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: t.lists.errors.listNotFound };
  await prisma.placeList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  redirect(localeHref("/lists", locale));
}

export async function setPlaceListVisibility(
  listId: string,
  visibility: string,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  await prisma.placeList.update({
    where: { id: own.list.id },
    data: { visibility: parseVisibility(visibility) },
  });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  return { ok: true };
}

export async function addPlaceToList(listId: string, locationId: string): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  // locationId приходит с клиента: чужое приватное место в свой список
  // не положить — иначе утекали бы его название и координаты.
  if (!(await canUseLocation(locationId, own.user.id))) {
    return { ok: false, error: (await getT()).t.lists.errors.placeNotFound };
  }
  await prisma.placeListItem.upsert({
    where: { listId_locationId: { listId: own.list.id, locationId } },
    update: {},
    create: { listId: own.list.id, locationId },
  });
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

export async function removePlaceFromList(
  listId: string,
  locationId: string,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  await prisma.placeListItem.deleteMany({ where: { listId: own.list.id, locationId } });
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

export async function setPlaceNote(
  listId: string,
  locationId: string,
  formData: FormData,
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  const note = String(formData.get("note") ?? "").trim();
  await prisma.placeListItem.updateMany({
    where: { listId: own.list.id, locationId },
    data: { note: note || null },
  });
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
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

// createOwnLocation переехал в src/lib/ownLocation.ts: экспорт из
// "use server"-модуля делал его публичным HTTP-эндпоинтом, а userId он
// принимает аргументом — любой мог создавать места от чужого имени.

/** Своё место без всякой привязки — со страницы «Мои места». Список
 *  теперь необязателен: он просто способ сгруппировать места. */
export async function createStandalonePlace(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: (await getT()).t.lists.errors.signInToAddPlaces };
  const created = await createOwnLocation(formData, user.id);
  if (!created.ok) return created;
  revalidatePath("/lists");
  return { ok: true };
}

/** То же, но возвращает созданное место — чтобы форма, из которой его
 *  завели (например выбор места в модалке события), сразу подставила
 *  его выбранным и не пришлось уходить в другой раздел. */
export async function createOwnPlaceAndReturn(
  formData: FormData,
): Promise<{ ok: true; location: { id: string; name: string } } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: (await getT()).t.lists.errors.signInToAddPlaces };
  const created = await createOwnLocation(formData, user.id);
  if (!created.ok) return created;
  const location = await prisma.location.findUnique({
    where: { id: created.locationId },
    select: { id: true, name: true },
  });
  if (!location) return { ok: false, error: (await getT()).t.lists.errors.placeCreateFailed };
  revalidatePath("/lists");
  return { ok: true, location };
}

export async function createOwnPlace(listId: string, formData: FormData): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  const { user, list } = own;

  const created = await createOwnLocation(formData, user.id);
  if (!created.ok) return created;

  await prisma.placeListItem.create({
    data: { listId: list.id, locationId: created.locationId, note: created.note },
  });
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

/** Редактирование названия/описания списка. */
export async function updatePlaceList(listId: string, formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: t.lists.errors.listNotFound };
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return { ok: false, error: t.lists.errors.listTitleRequired };
  await prisma.placeList.update({
    where: { id: own.list.id },
    data: { title, description: description || null },
  });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  return { ok: true };
}

/** Редактирование СВОЕГО места (созданного пользователем): название,
 *  фото, ссылка/координаты. Каталожные локации отсюда не редактируются. */
export async function updateOwnPlace(locationId: string, formData: FormData): Promise<ActionResult> {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.createdByUserId !== user.id) {
    return { ok: false, error: t.lists.errors.placeNotFound };
  }

  const name = String(formData.get("name") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const mapsInput = String(formData.get("mapsUrl") ?? "").trim();
  if (!name) return { ok: false, error: t.lists.errors.placeNameRequired };

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
  return { ok: true };
}

/** Перестановка места в списке кнопками вверх/вниз: перечитываем текущий
 *  порядок, свапаем соседей и переписываем position всем подряд —
 *  надёжнее, чем жонглировать парой значений при position-дефолте 0. */
export async function movePlaceInList(
  listId: string,
  locationId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const own = await requireOwnList(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  const items = await prisma.placeListItem.findMany({
    where: { listId: own.list.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const idx = items.findIndex((i) => i.locationId === locationId);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= items.length) return { ok: true };
  [items[idx], items[target]] = [items[target], items[idx]];
  await prisma.$transaction(
    items.map((item, i) =>
      prisma.placeListItem.update({
        where: { listId_locationId: { listId: own.list.id, locationId: item.locationId } },
        data: { position: i },
      }),
    ),
  );
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import type { TripVisibility } from "@/generated/prisma/client";
import { isLocationCategory } from "@/lib/locationCategories";
import { parseUploadUrl } from "@/lib/uploadUrl";
import { canUseLocation, createOwnLocation, resolveUserMapsCoords } from "@/lib/ownLocation";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { communityRights } from "@/lib/meetups";
import { isPremiumActive } from "@/lib/premium";
import { communityHref } from "@/lib/slugHelpers";

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

/**
 * Кто может ЗАВОДИТЬ своё: списки мест и собственные места — часть
 * платного (правка владельца 2026-09-06). Смотреть чужие публичные
 * списки, ходить по местам съёмок и отмечать «была здесь» можно и без
 * подписки — платное тут только создание.
 *
 * Возвращает пользователя или текст ошибки значением, как остальные
 * экшены этого файла.
 */
async function requirePremiumUser() {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  if (!isPremiumActive(user)) return { ok: false as const, error: t.lists.errors.premium };
  return { ok: true as const, user };
}

/**
 * Кто может править ЭТОТ список: возвращает пользователя со списком или
 * null (списка нет / прав нет) — вызывающий экшен превращает null в
 * `{ ok: false, error: "Список не найден" }`.
 *
 * Правило раздваивается по `PlaceList.communityId`:
 *
 * - **обычный список** — только его владелец (`userId`), как было;
 * - **список сообщества** — право даёт РОЛЬ в сообществе (создатель или
 *   модератор, `communityAccess.canManage`), и не даёт строка `userId`.
 *   Список «куда сходить в Минске» ведёт сообщество, а не человек:
 *   иначе тот, кто его завёл и потом ушёл из модераторов (или из
 *   сообщества вовсе), навсегда сохранял бы над ним власть, а забрать
 *   её было бы некому.
 *
 * Проверка стоит здесь, в экшенах, а не в разметке: страницу списка
 * открывает и посторонний, а серверный экшен вызывается и мимо
 * интерфейса — спрятанная кнопка правом не является.
 */
async function requireListRights(listId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list) return null;
  if (list.communityId) {
    // Тот же самый расчёт прав, что у встреч, — не вторая копия условий:
    // `communityRights` читает сообщество и членство одним запросом и
    // отдаёт готовый ответ `communityAccess` (см. src/lib/meetups.ts).
    const rights = await communityRights(list.communityId, user.id);
    return rights.canManage ? { user, list } : null;
  }
  return list.userId === user.id ? { user, list } : null;
}

/**
 * Подписка нужна, чтобы завести СВОЁ — но не внутри сообщества: само
 * сообщество уже завёл подписчик, а его модератор ведёт общий список
 * бесплатно, как бесплатно и всё остальное участие (см.
 * docs/features/communities.md). Иначе фича была бы мертворождённой:
 * «куда сходить в Минске» состоит из собственных мест почти целиком —
 * минских кафе в каталоге тайских локаций нет.
 */
function needsPremium(list: { communityId: string | null }) {
  return !list.communityId;
}

export async function createPlaceList(formData: FormData): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const access = await requirePremiumUser();
  if (!access.ok) return access;
  const user = access.user;

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
  const own = await requireListRights(listId);
  if (!own) return { ok: false, error: t.lists.errors.listNotFound };
  // Куда уходить после удаления, зависит от того, чей был список:
  // раздел «Мои места» для списка сообщества — чужая страница, на
  // которой удалённого списка и не было.
  const community = own.list.communityId
    ? await prisma.community.findUnique({
        where: { id: own.list.communityId },
        select: { id: true, slug: true },
      })
    : null;
  await prisma.placeList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  if (community) {
    revalidatePath(communityHref(community));
    redirect(localeHref(`${communityHref(community)}?tab=places`, locale));
  }
  redirect(localeHref("/lists", locale));
}

export async function setPlaceListVisibility(
  listId: string,
  visibility: string,
): Promise<ActionResult> {
  const own = await requireListRights(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  const parsed = parseVisibility(visibility);
  // У списка сообщества состояний два, а не три: «для друзей» тут
  // бессмысленно — дружба это про человека, а список принадлежит
  // сообществу, и чужие друзья к нему отношения не имеют. FRIENDS с
  // клиента сводим к «только участникам», а не к более открытому.
  const next = own.list.communityId && parsed === "FRIENDS" ? "PRIVATE" : parsed;
  await prisma.placeList.update({
    where: { id: own.list.id },
    data: { visibility: next },
  });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  return { ok: true };
}

export async function addPlaceToList(listId: string, locationId: string): Promise<ActionResult> {
  const own = await requireListRights(listId);
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
  const own = await requireListRights(listId);
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
  const own = await requireListRights(listId);
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
  const access = await requirePremiumUser();
  if (!access.ok) return access;
  const created = await createOwnLocation(formData, access.user.id);
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
  const access = await requirePremiumUser();
  if (!access.ok) return access;
  const created = await createOwnLocation(formData, access.user.id);
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
  // Права на список — ПЕРВЫМИ, до подписки: у списка сообщества гейт
  // подписки не срабатывает вовсе (см. needsPremium), а порядок
  // «сначала премиум» показывал бы модератору пейволл вместо места.
  const own = await requireListRights(listId);
  if (!own) return { ok: false, error: (await getT()).t.lists.errors.listNotFound };
  const { user, list } = own;
  if (needsPremium(list) && !isPremiumActive(user)) {
    return { ok: false, error: (await getT()).t.lists.errors.premium };
  }

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
  const own = await requireListRights(listId);
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
  // Фото — только свой /uploads/…, как и при создании места (см.
  // createOwnLocation и src/lib/uploadUrl.ts): подделанный адрес —
  // ошибка, а не молчаливое сохранение.
  const photo = parseUploadUrl(formData.get("photoUrl"));
  if (!photo.ok) return { ok: false, error: t.lists.errors.badPhotoUrl };
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
      photoUrl: photo.url,
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
  const own = await requireListRights(listId);
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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import { formatShortDate } from "@/lib/dates";
import { combineDateTime } from "@/lib/dates";
import type { TripVisibility } from "@/generated/prisma/client";
import { isPremiumActive } from "@/lib/premium";
import { notifyUser } from "@/lib/notifications";

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

export async function createTrip(formData: FormData): Promise<ActionError | void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) return { ok: false, error: "Поездки доступны по подписке" };

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (!title || !startDate || !endDate) {
    return { ok: false, error: "Заполните название и обе даты" };
  }
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) {
    return { ok: false, error: "Дата окончания раньше даты начала" };
  }

  // Совместная поездка сразу из формы: выбранным друзьям уходит
  // приглашение (только реальным друзьям — чужие id отбрасываем).
  const requestedMemberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const friendIds = requestedMemberIds.length > 0 ? await getFriendIds(user.id) : [];
  const memberIds = [...new Set(requestedMemberIds.filter((id) => friendIds.includes(id)))];

  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title,
      startDate: start,
      endDate: end,
      visibility: parseVisibility(formData.get("visibility")),
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
  for (const memberId of memberIds) void notifyTripInvite(trip.id, memberId);

  revalidatePath("/trips");
  redirect(`/trips/${trip.id}`);
}

/** Редактирование названия/дат/видимости поездки. */
export async function updateTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) return { ok: false, error: "Поездки доступны по подписке" };

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!title || !startDate || !endDate) {
    return { ok: false, error: "Заполните название и обе даты" };
  }
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) return { ok: false, error: "Дата окончания раньше даты начала" };

  await prisma.trip.updateMany({
    where: { id: tripId, userId: user.id },
    data: { title, startDate: start, endDate: end },
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { ok: true };
}

export async function deleteTrip(tripId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // where включает userId — чужую поездку удалить нельзя.
  await prisma.trip.deleteMany({ where: { id: tripId, userId: user.id } });
  revalidatePath("/trips");
  redirect("/trips");
}

export async function setTripVisibility(tripId: string, visibility: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) return { ok: false, error: "Поездки доступны по подписке" };
  await prisma.trip.updateMany({
    where: { id: tripId, userId: user.id },
    data: { visibility: parseVisibility(visibility) },
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { ok: true };
}

// ---------- Личные события внутри поездки ----------

/** Возвращает поездку, только если она принадлежит текущему юзеру и у
 *  него активна подписка — общий гейт всех действий с личными
 *  событиями (весь функционал поездок платный, см. auth.md). Отказ
 *  приходит значением `{ ok: false, error }` — вызывающий экшен отдаёт
 *  его клиенту как есть. */
async function requireOwnTrip(tripId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) {
    return { ok: false as const, error: "Поездки доступны по подписке" };
  }
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.userId !== user.id) return { ok: false as const, error: "Поездка не найдена" };
  return { ok: true as const, trip };
}

/** Доступ владельца ИЛИ со-путешественника (совместные поездки) —
 *  оба могут вносить события/дела; премиум обязателен, как и владельцу. */
async function requireTripAccess(tripId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) {
    return { ok: false as const, error: "Поездки доступны по подписке" };
  }
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId: user.id },
        { members: { some: { userId: user.id, status: "ACCEPTED" } } },
      ],
    },
  });
  if (!trip) return { ok: false as const, error: "Поездка не найдена" };
  return { ok: true as const, user, trip, isOwner: trip.userId === user.id };
}

/** Право менять/удалять запись: автор, владелец поездки, или другой
 *  участник при editableByOthers (галочка при создании). */
function canTouchItem(
  item: { createdById: string | null; editableByOthers: boolean },
  userId: string,
  tripOwnerId: string,
): boolean {
  const authorId = item.createdById ?? tripOwnerId;
  if (authorId === userId || tripOwnerId === userId) return true;
  return item.editableByOthers;
}

// ---------- Участники поездки ----------

/** Телеграм приглашённому о новом инвайте (fire-and-forget). */
async function notifyTripInvite(tripId: string, inviteeId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!trip) return;
  // Через notifyUser: строка в колокольчике на сайте + Telegram, если
  // он привязан. Раньше уведомление уходило только в Telegram, поэтому
  // приглашённый без него не узнавал о поездке вовсе.
  await notifyUser({
    userId: inviteeId,
    actorId: trip.user.id,
    kind: "TRIP_INVITE",
    title: `${trip.user.name ?? "Друг"} приглашает в поездку «${trip.title}»`,
    body: `${formatShortDate(trip.startDate)} – ${formatShortDate(trip.endDate)}. Примите или отклоните приглашение.`,
    href: `/trips/${trip.slug ?? trip.id}`,
  });
}

export async function addTripMember(tripId: string, friendId: string): Promise<ActionResult> {
  const own = await requireOwnTrip(tripId);
  if (!own.ok) return { ok: false, error: own.error };
  if (friendId === own.trip.userId) return { ok: false, error: "Владелец уже в поездке" };
  // Добавление — это приглашение: участником друг станет, когда примет.
  await prisma.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: friendId } },
    create: { tripId, userId: friendId },
    update: {},
  });
  void notifyTripInvite(tripId, friendId);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** Принять приглашение в поездку (есть PENDING-строка на меня). */
export async function acceptTripInvite(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const updated = await prisma.tripMember.updateMany({
    where: { tripId, userId: user.id, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });
  if (updated.count > 0) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (trip) {
      await notifyUser({
        userId: trip.userId,
        actorId: user.id,
        kind: "TRIP_INVITE_ACCEPTED",
        title: `${user.name ?? "Друг"} принял(а) приглашение в поездку`,
        body: trip.title,
        href: `/trips/${trip.slug ?? trip.id}`,
      });
    }
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

/** Отклонить приглашение — строка удаляется, владелец может позвать снова. */
export async function declineTripInvite(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.tripMember.deleteMany({
    where: { tripId, userId: user.id, status: "PENDING" },
  });
  revalidatePath("/trips");
}

export async function removeTripMember(tripId: string, userId: string): Promise<ActionResult> {
  const own = await requireOwnTrip(tripId);
  if (!own.ok) return { ok: false, error: own.error };
  await prisma.tripMember.deleteMany({ where: { tripId, userId } });
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function leaveTrip(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.tripMember.deleteMany({ where: { tripId, userId: user.id } });
  revalidatePath("/trips");
  redirect("/trips");
}

/** null — не заполнены обязательные поля (название/дата); вызывающий
 *  экшен возвращает клиенту `{ ok: false, error: "Заполните…" }`. */
function parsePersonalEventForm(formData: FormData): { title: string; note: string | null; startsAt: Date; locationId: string | null; editableByOthers: boolean; isPrivate: boolean; showOnHome: boolean } | null {
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  if (!title || !date) return null;
  // Без времени событие встаёт на начало дня — в списке поездки такие
  // сортируются раньше всех событий этого дня.
  return {
    title,
    note: note || null,
    startsAt: combineDateTime(date, time || "00:00"),
    locationId: locationId || null,
    editableByOthers: formData.get("editableByOthers") === "on",
    isPrivate: formData.get("isPrivate") === "on",
    showOnHome: formData.get("showOnHome") === "on",
  };
}

export async function createTripPersonalEvent(
  tripId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const data = parsePersonalEventForm(formData);
  if (!data) return { ok: false, error: "Заполните название и дату" };
  await prisma.tripPersonalEvent.create({
    data: { tripId: access.trip.id, createdById: access.user.id, ...data },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function updateTripPersonalEvent(
  tripId: string,
  personalEventId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { user, trip } = access;
  // where включает tripId — id чужого события с чужой поездкой не пройдёт.
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
  });
  if (!item || !canTouchItem(item, user.id, trip.userId)) {
    return { ok: false, error: "Нельзя редактировать чужую запись" };
  }
  const data = parsePersonalEventForm(formData);
  if (!data) return { ok: false, error: "Заполните название и дату" };
  await prisma.tripPersonalEvent.update({
    where: { id: personalEventId },
    data,
  });
  revalidatePath(`/trips/${trip.id}`);
  return { ok: true };
}

export async function deleteTripPersonalEvent(
  tripId: string,
  personalEventId: string,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const { user, trip } = access;
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
  });
  if (!item || !canTouchItem(item, user.id, trip.userId)) {
    return { ok: false, error: "Нельзя удалить чужую запись" };
  }
  await prisma.tripPersonalEvent.delete({ where: { id: personalEventId } });
  revalidatePath(`/trips/${trip.id}`);
  return { ok: true };
}

// ---------- «Что посетить»: списки и отдельные места (Г4+) ----------

export async function attachListToTrip(tripId: string, listId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  // Прикрепить можно только свой список.
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list || list.userId !== access.user.id) return { ok: false, error: "Список не найден" };
  await prisma.tripPlaceList.upsert({
    where: { tripId_listId: { tripId: access.trip.id, listId } },
    update: {},
    create: { tripId: access.trip.id, listId },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function detachListFromTrip(tripId: string, listId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await prisma.tripPlaceList.deleteMany({ where: { tripId: access.trip.id, listId } });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function addPlaceToTrip(tripId: string, locationId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await prisma.tripPlace.upsert({
    where: { tripId_locationId: { tripId: access.trip.id, locationId } },
    update: {},
    create: { tripId: access.trip.id, locationId },
  });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

export async function removePlaceFromTrip(
  tripId: string,
  locationId: string,
): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await prisma.tripPlace.deleteMany({ where: { tripId: access.trip.id, locationId } });
  revalidatePath(`/trips/${access.trip.id}`);
  return { ok: true };
}

// ---------- Туду-лист поездки ----------

function parseTodoDate(formData: FormData): { date: Date | null; hasTime: boolean } {
  const dateRaw = String(formData.get("date") ?? "").trim();
  if (!dateRaw) return { date: null, hasTime: false };
  const timeRaw = String(formData.get("time") ?? "").trim();
  const date = new Date(`${dateRaw}T${timeRaw || "00:00"}`);
  if (Number.isNaN(date.getTime())) return { date: null, hasTime: false };
  return { date, hasTime: Boolean(timeRaw) };
}

export async function createTripTodo(tripId: string, formData: FormData): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Введите текст дела" };
  const { date, hasTime } = parseTodoDate(formData);
  await prisma.tripTodo.create({
    data: {
      tripId,
      text,
      date,
      hasTime,
      createdById: access.user.id,
      editableByOthers: formData.get("editableByOthers") === "on",
      isPrivate: formData.get("isPrivate") === "on",
    },
  });
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** Дело из доступной поездки, которое текущий юзер вправе менять
 *  (автор / владелец поездки / участник при editableByOthers). Отказ —
 *  значением `{ ok: false, error }`, как у requireOwnTrip. */
async function requireOwnTodo(todoId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Требуется вход" };
  const todo = await prisma.tripTodo.findFirst({
    where: {
      id: todoId,
      trip: {
        OR: [
          { userId: user.id },
          { members: { some: { userId: user.id, status: "ACCEPTED" } } },
        ],
      },
    },
    include: { trip: { select: { userId: true } } },
  });
  if (!todo || !canTouchItem(todo, user.id, todo.trip.userId)) {
    return { ok: false as const, error: "Нельзя менять чужое дело" };
  }
  return { ok: true as const, todo };
}

export async function toggleTripTodo(todoId: string): Promise<ActionResult> {
  const own = await requireOwnTodo(todoId);
  if (!own.ok) return { ok: false, error: own.error };
  await prisma.tripTodo.update({ where: { id: todoId }, data: { done: !own.todo.done } });
  revalidatePath(`/trips/${own.todo.tripId}`);
  return { ok: true };
}

export async function updateTripTodo(todoId: string, formData: FormData): Promise<ActionResult> {
  const own = await requireOwnTodo(todoId);
  if (!own.ok) return { ok: false, error: own.error };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Введите текст дела" };
  const { date, hasTime } = parseTodoDate(formData);
  await prisma.tripTodo.update({
    where: { id: todoId },
    data: {
      text,
      date,
      hasTime,
      editableByOthers: formData.get("editableByOthers") === "on",
      isPrivate: formData.get("isPrivate") === "on",
    },
  });
  revalidatePath(`/trips/${own.todo.tripId}`);
  return { ok: true };
}

export async function deleteTripTodo(todoId: string): Promise<ActionResult> {
  const own = await requireOwnTodo(todoId);
  if (!own.ok) return { ok: false, error: own.error };
  await prisma.tripTodo.delete({ where: { id: todoId } });
  revalidatePath(`/trips/${own.todo.tripId}`);
  return { ok: true };
}

/** Бронь жилья в поездке. Доступ как у дел и событий: владелец и
 *  принятые участники — они едут вместе, и бронь нужна всем. */
export async function saveTripHotel(tripId: string, formData: FormData): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  const id = String(formData.get("hotelId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Укажите название отеля" };

  const data = {
    name,
    address: String(formData.get("address") ?? "").trim() || null,
    url: String(formData.get("url") ?? "").trim() || null,
    fileUrl: String(formData.get("fileUrl") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    checkIn: parseTripDate(formData.get("checkIn")),
    checkOut: parseTripDate(formData.get("checkOut")),
  };

  if (id) {
    // Проверяем принадлежность: id приходит из формы, и без этого можно
    // было бы отредактировать бронь чужой поездки.
    const existing = await prisma.tripHotel.findFirst({ where: { id, tripId } });
    if (!existing) return { ok: false, error: "Бронь не найдена" };
    await prisma.tripHotel.update({ where: { id }, data });
  } else {
    await prisma.tripHotel.create({ data: { tripId, ...data } });
  }
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function deleteTripHotel(tripId: string, hotelId: string): Promise<ActionResult> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return { ok: false, error: access.error };
  await prisma.tripHotel.deleteMany({ where: { id: hotelId, tripId } });
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

/** «YYYY-MM-DD» из формы → дата в UTC-слоте, как остальные даты
 *  проекта (см. lib/dates.ts). */
function parseTripDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

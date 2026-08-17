"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { combineDateTime } from "@/lib/dates";
import type { TripVisibility } from "@/generated/prisma/client";
import { isPremiumActive } from "@/lib/premium";

function parseVisibility(raw: unknown): TripVisibility {
  return raw === "PUBLIC" || raw === "FRIENDS" ? raw : "PRIVATE";
}

export async function createTrip(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) throw new Error("Поездки доступны по подписке");

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (!title || !startDate || !endDate) {
    throw new Error("Заполните название и обе даты");
  }
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) {
    throw new Error("Дата окончания раньше даты начала");
  }

  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title,
      startDate: start,
      endDate: end,
      visibility: parseVisibility(formData.get("visibility")),
    },
  });

  revalidatePath("/trips");
  redirect(`/trips/${trip.id}`);
}

/** Редактирование названия/дат/видимости поездки. */
export async function updateTrip(tripId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) throw new Error("Поездки доступны по подписке");

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!title || !startDate || !endDate) throw new Error("Заполните название и обе даты");
  const start = combineDateTime(startDate, "00:00");
  const end = combineDateTime(endDate, "00:00");
  if (end < start) throw new Error("Дата окончания раньше даты начала");

  await prisma.trip.updateMany({
    where: { id: tripId, userId: user.id },
    data: { title, startDate: start, endDate: end },
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

export async function deleteTrip(tripId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // where включает userId — чужую поездку удалить нельзя.
  await prisma.trip.deleteMany({ where: { id: tripId, userId: user.id } });
  revalidatePath("/trips");
  redirect("/trips");
}

export async function setTripVisibility(tripId: string, visibility: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) throw new Error("Поездки доступны по подписке");
  await prisma.trip.updateMany({
    where: { id: tripId, userId: user.id },
    data: { visibility: parseVisibility(visibility) },
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

// ---------- Личные события внутри поездки ----------

/** Возвращает поездку, только если она принадлежит текущему юзеру и у
 *  него активна подписка — общий гейт всех действий с личными
 *  событиями (весь функционал поездок платный, см. auth.md). */
async function requireOwnTrip(tripId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) throw new Error("Поездки доступны по подписке");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.userId !== user.id) throw new Error("Поездка не найдена");
  return trip;
}

/** Доступ владельца ИЛИ со-путешественника (совместные поездки) —
 *  оба могут вносить события/дела; премиум обязателен, как и владельцу. */
async function requireTripAccess(tripId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPremiumActive(user)) throw new Error("Поездки доступны по подписке");
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }],
    },
  });
  if (!trip) throw new Error("Поездка не найдена");
  return { user, trip, isOwner: trip.userId === user.id };
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

export async function addTripMember(tripId: string, friendId: string): Promise<void> {
  const trip = await requireOwnTrip(tripId);
  if (friendId === trip.userId) throw new Error("Владелец уже в поездке");
  await prisma.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: friendId } },
    create: { tripId, userId: friendId },
    update: {},
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function removeTripMember(tripId: string, userId: string): Promise<void> {
  await requireOwnTrip(tripId);
  await prisma.tripMember.deleteMany({ where: { tripId, userId } });
  revalidatePath(`/trips/${tripId}`);
}

export async function leaveTrip(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.tripMember.deleteMany({ where: { tripId, userId: user.id } });
  revalidatePath("/trips");
  redirect("/trips");
}

function parsePersonalEventForm(formData: FormData): { title: string; note: string | null; startsAt: Date; locationId: string | null; editableByOthers: boolean } {
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  if (!title || !date) throw new Error("Заполните название и дату");
  // Без времени событие встаёт на начало дня — в списке поездки такие
  // сортируются раньше всех событий этого дня.
  return {
    title,
    note: note || null,
    startsAt: combineDateTime(date, time || "00:00"),
    locationId: locationId || null,
    editableByOthers: formData.get("editableByOthers") === "on",
  };
}

export async function createTripPersonalEvent(tripId: string, formData: FormData) {
  const { user, trip } = await requireTripAccess(tripId);
  await prisma.tripPersonalEvent.create({
    data: { tripId: trip.id, createdById: user.id, ...parsePersonalEventForm(formData) },
  });
  revalidatePath(`/trips/${trip.id}`);
}

export async function updateTripPersonalEvent(
  tripId: string,
  personalEventId: string,
  formData: FormData,
) {
  const { user, trip } = await requireTripAccess(tripId);
  // where включает tripId — id чужого события с чужой поездкой не пройдёт.
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
  });
  if (!item || !canTouchItem(item, user.id, trip.userId)) {
    throw new Error("Нельзя редактировать чужую запись");
  }
  await prisma.tripPersonalEvent.update({
    where: { id: personalEventId },
    data: parsePersonalEventForm(formData),
  });
  revalidatePath(`/trips/${trip.id}`);
}

export async function deleteTripPersonalEvent(tripId: string, personalEventId: string) {
  const { user, trip } = await requireTripAccess(tripId);
  const item = await prisma.tripPersonalEvent.findFirst({
    where: { id: personalEventId, tripId: trip.id },
  });
  if (!item || !canTouchItem(item, user.id, trip.userId)) {
    throw new Error("Нельзя удалить чужую запись");
  }
  await prisma.tripPersonalEvent.delete({ where: { id: personalEventId } });
  revalidatePath(`/trips/${trip.id}`);
}

// ---------- «Что посетить»: списки и отдельные места (Г4+) ----------

export async function attachListToTrip(tripId: string, listId: string) {
  const { user, trip } = await requireTripAccess(tripId);
  // Прикрепить можно только свой список.
  const list = await prisma.placeList.findUnique({ where: { id: listId } });
  if (!list || list.userId !== user.id) throw new Error("Список не найден");
  await prisma.tripPlaceList.upsert({
    where: { tripId_listId: { tripId: trip.id, listId } },
    update: {},
    create: { tripId: trip.id, listId },
  });
  revalidatePath(`/trips/${trip.id}`);
}

export async function detachListFromTrip(tripId: string, listId: string) {
  const { trip } = await requireTripAccess(tripId);
  await prisma.tripPlaceList.deleteMany({ where: { tripId: trip.id, listId } });
  revalidatePath(`/trips/${trip.id}`);
}

export async function addPlaceToTrip(tripId: string, locationId: string) {
  const { trip } = await requireTripAccess(tripId);
  await prisma.tripPlace.upsert({
    where: { tripId_locationId: { tripId: trip.id, locationId } },
    update: {},
    create: { tripId: trip.id, locationId },
  });
  revalidatePath(`/trips/${trip.id}`);
}

export async function removePlaceFromTrip(tripId: string, locationId: string) {
  const { trip } = await requireTripAccess(tripId);
  await prisma.tripPlace.deleteMany({ where: { tripId: trip.id, locationId } });
  revalidatePath(`/trips/${trip.id}`);
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

export async function createTripTodo(tripId: string, formData: FormData): Promise<void> {
  const { user } = await requireTripAccess(tripId);
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("Введите текст дела");
  const { date, hasTime } = parseTodoDate(formData);
  await prisma.tripTodo.create({
    data: {
      tripId,
      text,
      date,
      hasTime,
      createdById: user.id,
      editableByOthers: formData.get("editableByOthers") === "on",
    },
  });
  revalidatePath(`/trips/${tripId}`);
}

/** Дело из доступной поездки, которое текущий юзер вправе менять
 *  (автор / владелец поездки / участник при editableByOthers). */
async function requireOwnTodo(todoId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Требуется вход");
  const todo = await prisma.tripTodo.findFirst({
    where: {
      id: todoId,
      trip: {
        OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }],
      },
    },
    include: { trip: { select: { userId: true } } },
  });
  if (!todo || !canTouchItem(todo, user.id, todo.trip.userId)) {
    throw new Error("Нельзя менять чужое дело");
  }
  return todo;
}

export async function toggleTripTodo(todoId: string): Promise<void> {
  const todo = await requireOwnTodo(todoId);
  await prisma.tripTodo.update({ where: { id: todoId }, data: { done: !todo.done } });
  revalidatePath(`/trips/${todo.tripId}`);
}

export async function updateTripTodo(todoId: string, formData: FormData): Promise<void> {
  const todo = await requireOwnTodo(todoId);
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("Введите текст дела");
  const { date, hasTime } = parseTodoDate(formData);
  await prisma.tripTodo.update({
    where: { id: todoId },
    data: { text, date, hasTime, editableByOthers: formData.get("editableByOthers") === "on" },
  });
  revalidatePath(`/trips/${todo.tripId}`);
}

export async function deleteTripTodo(todoId: string): Promise<void> {
  const todo = await requireOwnTodo(todoId);
  await prisma.tripTodo.delete({ where: { id: todoId } });
  revalidatePath(`/trips/${todo.tripId}`);
}

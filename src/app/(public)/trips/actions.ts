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

function parsePersonalEventForm(formData: FormData): { title: string; note: string | null; startsAt: Date } {
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "").trim();
  if (!title || !date) throw new Error("Заполните название и дату");
  // Без времени событие встаёт на начало дня — в списке поездки такие
  // сортируются раньше всех событий этого дня.
  return { title, note: note || null, startsAt: combineDateTime(date, time || "00:00") };
}

export async function createTripPersonalEvent(tripId: string, formData: FormData) {
  const trip = await requireOwnTrip(tripId);
  await prisma.tripPersonalEvent.create({
    data: { tripId: trip.id, ...parsePersonalEventForm(formData) },
  });
  revalidatePath(`/trips/${trip.id}`);
}

export async function updateTripPersonalEvent(
  tripId: string,
  personalEventId: string,
  formData: FormData,
) {
  const trip = await requireOwnTrip(tripId);
  // where включает tripId — id чужого события с чужой поездкой не пройдёт.
  await prisma.tripPersonalEvent.updateMany({
    where: { id: personalEventId, tripId: trip.id },
    data: parsePersonalEventForm(formData),
  });
  revalidatePath(`/trips/${trip.id}`);
}

export async function deleteTripPersonalEvent(tripId: string, personalEventId: string) {
  const trip = await requireOwnTrip(tripId);
  await prisma.tripPersonalEvent.deleteMany({
    where: { id: personalEventId, tripId: trip.id },
  });
  revalidatePath(`/trips/${trip.id}`);
}

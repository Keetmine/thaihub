"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { combineDateTime } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";

function getPerformerIds(formData: FormData): string[] {
  return formData.getAll("performerIds").map(String).filter(Boolean);
}

function getPairingIds(formData: FormData): string[] {
  return formData.getAll("pairingIds").map(String).filter(Boolean);
}

function getPresaleAt(formData: FormData): Date | null {
  const presaleEnabled = String(formData.get("presaleEnabled") ?? "") === "on";
  if (!presaleEnabled) return null;

  const presaleDate = String(formData.get("presaleDate") ?? "");
  const presaleTime = String(formData.get("presaleTime") ?? "");
  if (!presaleDate || !presaleTime) return null;

  return combineDateTime(presaleDate, presaleTime);
}

function getPresaleUrl(formData: FormData): string | null {
  const presaleEnabled = String(formData.get("presaleEnabled") ?? "") === "on";
  if (!presaleEnabled) return null;

  const presaleUrl = String(formData.get("presaleUrl") ?? "").trim();
  return presaleUrl || null;
}

/** One row of the repeatable date/time picker — see EventForm.tsx. */
type OccurrenceInput = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  lineup: string[];
};

function getOccurrenceInputs(formData: FormData): OccurrenceInput[] {
  const ids = formData.getAll("occurrenceId").map(String);
  const dates = formData.getAll("occurrenceDate").map(String);
  const startTimes = formData.getAll("occurrenceStartTime").map(String);
  const endTimes = formData.getAll("occurrenceEndTime").map(String);
  // Лайнап дня (фестивали) — csv в hidden-инпуте своей строки.
  const lineups = formData.getAll("occurrenceLineup").map(String);

  return dates
    .map((date, i) => ({
      id: ids[i] ?? "",
      date,
      startTime: startTimes[i] ?? "",
      endTime: endTimes[i] ?? "",
      lineup: (lineups[i] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    }))
    // время теперь необязательно — достаточно даты
    .filter((row) => row.date);
}

/**
 * Асинхронный поиск для комбобокса выбора событий (PerformerForm):
 * список событий постоянно растёт — грузим варианты по мере ввода.
 */
export async function searchEventOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  await requireAdmin();
  const q = query.trim();
  if (q.length < 2) return [];

  const events = await prisma.event.findMany({
    where: { title: { contains: q, mode: "insensitive" } },
    select: { id: true, title: true, posterUrl: true },
    orderBy: { title: "asc" },
    take: 20,
  });
  return events.map((e) => ({ id: e.id, name: e.title, photoUrl: e.posterUrl }));
}

export async function createEvent(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const occurrences = getOccurrenceInputs(formData);
  const performerIds = getPerformerIds(formData);
  const pairingIds = getPairingIds(formData);
  const dramaId = String(formData.get("dramaId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const ticketPrice = String(formData.get("ticketPrice") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || occurrences.length === 0) {
    throw new Error("Заполните обязательные поля: название, место, дата");
  }

  await prisma.event.create({
    data: {
      title,
      venue,
      description: description || null,
      dramaId: dramaId || null,
      locationId: locationId || null,
      ticketPrice: ticketPrice || null,
      posterUrl: posterUrl || null,
      presaleAt,
      presaleUrl,
      occurrences: {
        create: occurrences.map((o) => ({
          startsAt: combineDateTime(o.date, o.startTime || "00:00"),
          endsAt: o.endTime ? combineDateTime(o.date, o.endTime) : null,
          hasTime: Boolean(o.startTime),
          lineup: { create: o.lineup.map((performerId) => ({ performerId })) },
        })),
      },
      performers: {
        create: performerIds.map((performerId) => ({ performerId })),
      },
      pairings: {
        create: pairingIds.map((pairingId) => ({ pairingId })),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

/** Creates/updates/deletes an Event's EventOccurrence rows to match the
 *  submitted list — existing rows (identified by occurrenceId) are
 *  updated in place, new rows (blank occurrenceId) are created, and any
 *  occurrence not present in the submission anymore is deleted. */
async function syncOccurrences(
  tx: Prisma.TransactionClient,
  eventId: string,
  occurrences: OccurrenceInput[],
) {
  const existing = await tx.eventOccurrence.findMany({
    where: { eventId },
    select: { id: true },
  });
  const keptIds = new Set<string>();

  for (const o of occurrences) {
    const startsAt = combineDateTime(o.date, o.startTime || "00:00");
    const endsAt = o.endTime ? combineDateTime(o.date, o.endTime) : null;
    const hasTime = Boolean(o.startTime);
    if (o.id) {
      await tx.eventOccurrence.update({
        where: { id: o.id },
        data: {
          startsAt,
          endsAt,
          hasTime,
          lineup: {
            deleteMany: {},
            create: o.lineup.map((performerId) => ({ performerId })),
          },
        },
      });
      keptIds.add(o.id);
    } else {
      const created = await tx.eventOccurrence.create({
        data: {
          eventId,
          startsAt,
          endsAt,
          hasTime,
          lineup: { create: o.lineup.map((performerId) => ({ performerId })) },
        },
      });
      keptIds.add(created.id);
    }
  }

  const toDelete = existing.map((e) => e.id).filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    await tx.eventOccurrence.deleteMany({ where: { id: { in: toDelete } } });
  }
}

export async function updateEvent(id: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const occurrences = getOccurrenceInputs(formData);
  const performerIds = getPerformerIds(formData);
  const pairingIds = getPairingIds(formData);
  const dramaId = String(formData.get("dramaId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const ticketPrice = String(formData.get("ticketPrice") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || occurrences.length === 0) {
    throw new Error("Заполните обязательные поля: название, место, дата");
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventPerformer.deleteMany({ where: { eventId: id } });
    await tx.eventPairing.deleteMany({ where: { eventId: id } });
    await syncOccurrences(tx, id, occurrences);
    await tx.event.update({
      where: { id },
      data: {
        title,
        venue,
        description: description || null,
        dramaId: dramaId || null,
        locationId: locationId || null,
        ticketPrice: ticketPrice || null,
        posterUrl: posterUrl || null,
        presaleAt,
        presaleUrl,
        performers: {
          create: performerIds.map((performerId) => ({ performerId })),
        },
        pairings: {
          create: pairingIds.map((pairingId) => ({ pairingId })),
        },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

/**
 * Minimal event creation from a performer form's events picker — only the
 * fields createEvent already treats as required. The calling performer form
 * links the performer to this event itself (on its own submit), since at
 * create time the performer may not have an id yet.
 */
export async function createEventMinimal(
  title: string,
  venue: string,
  date: string,
  startTime: string,
): Promise<{ id: string; title: string }> {
  await requireAdmin();
  const t = title.trim();
  const v = venue.trim();
  if (!t || !v || !date || !startTime) {
    throw new Error("Заполните название, место, дату и время начала");
  }

  const event = await prisma.event.create({
    data: {
      title: t,
      venue: v,
      occurrences: { create: { startsAt: combineDateTime(date, startTime) } },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/events");
  return { id: event.id, title: event.title };
}

export async function deleteEvent(id: string) {
  await requireAdmin();
  await prisma.event.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/events");
  redirect("/admin/events");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function combineDateTime(date: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m);
}

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

export async function createEvent(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const extraDates = formData.getAll("extraDates").map(String).filter(Boolean);
  const performerIds = getPerformerIds(formData);
  const pairingIds = getPairingIds(formData);
  const dramaId = String(formData.get("dramaId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || !date || !startTime) {
    throw new Error("Заполните обязательные поля: название, место, дата, время начала");
  }

  const dates = Array.from(new Set([date, ...extraDates]));

  await prisma.$transaction(
    dates.map((d) =>
      prisma.event.create({
        data: {
          title,
          venue,
          description: description || null,
          startsAt: combineDateTime(d, startTime),
          endsAt: endTime ? combineDateTime(d, endTime) : null,
          dramaId: dramaId || null,
          locationId: locationId || null,
          presaleAt,
          presaleUrl,
          performers: {
            create: performerIds.map((performerId) => ({ performerId })),
          },
          pairings: {
            create: pairingIds.map((pairingId) => ({ pairingId })),
          },
        },
      }),
    ),
  );

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateEvent(id: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const performerIds = getPerformerIds(formData);
  const pairingIds = getPairingIds(formData);
  const dramaId = String(formData.get("dramaId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || !date || !startTime) {
    throw new Error("Заполните обязательные поля: название, место, дата, время начала");
  }

  await prisma.$transaction([
    prisma.eventPerformer.deleteMany({ where: { eventId: id } }),
    prisma.eventPairing.deleteMany({ where: { eventId: id } }),
    prisma.event.update({
      where: { id },
      data: {
        title,
        venue,
        description: description || null,
        startsAt: combineDateTime(date, startTime),
        endsAt: endTime ? combineDateTime(date, endTime) : null,
        dramaId: dramaId || null,
        locationId: locationId || null,
        presaleAt,
        presaleUrl,
        performers: {
          create: performerIds.map((performerId) => ({ performerId })),
        },
        pairings: {
          create: pairingIds.map((pairingId) => ({ pairingId })),
        },
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
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
  const t = title.trim();
  const v = venue.trim();
  if (!t || !v || !date || !startTime) {
    throw new Error("Заполните название, место, дату и время начала");
  }

  const event = await prisma.event.create({
    data: { title: t, venue: v, startsAt: combineDateTime(date, startTime) },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return { id: event.id, title: event.title };
}

export async function deleteEvent(id: string) {
  await prisma.event.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

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
  const performerIds = getPerformerIds(formData);
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || !date || !startTime) {
    throw new Error("Заполните обязательные поля: название, место, дата, время начала");
  }

  await prisma.event.create({
    data: {
      title,
      venue,
      description: description || null,
      startsAt: combineDateTime(date, startTime),
      endsAt: endTime ? combineDateTime(date, endTime) : null,
      presaleAt,
      presaleUrl,
      performers: {
        create: performerIds.map((performerId) => ({ performerId })),
      },
    },
  });

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
  const presaleAt = getPresaleAt(formData);
  const presaleUrl = getPresaleUrl(formData);

  if (!title || !venue || !date || !startTime) {
    throw new Error("Заполните обязательные поля: название, место, дата, время начала");
  }

  await prisma.$transaction([
    prisma.eventPerformer.deleteMany({ where: { eventId: id } }),
    prisma.event.update({
      where: { id },
      data: {
        title,
        venue,
        description: description || null,
        startsAt: combineDateTime(date, startTime),
        endsAt: endTime ? combineDateTime(date, endTime) : null,
        presaleAt,
        presaleUrl,
        performers: {
          create: performerIds.map((performerId) => ({ performerId })),
        },
      },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function deleteEvent(id: string) {
  await prisma.event.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

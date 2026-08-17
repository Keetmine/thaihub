"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Сохранить (создать/обновить) заметку текущего юзера к событию (Г6). */
export async function saveEventNote(eventId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const text = String(formData.get("text") ?? "").trim();
  const rawVisibility = String(formData.get("visibility") ?? "");
  const visibility =
    rawVisibility === "FRIENDS" ? "FRIENDS" : rawVisibility === "TRIP" ? "TRIP" : "PERSONAL";

  if (!text) {
    await prisma.eventNote.deleteMany({ where: { userId: user.id, eventId } });
  } else {
    await prisma.eventNote.upsert({
      where: { userId_eventId: { userId: user.id, eventId } },
      update: { text, visibility },
      create: { userId: user.id, eventId, text, visibility },
    });
  }
  revalidatePath(`/event/${eventId}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

export async function toggleFavoritePerformer(performerId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoritePerformer.findUnique({
    where: { userId_performerId: { userId: user.id, performerId } },
  });

  if (existing) {
    await prisma.favoritePerformer.delete({
      where: { userId_performerId: { userId: user.id, performerId } },
    });
  } else {
    await prisma.favoritePerformer.create({
      data: { userId: user.id, performerId },
    });
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
}

export async function toggleFavoriteAgency(agencyId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoriteAgency.findUnique({
    where: { userId_agencyId: { userId: user.id, agencyId } },
  });

  if (existing) {
    await prisma.favoriteAgency.delete({
      where: { userId_agencyId: { userId: user.id, agencyId } },
    });
  } else {
    await prisma.favoriteAgency.create({
      data: { userId: user.id, agencyId },
    });
  }

  revalidatePath("/account");
  revalidatePath("/performers");
  revalidatePath(`/agencies/${agencyId}`);
}

export async function toggleFavoriteEvent(eventId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoriteEvent.findUnique({
    where: { userId_eventId: { userId: user.id, eventId } },
  });

  if (existing) {
    await prisma.favoriteEvent.delete({
      where: { userId_eventId: { userId: user.id, eventId } },
    });
  } else {
    await prisma.favoriteEvent.create({
      data: { userId: user.id, eventId },
    });
  }

  revalidatePath("/account");
  revalidatePath(`/event/${eventId}`);
}

const WATCH_STATUSES = ["WATCHING", "COMPLETED", "ON_HOLD", "PLAN_TO_WATCH", "DROPPED"] as const;
export type DramaWatchStatusValue = (typeof WATCH_STATUSES)[number];

export async function setDramaWatchStatus(dramaId: string, status: DramaWatchStatusValue) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!WATCH_STATUSES.includes(status)) throw new Error("Некорректный статус");

  await prisma.dramaWatchStatus.upsert({
    where: { userId_dramaId: { userId: user.id, dramaId } },
    update: { status },
    create: { userId: user.id, dramaId, status },
  });

  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
}

export async function clearDramaWatchStatus(dramaId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.dramaWatchStatus.deleteMany({ where: { userId: user.id, dramaId } });

  revalidatePath("/account");
  revalidatePath(`/dramas/${dramaId}`);
}

// "Я пойду" — toggles whether the current user is attending an event.
export async function toggleGoing(eventId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.eventAttendance.findUnique({
    where: { userId_eventId: { userId: user.id, eventId } },
  });

  if (existing) {
    await prisma.eventAttendance.delete({
      where: { userId_eventId: { userId: user.id, eventId } },
    });
  } else {
    await prisma.eventAttendance.create({
      data: { userId: user.id, eventId },
    });
    // Друзьям — «X идёт на …» (Г2). Fire-and-forget: сбой телеграма не
    // должен ломать саму отметку.
    void import("@/lib/telegramNotifications")
      .then((m) => m.notifyFriendsAboutGoing(user.id, eventId))
      .catch(() => {});
  }

  revalidatePath("/account");
  revalidatePath(`/event/${eventId}`);
}

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

export async function toggleFavoriteDrama(dramaId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.favoriteDrama.findUnique({
    where: { userId_dramaId: { userId: user.id, dramaId } },
  });

  if (existing) {
    await prisma.favoriteDrama.delete({
      where: { userId_dramaId: { userId: user.id, dramaId } },
    });
  } else {
    await prisma.favoriteDrama.create({
      data: { userId: user.id, dramaId },
    });
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
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
  }

  revalidatePath("/account");
  revalidatePath(`/event/${eventId}`);
}

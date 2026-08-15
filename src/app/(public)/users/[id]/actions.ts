"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Вкл/выкл уведомления «этот друг идёт на событие» (Г2). По умолчанию
 *  включены для всех друзей; строка FriendNotificationMute выключает. */
export async function toggleFriendNotifications(friendId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.friendNotificationMute.findUnique({
    where: { userId_mutedFriendId: { userId: user.id, mutedFriendId: friendId } },
  });
  if (existing) {
    await prisma.friendNotificationMute.delete({
      where: { userId_mutedFriendId: { userId: user.id, mutedFriendId: friendId } },
    });
  } else {
    await prisma.friendNotificationMute.create({
      data: { userId: user.id, mutedFriendId: friendId },
    });
  }
  revalidatePath(`/users/${friendId}`);
}

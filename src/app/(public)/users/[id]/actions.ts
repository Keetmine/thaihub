"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getT } from "@/lib/i18n";

/** Вкл/выкл уведомления «этот друг идёт на событие» (Г2). По умолчанию
 *  включены для всех друзей; строка FriendNotificationMute выключает.
 *  Ошибка — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). */
export async function toggleFriendNotifications(
  friendId: string,
): Promise<{ ok: false; error: string } | void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Настройка имеет смысл только про друга: friendId приходит с
  // клиента, и без проверки mute заводился на любой id — мусорные
  // строки про посторонних (и несуществующих) людей.
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: user.id, addresseeId: friendId },
        { requesterId: friendId, addresseeId: user.id },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    return { ok: false, error: (await getT()).t.social.friends.errors.notFriends };
  }

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

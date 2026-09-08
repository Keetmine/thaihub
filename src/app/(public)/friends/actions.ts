"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { notifyUser } from "@/lib/notifications";
import { getT } from "@/lib/i18n";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). Успех — void. */
export type FriendActionError = { ok: false; error: string };

export async function sendFriendRequest(addresseeId: string): Promise<FriendActionError | void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  if (addresseeId === user.id) {
    return { ok: false, error: t.social.friends.errors.cannotAddSelf };
  }

  // Адресат должен существовать и не быть удалённым: id приходит с
  // клиента, и подделанный давал 500 на внешнем ключе, а мягко
  // удалённый аккаунт (deletedAt) — заявку, которую некому принять.
  const addressee = await prisma.user.findFirst({
    where: { id: addresseeId, deletedAt: null },
    select: { id: true },
  });
  if (!addressee) {
    return { ok: false, error: t.social.friends.errors.userNotFound };
  }

  const [a, b] = [user.id, addresseeId];
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
  if (existing) return { ok: false, error: t.social.friends.errors.alreadyRequested };

  await prisma.friendship.create({
    data: { requesterId: user.id, addresseeId, status: "PENDING" },
  });

  await notifyUser({
    userId: addresseeId,
    actorId: user.id,
    kind: "FRIEND_REQUEST",
    actorName: user.name,
    href: "/friends",
  });

  revalidatePath("/friends");
}

export async function acceptFriendRequest(friendshipId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  const updated = await prisma.friendship.updateMany({
    where: { id: friendshipId, addresseeId: user.id, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });

  if (updated.count > 0 && friendship) {
    await notifyUser({
      userId: friendship.requesterId,
      actorId: user.id,
      kind: "FRIEND_ACCEPTED",
      actorName: user.name,
      href: "/friends",
    });
  }

  revalidatePath("/friends");
}

/** Declines an incoming request, cancels an outgoing one, or removes an
 *  accepted friendship — all are just "delete this row I'm part of". */
export async function removeFriendship(friendshipId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.friendship.deleteMany({
    where: {
      id: friendshipId,
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
  });

  revalidatePath("/friends");
}

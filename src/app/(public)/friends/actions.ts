"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

export async function sendFriendRequest(addresseeId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (addresseeId === user.id) throw new Error("Нельзя добавить себя в друзья");

  const [a, b] = [user.id, addresseeId];
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
  if (existing) throw new Error("Заявка уже отправлена или вы уже друзья");

  await prisma.friendship.create({
    data: { requesterId: user.id, addresseeId, status: "PENDING" },
  });

  revalidatePath("/friends");
}

export async function acceptFriendRequest(friendshipId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.friendship.updateMany({
    where: { id: friendshipId, addresseeId: user.id, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });

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

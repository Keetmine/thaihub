"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function setUserPremium(userId: string, isPremium: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { isPremium } });
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  // Cascades take everything user-owned with it (sessions, favorites,
  // attendance, friendships, trips) — see the onDelete: Cascade relations
  // in schema.prisma.
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

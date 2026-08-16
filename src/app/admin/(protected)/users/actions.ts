"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extendPremium } from "@/lib/premium";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/auth";

/** Продлить подписку на месяц (от конца текущей, если ещё активна). */
export async function grantPremiumMonth(userId: string) {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await prisma.user.update({
    where: { id: userId },
    data: { premiumUntil: extendPremium(user.premiumUntil) },
  });
  revalidatePath("/admin/users");
}

/** Досрочно отключить подписку. */
export async function revokePremium(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil: null } });
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  // Cascades take everything user-owned with it (sessions, favorites,
  // attendance, friendships, trips) — see the onDelete: Cascade relations
  // in schema.prisma.
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

/** Одноразовый инвайт-код для регистрации (Б5 в roadmap). Формат короткий
 *  и читаемый — им делятся в переписке. */


/** Промокод на месяц подписки (подарочный). */
export async function createPromoCode(): Promise<void> {
  await requireAdmin();
  const code = `GIFT-${randomBytes(4).toString("hex").toUpperCase()}`;
  await prisma.promoCode.create({ data: { code, months: 1 } });
  revalidatePath("/admin/users");
}

export async function deletePromoCode(code: string): Promise<void> {
  await requireAdmin();
  await prisma.promoCode.deleteMany({ where: { code, usedAt: null } });
  revalidatePath("/admin/users");
}

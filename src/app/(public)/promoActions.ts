"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { extendPremium } from "@/lib/premium";
import { assertRateLimit } from "@/lib/rateLimit";

/** Активация промокода подписки: код одноразовый, месяцы прибавляются к
 *  текущему сроку (extendPremium × months). Код помечается использованным
 *  той же транзакцией — параллельная активация не пройдёт. */
export async function redeemPromoCode(code: string): Promise<{ until: Date }> {
  await assertRateLimit("login");
  const user = await getCurrentUser();
  if (!user) throw new Error("Требуется вход");

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) throw new Error("Введите код");

  const until = await prisma.$transaction(async (tx) => {
    const claimed = await tx.promoCode.updateMany({
      where: { code: trimmed, usedAt: null },
      data: { usedAt: new Date(), usedById: user.id },
    });
    if (claimed.count === 0) throw new Error("Код не найден или уже использован");
    const promo = await tx.promoCode.findUnique({ where: { code: trimmed } });
    let next = user.premiumUntil;
    for (let i = 0; i < (promo?.months ?? 1); i++) next = extendPremium(next);
    await tx.user.update({ where: { id: user.id }, data: { premiumUntil: next, premiumExpiryNotifiedFor: null } });
    return next!;
  });

  revalidatePath("/");
  return { until };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { extendPremium } from "@/lib/premium";
import { assertRateLimit } from "@/lib/rateLimit";
import { getT } from "@/lib/i18n";

/** Результат активации. Ошибка возвращается значением, а не броском:
 *  в проде Next не отдаёт клиенту текст исключения из server action —
 *  вместо «Код не найден» прилетала минифицированная ошибка React. */
export type RedeemResult = { ok: true; until: Date } | { ok: false; error: string };

/** Активация промокода подписки: код одноразовый, месяцы прибавляются к
 *  текущему сроку (extendPremium × months). Код помечается использованным
 *  той же транзакцией — параллельная активация не пройдёт. */
export async function redeemPromoCode(code: string): Promise<RedeemResult> {
  const { t } = await getT();
  await assertRateLimit("login");
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: t.widgets.promo.signInRequired };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: t.widgets.promo.enterCode };

  const promo = await prisma.promoCode.findUnique({ where: { code: trimmed } });
  if (!promo) return { ok: false, error: t.widgets.promo.noSuchCode };
  if (promo.usedAt) return { ok: false, error: t.widgets.promo.alreadyUsed };

  const until = await prisma.$transaction(async (tx) => {
    const claimed = await tx.promoCode.updateMany({
      where: { code: trimmed, usedAt: null },
      data: { usedAt: new Date(), usedById: user.id },
    });
    // Кто-то успел активировать код между проверкой выше и этой строкой.
    if (claimed.count === 0) return null;
    let next = user.premiumUntil;
    for (let i = 0; i < (promo.months ?? 1); i++) next = extendPremium(next);
    await tx.user.update({
      where: { id: user.id },
      data: { premiumUntil: next, premiumExpiryNotifiedFor: null },
    });
    return next!;
  });

  if (!until) return { ok: false, error: t.widgets.promo.alreadyUsed };

  revalidatePath("/");
  return { ok: true, until };
}

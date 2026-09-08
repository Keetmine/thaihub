"use server";

import { getCurrentUser } from "@/lib/userAuth";
import { createGiftPremiumInvoiceLink, createPremiumInvoiceLink } from "@/lib/telegram";
import { getPremiumPriceStars } from "@/lib/siteSettings";
import { getT } from "@/lib/i18n";

/** Ссылка-инвойс Telegram Stars на месяц подписки для текущего юзера.
 *  Ошибка — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). */
export async function getPremiumInvoiceLink(): Promise<
  { ok: true; link: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: (await getT()).t.widgets.promo.signInRequired };
  return { ok: true, link: await createPremiumInvoiceLink(user.id, await getPremiumPriceStars()) };
}

/** Ссылка-инвойс «подарить подписку»: после оплаты вебхук создаёт
 *  одноразовый промокод на месяц и присылает его покупателю в Telegram
 *  открыткой для пересылки. Формат ответа — как у getPremiumInvoiceLink
 *  (ошибка значением, см. комментарий там). */
export async function getGiftPremiumInvoiceLink(): Promise<
  { ok: true; link: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: (await getT()).t.widgets.promo.signInRequired };
  return {
    ok: true,
    link: await createGiftPremiumInvoiceLink(user.id, await getPremiumPriceStars()),
  };
}

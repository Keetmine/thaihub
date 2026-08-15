"use server";

import { getCurrentUser } from "@/lib/userAuth";
import { createPremiumInvoiceLink } from "@/lib/telegram";

/** Ссылка-инвойс Telegram Stars на месяц подписки для текущего юзера. */
export async function getPremiumInvoiceLink(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Требуется вход");
  return createPremiumInvoiceLink(user.id);
}

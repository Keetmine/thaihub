"use client";

import { useState } from "react";
import { getPremiumInvoiceLink } from "@/app/(public)/premiumActions";

/** Кнопка оплаты подписки: получает инвойс-ссылку Telegram Stars и
 *  открывает её (в Telegram-клиенте или веб-версии). */
export default function BuyPremiumButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    try {
      const link = await getPremiumInvoiceLink();
      window.open(link, "_blank", "noopener");
    } catch {
      setError("Не удалось создать счёт — попробуйте позже");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={handleClick} disabled={isLoading}>
        {isLoading ? "Создаём счёт…" : "Оплатить в Telegram"}
      </button>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}

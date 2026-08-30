"use client";

import { useState } from "react";
import { getPremiumInvoiceLink } from "@/app/(public)/premiumActions";
import { useT } from "@/components/LocaleProvider";

/** Кнопка оплаты подписки: получает инвойс-ссылку Telegram Stars и
 *  открывает её (в Telegram-клиенте или веб-версии). */
export default function BuyPremiumButton() {
  const t = useT();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    try {
      // Экшен возвращает ошибку значением (текст исключения в проде до
      // клиента не доезжает) — показываем её вместо generic-текста.
      const result = await getPremiumInvoiceLink();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.link, "_blank", "noopener");
    } catch {
      setError(t.widgets.premium.payFailed);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={handleClick} disabled={isLoading}>
        {isLoading ? t.widgets.premium.paying : t.widgets.premium.pay}
      </button>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}

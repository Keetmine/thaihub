"use client";

import { useState } from "react";
import { getGiftPremiumInvoiceLink } from "@/app/(public)/premiumActions";
import { useT } from "@/components/LocaleProvider";

/**
 * «Подарить подписку» за Stars (аудит 2026-09 п.8): получает подарочный
 * инвойс и открывает его — как BuyPremiumButton, только payload у
 * инвойса другой, и после оплаты вебхук не продлевает подписку
 * покупателю, а присылает ему в Telegram одноразовый промокод с
 * открыткой для пересылки. Про это — подсказка под кнопкой: оплата
 * асинхронная (вебхук), показать код прямо на сайте в момент покупки
 * нельзя, и человек должен знать, где его ждать.
 */
export default function GiftPremiumButton() {
  const t = useT();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    try {
      // Ошибка — значением (текст исключения в проде до клиента не
      // доезжает) — показываем её вместо generic-текста.
      const result = await getGiftPremiumInvoiceLink();
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
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? t.widgets.premium.paying : t.widgets.premium.gift}
      </button>
      <p className="small text-secondary mt-2 mb-0">{t.widgets.premium.giftHint}</p>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}

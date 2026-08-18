import BuyPremiumButton from "@/components/BuyPremiumButton";
import PromoCodeRedeem from "@/components/PromoCodeRedeem";
import Link from "next/link";
import { getPaymentMode, getPremiumPriceStars } from "@/lib/siteSettings";

const FEATURES = [
  "Полная афиша: названия, площадки, составы и страницы событий",
  "Календарь и дневное расписание",
  "Поездки: план на даты, личные события, «что посетить»",
  "Подписка на календарь (ICS) и напоминания в Telegram",
];

/** Продающая заглушка платной функции. Кнопка оплаты появляется, когда
 *  настроен бот И режим оплаты — stars (переключается в /admin/settings:
 *  приём Stars зависит от страны владельца бота, и пока он недоступен,
 *  кнопка вела бы прямо в ошибку Telegram). Серверный компонент — читает
 *  настройки в рантайме. */
export default async function PremiumUpsell({ feature }: { feature: string }) {
  const [mode, price] = await Promise.all([getPaymentMode(), getPremiumPriceStars()]);
  const canPay = !!process.env.TELEGRAM_BOT_TOKEN && mode === "stars";

  return (
    <div className="surface p-5" style={{ maxWidth: "34rem", margin: "0 auto" }}>
      <div className="text-center mb-4">
        <div className="mb-2" style={{ fontSize: "2rem" }}>
          ✨
        </div>
        <h2 className="h4 font-display mb-1">{feature} — по подписке</h2>
        <p className="text-secondary small mb-0">
          {canPay ? `${price} Stars в месяц · продление в один клик` : "Подписка на месяц"}
        </p>
      </div>

      <ul className="list-unstyled d-flex flex-column gap-2 mb-4">
        {FEATURES.map((f) => (
          <li key={f} className="d-flex gap-2 small">
            <span style={{ color: "var(--bs-success)" }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="text-center">
        {canPay ? (
          <BuyPremiumButton />
        ) : (
          <p className="text-secondary small mb-0">
            Оплата через Telegram сейчас недоступна.{" "}
            <Link href="/help#feedback" className="link-body-emphasis">
              Напишите нам
            </Link>{" "}
            — подключим подписку к вашему аккаунту и пришлём промокод.
          </p>
        )}
        <div className="mt-3">
          <PromoCodeRedeem />
        </div>
      </div>
    </div>
  );
}

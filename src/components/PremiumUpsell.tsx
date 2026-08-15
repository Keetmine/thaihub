import BuyPremiumButton from "@/components/BuyPremiumButton";
import { PREMIUM_PRICE_STARS } from "@/lib/telegram";

const FEATURES = [
  "Полная афиша: названия, площадки, составы и страницы событий",
  "Календарь и дневное расписание",
  "Поездки: план на даты, личные события, «что посетить»",
  "Подписка на календарь (ICS) и напоминания в Telegram",
];

/** Продающая заглушка платной функции. Кнопка оплаты появляется, только
 *  когда настроен бот (Telegram Stars, см. premiumActions/webhook);
 *  без него — прежняя просьба написать нам. Серверный компонент —
 *  читает env в рантайме. */
export default function PremiumUpsell({ feature }: { feature: string }) {
  const canPay = !!process.env.TELEGRAM_BOT_TOKEN;

  return (
    <div className="surface p-5" style={{ maxWidth: "34rem", margin: "0 auto" }}>
      <div className="text-center mb-4">
        <div className="mb-2" style={{ fontSize: "2rem" }}>
          ✨
        </div>
        <h2 className="h4 font-display mb-1">{feature} — по подписке</h2>
        <p className="text-secondary small mb-0">
          {PREMIUM_PRICE_STARS} Stars в месяц · продление в один клик
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
            Напишите нам, чтобы подключить подписку к вашему аккаунту.
          </p>
        )}
      </div>
    </div>
  );
}

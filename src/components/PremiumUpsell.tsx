import BuyPremiumButton from "@/components/BuyPremiumButton";
import PromoCodeRedeem from "@/components/PromoCodeRedeem";
import Link from "next/link";
import { getPaymentMode, getPremiumPriceStars, getSubscriptionContact } from "@/lib/siteSettings";
import { TelegramIcon } from "@/components/icons";

// Буллеты — про пользу, а не перечень разделов (Э3.3): человек должен
// понять, что изменится в его жизни, а не какие таблицы откроются.
const FEATURES = [
  "Пресейлы под контролем: напоминание в Telegram за час до старта продаж — билеты не уплывут",
  "Полная афиша и календарь: все концерты и фанмиты с датами, площадками и составами",
  "Поездка без табличек: события, отели и «что посетить» в одном плане на ваши даты",
  "Календарь в телефоне: подписка ICS — события сами появляются в вашем календаре",
];

/** Продающая заглушка платной функции. Кнопка оплаты появляется, когда
 *  настроен бот И режим оплаты — stars (переключается в /admin/settings:
 *  приём Stars зависит от страны владельца бота, и пока он недоступен,
 *  кнопка вела бы прямо в ошибку Telegram). Серверный компонент — читает
 *  настройки в рантайме. */
export default async function PremiumUpsell({ feature }: { feature: string }) {
  const [mode, price, contact] = await Promise.all([
    getPaymentMode(),
    getPremiumPriceStars(),
    getSubscriptionContact(),
  ]);
  const canPay = !!process.env.TELEGRAM_BOT_TOKEN && mode === "stars";

  return (
    <div className="surface p-5" style={{ maxWidth: "34rem", margin: "0 auto" }}>
      <div className="text-center mb-4">
        <div className="mb-2" style={{ fontSize: "2rem" }}>
          ✨
        </div>
        <h2 className="h4 font-display mb-1">{feature} — по подписке</h2>
        <p className="text-secondary small mb-0">
          {canPay
            ? `${price} Stars в месяц · продление в один клик`
            : `${price} Stars в месяц · оплата по договорённости`}
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
          <div className="d-flex flex-column align-items-center gap-2">
            {contact && (
              <a
                href={`https://t.me/${contact}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary d-inline-flex align-items-center gap-2"
              >
                <TelegramIcon />
                Написать в Telegram
              </a>
            )}
            <p className="text-secondary small mb-0">
              Напишите — подключим подписку к вашему аккаунту и подскажем, как
              оплатить.{" "}
              <Link href="/help#feedback" className="link-body-emphasis">
                Или через форму на сайте
              </Link>
              .
            </p>
          </div>
        )}
        <div className="mt-3">
          <PromoCodeRedeem />
        </div>
      </div>
    </div>
  );
}

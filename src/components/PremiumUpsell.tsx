import BuyPremiumButton from "@/components/BuyPremiumButton";
import PromoCodeRedeem from "@/components/PromoCodeRedeem";
import Link from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import { getPaymentMode, getPremiumPriceStars, getSubscriptionContact } from "@/lib/siteSettings";
import { TelegramIcon } from "@/components/icons";

// Буллеты — про пользу, а не перечень разделов (Э3.3): человек должен
// понять, что изменится в его жизни, а не какие таблицы откроются.

/** Продающая заглушка платной функции. Кнопка оплаты появляется, когда
 *  настроен бот И режим оплаты — stars (переключается в /admin/settings:
 *  приём Stars зависит от страны владельца бота, и пока он недоступен,
 *  кнопка вела бы прямо в ошибку Telegram). Серверный компонент — читает
 *  настройки в рантайме.
 *
 *  `intro` — строка-мостик под заголовком: там, где часть содержимого
 *  показана честно и открыто (тизер афиши, публичная карточка события),
 *  человеку нужно объяснить, ЧТО он уже видит и что добавит подписка, а
 *  не просто упереться в стену. */
export default async function PremiumUpsell({
  feature,
  intro,
}: {
  feature: string;
  intro?: string;
}) {
  const [mode, price, contact] = await Promise.all([
    getPaymentMode(),
    getPremiumPriceStars(),
    getSubscriptionContact(),
  ]);
  const canPay = !!process.env.TELEGRAM_BOT_TOKEN && mode === "stars";
  const { t } = await getT();
  // Порядок — от самого горячего к остальному; список сверяем с ФАКом
  // («Что даёт подписка»), чтобы блок не отставал от продукта.
  const features = [
    t.widgets.premium.feed,
    t.widgets.premium.presales,
    t.widgets.premium.going,
    t.widgets.premium.trips,
    t.widgets.premium.stats,
    t.widgets.premium.create,
    t.widgets.premium.ics,
  ];

  return (
    <div className="surface p-5" style={{ maxWidth: "34rem", margin: "0 auto" }}>
      <div className="text-center mb-4">
        <div className="mb-2" style={{ fontSize: "2rem" }}>
          ✨
        </div>
        <h2 className="h4 font-display mb-1">{t.widgets.premium.heading(feature)}</h2>
        {intro && <p className="text-secondary small mb-2">{intro}</p>}
        {/* Цену показываем только там, где её можно заплатить в один
            клик (правка владельца 2026-09-09): «оплата по
            договорённости» рядом с цифрой звучала как торг, а сумму
            человек всё равно узнаёт в переписке. */}
        {canPay && (
          <p className="text-secondary small mb-0">{t.widgets.premium.priceOneClick(price)}</p>
        )}
      </div>

      <ul className="list-unstyled d-flex flex-column gap-2 mb-4">
        {features.map((f) => (
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
                {t.widgets.premium.writeTelegram}
              </a>
            )}
            <p className="text-secondary small mb-0">
              {t.widgets.premium.writeHint}{" "}
              <Link href="/help#feedback" className="link-body-emphasis">
                {t.widgets.premium.orForm}
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

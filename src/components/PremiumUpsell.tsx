import BuyPremiumButton from "@/components/BuyPremiumButton";
import PromoCodeRedeem from "@/components/PromoCodeRedeem";
import Link from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import { getPaymentMode, getPremiumPriceStars } from "@/lib/siteSettings";
import { FREE_ACCESS } from "@/lib/premium";

// Буллеты — про пользу, а не перечень разделов (Э3.3): человек должен
// понять, что изменится в его жизни, а не какие таблицы откроются.

/** Продающая заглушка платной функции. Кнопки «подарить подписку» тут
 *  НЕТ (правка владельца 2026-09-10): блок продаёт подписку тому, кто
 *  его читает, и второй призыв рядом с оплатой разводил внимание.
 *  ВНИМАНИЕ: другого входа в подарок на сайте нет — `GiftPremiumButton`
 *  и обработка подарочных промокодов живы, но сейчас ниоткуда не
 *  вызываются (см. docs/features/premium.md).
 *
 *  Кнопка оплаты появляется, когда
 *  настроен бот И режим оплаты — stars (переключается в /admin/settings:
 *  приём Stars зависит от страны владельца бота, и пока он недоступен,
 *  кнопка вела бы прямо в ошибку Telegram). Серверный компонент — читает
 *  настройки в рантайме.
 *
 *  `intro` — строка-мостик под заголовком: там, где часть содержимого
 *  показана честно и открыто (тизер афиши, публичная карточка события),
 *  человеку нужно объяснить, ЧТО он уже видит и что добавит подписка, а
 *  не просто упереться в стену.
 *
 *  ВО ВРЕМЯ АКЦИИ (`FREE_ACCESS`, см. lib/premium.ts) блок меняет
 *  адресата. Гейты пропускают любого залогиненного, поэтому досюда
 *  доходит ТОЛЬКО ГОСТЬ — и ему всё перечисленное уже открыто, не
 *  хватает аккаунта. Значит, и звать надо не «напишите про подписку», а
 *  «создайте аккаунт»: иначе плашка сверху дарит полный доступ, а блок
 *  тут же требует оплату. Поле промокода на это время убрано — код
 *  добавил бы месяцы подписки, которая сейчас ничего не открывает
 *  сверх акции, то есть сгорел бы впустую. */
export default async function PremiumUpsell({
  feature,
  intro,
}: {
  feature: string;
  intro?: string;
}) {
  const [mode, price] = await Promise.all([getPaymentMode(), getPremiumPriceStars()]);
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
        <h2 className="h4 font-display mb-1">
          {FREE_ACCESS
            ? t.widgets.freeAccess.heading(feature)
            : t.widgets.premium.heading(feature)}
        </h2>
        {intro && <p className="text-secondary small mb-2">{intro}</p>}
        {/* Цену показываем только там, где её можно заплатить в один
            клик (правка владельца 2026-09-09): «оплата по
            договорённости» рядом с цифрой звучала как торг, а сумму
            человек всё равно узнаёт в переписке. */}
        {!FREE_ACCESS && canPay && (
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
        {FREE_ACCESS ? (
          <div className="d-flex flex-column align-items-center gap-2">
            <Link href="/signup" className="btn btn-primary">
              {t.widgets.freeAccess.signupCta}
            </Link>
            <p className="text-secondary small mb-0">{t.widgets.freeAccess.signupHint}</p>
          </div>
        ) : canPay ? (
          <div className="d-flex flex-column align-items-center gap-3">
            <BuyPremiumButton />
          </div>
        ) : (
          <div className="d-flex flex-column align-items-center gap-2">
            {/* Кнопки «написать в Telegram» тут больше нет (правка
                владельца 2026-09-15): она вела в ЛИЧНЫЙ телеграм
                владельца, а сайт не должен показывать за собой
                конкретного человека. Остаётся форма обращения — она
                и так была рядом, и ответ по ней приходит туда же. */}
            <p className="text-secondary small mb-0">
              {t.widgets.premium.writeHint}{" "}
              <Link href="/help#feedback" className="link-body-emphasis">
                {t.widgets.premium.orForm}
              </Link>
              .
            </p>
          </div>
        )}
        {!FREE_ACCESS && (
          <div className="mt-3">
            <PromoCodeRedeem />
          </div>
        )}
      </div>
    </div>
  );
}

import AppLink from "@/components/AppLink";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.legal.terms.metaTitle,
    description: t.legal.terms.metaDescription,
    path: "/terms",
    locale,
  });
}

// Условия и оферта. Требуется Telegram для ботов, принимающих Stars
// (Live Checklist в core.telegram.org/bots/payments-stars) — бот
// отвечает на /terms ссылкой сюда.
export default async function TermsPage() {
  const { t } = await getT();
  return (
    <div className="container-narrow py-4">
      <span className="eyebrow">{t.legal.eyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        {t.legal.terms.title}
      </h1>

      <div className="surface p-4 d-flex flex-column gap-4">
        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.whatTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.terms.whatText}</p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.subscriptionTitle}</h2>
          {/* Акция «полный доступ в подарок»: подписка описана ниже
              как есть, но сейчас ничего не закрывает. Оговорка идёт
              ПЕРЕД списком — иначе человек прочтёт условия платного
              доступа как действующие. Здесь же, в отличие от плашки и
              ФАКа, сказано про предупреждение о завершении акции: это
              обязательство, и место ему в условиях. Снимается вместе с
              FREE_ACCESS (src/lib/premium.ts). */}
          <p className="promo-note mb-3">{t.legal.terms.subscriptionFreeNow}</p>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>{t.legal.terms.subscriptionAccess}</li>
            <li>{t.legal.terms.subscriptionOneOff}</li>
            <li>{t.legal.terms.subscriptionHow}</li>
            <li>{t.legal.terms.subscriptionPromo}</li>
          </ul>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.refundTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.terms.refundText}</p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.catalogueTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.terms.catalogueText}</p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.rulesTitle}</h2>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>{t.legal.terms.rulesRespect}</li>
            <li>{t.legal.terms.rulesImpersonation}</li>
            <li>{t.legal.terms.rulesEnforcement}</li>
          </ul>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.dataTitle}</h2>
          <p className="mb-0 text-secondary">
            {t.legal.terms.dataText}{" "}
            <AppLink href="/privacy" className="link-body-emphasis">
              {t.legal.terms.dataLink}
            </AppLink>
            .
          </p>
        </section>

        {/* Какая редакция главная. Английский текст — перевод, и читают
            его как обязательство: без этой оговорки неточность перевода
            становилась бы отдельным обещанием. */}
        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.languageTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.terms.languageText}</p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.terms.contactTitle}</h2>
          <p className="mb-0 text-secondary">
            {t.legal.terms.contactText}{" "}
            <AppLink href="/help" className="link-body-emphasis">
              {t.legal.terms.contactLink}
            </AppLink>{" "}
            {t.legal.terms.contactOr} <code>/support</code> {t.legal.terms.contactBot}
          </p>
        </section>
      </div>
    </div>
  );
}

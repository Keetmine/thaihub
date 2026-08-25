import AppLink from "@/components/AppLink";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.legal.privacy.metaTitle,
    description: t.legal.privacy.metaDescription,
    path: "/privacy",
    locale,
  });
}

// Политика обработки персональных данных. Написана под закон РБ № 99-З
// (владелец — самозанятая в Беларуси) с оглядкой на 152-ФЗ (аудитория в
// основном в РФ). NB: блок «Оператор» ждёт реквизиты от владельца —
// см. roadmap Э1.2.
export default async function PrivacyPage() {
  const { t } = await getT();
  return (
    <div className="container-narrow py-4">
      <span className="eyebrow">{t.legal.eyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        {t.legal.privacy.title}
      </h1>

      <div className="surface p-4 d-flex flex-column gap-4">
        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.operatorTitle}</h2>
          <p className="mb-0 text-secondary">
            {t.legal.privacy.operatorText}{" "}
            <AppLink href="/help" className="link-body-emphasis">
              {t.legal.privacy.operatorLink}
            </AppLink>{" "}
            {t.legal.privacy.operatorOr} <code>/support</code>{" "}
            {t.legal.privacy.operatorBot}
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.collectTitle}</h2>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>{t.legal.privacy.collectAccount}</li>
            <li>{t.legal.privacy.collectProfile}</li>
            <li>{t.legal.privacy.collectActivity}</li>
            <li>{t.legal.privacy.collectTechnical}</li>
          </ul>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.whyTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.privacy.whyText}</p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.cookiesTitle}</h2>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>{t.legal.privacy.cookiesNecessary}</li>
            <li>{t.legal.privacy.cookiesAnalytics}</li>
          </ul>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.servicesTitle}</h2>
          <ul className="text-secondary mb-0 d-flex flex-column gap-2">
            <li>{t.legal.privacy.servicesMetrica}</li>
            <li>{t.legal.privacy.servicesSentry}</li>
            <li>{t.legal.privacy.servicesTelegram}</li>
            <li>{t.legal.privacy.servicesGoogle}</li>
          </ul>
          <p className="mb-0 mt-2 text-secondary">
            {t.legal.privacy.servicesCrossBorder}
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.retentionTitle}</h2>
          <p className="mb-0 text-secondary">
            {t.legal.privacy.retentionText}{" "}
            <AppLink href="/help" className="link-body-emphasis">
              {t.legal.privacy.retentionLink}
            </AppLink>{" "}
            {t.legal.privacy.retentionAfter}
          </p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.publicFiguresTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.privacy.publicFiguresText}</p>
        </section>

        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.changesTitle}</h2>
          <p className="mb-0 text-secondary">
            {t.legal.privacy.changesText} {t.legal.privacy.changesDate}.
          </p>
        </section>

        {/* Какая редакция главная. Английский текст — перевод, и читают
            его как обязательство: без этой оговорки неточность перевода
            становилась бы отдельным обещанием. */}
        <section>
          <h2 className="section-heading mb-2">{t.legal.privacy.languageTitle}</h2>
          <p className="mb-0 text-secondary">{t.legal.privacy.languageText}</p>
        </section>
      </div>
    </div>
  );
}

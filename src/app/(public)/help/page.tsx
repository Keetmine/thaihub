import AppLink from "@/components/AppLink";
import PageHeader from "@/components/PageHeader";
import FeedbackForm from "@/components/FeedbackForm";
import { getCurrentUser } from "@/lib/userAuth";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.legal.help.metaTitle,
    description: t.legal.help.metaDescription,
    path: "/help",
    locale,
  });
}


export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ fb?: string }>;
}) {
  // ?fb=<запрос> — переход из пустого поиска: подставляем контекст и
  // сразу выбираем «добавьте сериал/актёра».
  const { fb } = await searchParams;
  const { t } = await getT();
  const user = await getCurrentUser();
  return (
    <div>
      <PageHeader eyebrow={t.legal.help.eyebrow} title={t.legal.help.title} className="mb-5" />

      <div className="row g-4">
        <div className="col-12 col-lg-7 d-flex flex-column gap-3">
        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">{t.legal.help.whatTitle}</h2>
          <p className="text-secondary mb-0">{t.legal.help.whatText}</p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">{t.legal.help.favouritesTitle}</h2>
          <p className="text-secondary mb-0">
            {t.legal.help.favouritesText}{" "}
            <AppLink href="/account" className="link-body-emphasis">
              {t.legal.help.favouritesLink}
            </AppLink>
            .
          </p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">{t.legal.help.goingTitle}</h2>
          <p className="text-secondary mb-0">{t.legal.help.goingText}</p>
        </div>

        <div className="surface p-4">
          <h2 className="h6 fw-semibold mb-2">{t.legal.help.friendsTitle}</h2>
          <p className="text-secondary mb-0">
            {t.legal.help.friendsBefore}{" "}
            <AppLink href="/friends" className="link-body-emphasis">
              {t.legal.help.friendsLink}
            </AppLink>{" "}
            {t.legal.help.friendsAfter}
          </p>
        </div>

        </div>
        <div className="col-12 col-lg-5">
          <div className="surface p-4 position-sticky" id="feedback" style={{ top: "6.5rem" }}>
          <h2 className="h6 fw-semibold mb-2">{t.legal.help.feedbackTitle}</h2>
          <p className="text-secondary small mb-3">{t.legal.help.feedbackHint}</p>
          <FeedbackForm
            defaultKind={fb ? "CONTENT_REQUEST" : "QUESTION"}
            context={fb ? t.legal.help.searchContext(fb) : ""}
            defaultEmail={user?.email ?? ""}
            emailRequired={!user}
          />
          </div>
        </div>
      </div>
    </div>
  );
}

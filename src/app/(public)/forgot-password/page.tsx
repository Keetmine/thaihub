import AppLink from "@/components/AppLink";
import Logo from "@/components/Logo";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import ForgotForm from "./ForgotForm";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.auth.forgot.metaTitle,
    description: t.auth.forgot.metaDescription,
    path: "/forgot-password",
    noIndex: true,
    locale,
  });
}

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <div className="mx-auto" style={{ maxWidth: "24rem" }}>
      <div className="text-center mb-4">
        <Logo />
      </div>
      <h1 className="h4 font-display text-center mb-3">{t.auth.forgot.title}</h1>
      <p className="small text-secondary text-center mb-4">{t.auth.forgot.lead}</p>
      <ForgotForm />
      <p className="small text-secondary text-center mt-3 mb-0">
        <AppLink href="/login" className="link-body-emphasis">
          {t.auth.forgot.backToLogin}
        </AppLink>
      </p>
    </div>
  );
}

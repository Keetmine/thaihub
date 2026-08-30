import AppLink from "@/components/AppLink";
import Logo from "@/components/Logo";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import ResetPasswordForm from "./ResetPasswordForm";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.auth.reset.metaTitle,
    description: t.auth.reset.metaDescription,
    noIndex: true,
    locale,
  });
}

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getT();
  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  const valid = !!row && !row.usedAt && row.expiresAt > new Date();

  return (
    <div className="mx-auto" style={{ maxWidth: "24rem" }}>
      <div className="text-center mb-4">
        <Logo />
      </div>
      <h1 className="h4 font-display text-center mb-3">{t.auth.reset.title}</h1>
      {!valid ? (
        <p className="small text-warning text-center mb-0">
          {t.auth.reset.invalidLink}{" "}
          <AppLink href="/forgot-password" className="link-body-emphasis">
            {t.auth.reset.invalidLinkCta}
          </AppLink>
          .
        </p>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </div>
  );
}

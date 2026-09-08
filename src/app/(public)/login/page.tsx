import { redirect } from "next/navigation";
import AppLink from "@/components/AppLink";
import PasswordInput from "@/components/PasswordInput";
import Logo from "@/components/Logo";
import { GoogleIcon } from "@/components/icons";
import { login } from "./actions";
import { telegramBotUsername } from "@/lib/telegram";
import TelegramLoginButton from "@/components/TelegramLoginButton";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/userAuth";
import { sanitizeNextPath } from "@/lib/loginNext";
import { getT, localeHref } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.auth.login.metaTitle,
    description: t.auth.login.metaDescription,
    path: "/login",
    noIndex: true,
    locale,
  });
}


export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: rawNext } = await searchParams;
  const { locale, t } = await getT();
  // Куда вернуть после входа (?next= проставляют прокси и гейты
  // приватных страниц). Значение из URL — чужое: валидируем и здесь,
  // чтобы не пронести мусор в скрытое поле и ссылку на регистрацию.
  const next = sanitizeNextPath(rawNext);
  // Залогиненного форма входа только сбивает с толку — уводим сразу
  // туда, куда он шёл (или в кабинет).
  if (await getCurrentUser()) redirect(localeHref(next ?? "/account", locale));
  // Виджет появляется только когда бот настроен (env задан) — читаем на
  // сервере в рантайме, поэтому NEXT_PUBLIC-переменная не нужна.
  const botUsername = telegramBotUsername();
  // Кнопка Google появляется только когда OAuth настроен (env задан).
  const hasGoogle = !!process.env.GOOGLE_CLIENT_ID;

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: "70vh" }}
    >
      <form
        action={login}
        className="surface p-4 w-100"
        style={{ maxWidth: "24rem" }}
      >
        <div className="d-flex justify-content-center mb-4">
          <Logo />
        </div>
        <h1 className="h6 text-center text-secondary text-uppercase mb-4" style={{ letterSpacing: "0.08em" }}>
          {t.auth.login.title}
        </h1>
        {error === "telegram" ? (
          <p className="small text-danger text-center mb-3">
            {t.auth.login.telegramError}
          </p>
        ) : error === "google" ? (
          <p className="small text-danger text-center mb-3">
            {t.auth.login.googleError}
          </p>
        ) : error === "rate" ? (
          <p className="small text-danger text-center mb-3">{t.auth.login.rateLimited}</p>
        ) : error ? (
          <p className="small text-danger text-center mb-3">{t.auth.login.wrongCredentials}</p>
        ) : null}
        {/* Возврат после входа: экшен читает next из формы, а не из URL —
            server action своего URL не видит. */}
        {next && <input type="hidden" name="next" value={next} />}
        <label className="form-label" htmlFor="login-email">{t.auth.login.email}</label>
        <input id="login-email" type="email" name="email" required autoFocus className="form-control mb-3" />
        <label className="form-label" htmlFor="login-password">{t.auth.login.password}</label>
        <PasswordInput id="login-password" name="password" required autoComplete="current-password" className="mb-1" />
        <p className="small text-end mb-3">
          <AppLink href="/forgot-password" className="text-secondary text-decoration-none">
            {t.auth.login.forgot}
          </AppLink>
        </p>
        <button type="submit" className="btn btn-primary w-100 mb-3">
          {t.auth.login.submit}
        </button>
        {hasGoogle && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- API-роут OAuth, не страница
          <a href="/api/auth/google" className="btn btn-outline-secondary w-100 mb-3">
            <GoogleIcon className="me-2" />
            {t.auth.login.google}
          </a>
        )}
        {botUsername && (
          <div className="text-center mb-3">
            <p className="small text-secondary mb-2">{t.auth.login.or}</p>
            <TelegramLoginButton botUsername={botUsername} />
          </div>
        )}
        <p className="small text-secondary text-center mb-0">
          {t.auth.login.noAccount}{" "}
          {/* next едет и на регистрацию: пришедший по гейту может не
              иметь аккаунта, а вернуться после signup должен туда же. */}
          <AppLink
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="link-body-emphasis"
          >
            {t.auth.login.signupLink}
          </AppLink>
        </p>
      </form>
    </div>
  );
}

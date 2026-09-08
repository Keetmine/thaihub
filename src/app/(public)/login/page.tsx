import { redirect } from "next/navigation";
import AppLink from "@/components/AppLink";
import PasswordInput from "@/components/PasswordInput";
import Logo from "@/components/Logo";
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
            <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" style={{ marginRight: "0.5rem", verticalAlign: "-0.2em" }}>
              <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.1 3.58-5.17 3.58-8.81z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"/>
              <path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.55.37-2.27v-3.1H1.29a12 12 0 0 0 0 10.74l3.98-3.1z"/>
              <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"/>
            </svg>
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

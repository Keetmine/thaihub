import { redirect } from "next/navigation";
import AppLink from "@/components/AppLink";
import PasswordInput from "@/components/PasswordInput";
import Logo from "@/components/Logo";
import TelegramLoginButton from "@/components/TelegramLoginButton";
import { signup } from "./actions";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/userAuth";
import { telegramBotUsername } from "@/lib/telegram";
import { sanitizeNextPath } from "@/lib/loginNext";
import { getT, localeHref } from "@/lib/i18n";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.auth.signup.metaTitle,
    description: t.auth.signup.metaDescription,
    path: "/signup",
    noIndex: true,
    locale,
  });
}


export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; ref?: string }>;
}) {
  const { error, next: rawNext, ref: rawRef } = await searchParams;
  const { locale, t } = await getT();
  // Возврат после регистрации: next приезжает со страницы входа
  // (гость упёрся в гейт → /login?next=… → «Зарегистрироваться»).
  // Значение из URL — чужое, валидируем и здесь.
  const next = sanitizeNextPath(rawNext);
  // Реферальная ссылка /signup?ref=<ник или id> (аудит 2026-09 п.7):
  // значение просто едет в экшен hidden-полем — валидность (есть ли
  // такой пользователь) проверяет он, а битый ref регистрацию не
  // ломает и ошибок на форме не рисует. Обрезка — чтобы чужая строка
  // из URL не раздувала форму.
  const ref = (rawRef ?? "").trim().slice(0, 64);
  // Залогиненному регистрироваться незачем — форма только путала.
  if (await getCurrentUser()) redirect(localeHref(next ?? "/account", locale));
  const hasGoogle = !!process.env.GOOGLE_CLIENT_ID;
  const botUsername = telegramBotUsername();

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: "70vh" }}
    >
      <form
        action={signup}
        className="surface p-4 w-100"
        style={{ maxWidth: "24rem" }}
      >
        <div className="d-flex justify-content-center mb-4">
          <Logo />
        </div>
        <h1 className="h6 text-center text-secondary text-uppercase mb-4" style={{ letterSpacing: "0.08em" }}>
          {t.auth.signup.title}
        </h1>
        {error === "exists" && (
          <p className="small text-danger text-center mb-3">{t.auth.signup.emailTaken}</p>
        )}
        {error === "1" && (
          <p className="small text-danger text-center mb-3">{t.auth.signup.invalid}</p>
        )}
        {/* Возврат после регистрации: экшен читает next из формы. */}
        {next && <input type="hidden" name="next" value={next} />}
        {/* Кто пригласил (реферальная ссылка) — тоже сквозь форму. */}
        {ref && <input type="hidden" name="ref" value={ref} />}
        {/* Ханипот против ботов: поле скрыто от людей, автозаполнялки
            ботов его заполняют — такие регистрации молча отбрасываются. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }}
        />
        <label className="form-label" htmlFor="signup-name">{t.auth.signup.name}</label>
        <input id="signup-name" name="name" className="form-control mb-3" />
        <label className="form-label" htmlFor="signup-email">{t.auth.signup.email}</label>
        <input id="signup-email" type="email" name="email" required className="form-control mb-3" />
        <label className="form-label" htmlFor="signup-password">{t.auth.signup.password}</label>
        <PasswordInput id="signup-password" name="password" required minLength={6} autoComplete="new-password" className="mb-3" />
        <div className="form-check mb-3">
          <input
            type="checkbox"
            name="acceptTerms"
            id="accept-terms"
            required
            className="form-check-input"
          />
          <label htmlFor="accept-terms" className="form-check-label small text-secondary">
            {t.auth.signup.accept}{" "}
            <AppLink href="/terms" className="link-body-emphasis" target="_blank">
              {t.auth.signup.terms}
            </AppLink>{" "}
            {t.auth.signup.and}{" "}
            <AppLink href="/privacy" className="link-body-emphasis" target="_blank">
              {t.auth.signup.privacy}
            </AppLink>
          </label>
        </div>
        <button type="submit" className="btn btn-primary w-100 mb-3">
          {t.auth.signup.submit}
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
            {t.auth.signup.google}
          </a>
        )}
        {botUsername && (
          <div className="text-center mb-3">
            <p className="small text-secondary mb-2">{t.auth.signup.or}</p>
            <TelegramLoginButton botUsername={botUsername} />
          </div>
        )}
        {(hasGoogle || botUsername) && (
          <p className="small text-secondary text-center mb-3" style={{ opacity: 0.8 }}>
            {t.auth.signup.oauthNotice}{" "}
            <AppLink href="/terms" className="link-body-emphasis">{t.auth.signup.termsWith}</AppLink>{" "}
            {t.auth.signup.and}{" "}
            <AppLink href="/privacy" className="link-body-emphasis">{t.auth.signup.privacyWith}</AppLink>.
          </p>
        )}
        <p className="small text-secondary text-center mb-0">
          {t.auth.signup.haveAccount}{" "}
          {/* next едет обратно на вход: человек мог передумать
              регистрироваться, а вернуться после входа должен туда же. */}
          <AppLink
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="link-body-emphasis"
          >
            {t.auth.signup.loginLink}
          </AppLink>
        </p>
      </form>
    </div>
  );
}

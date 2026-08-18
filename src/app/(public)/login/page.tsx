import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";
import Logo from "@/components/Logo";
import { login } from "./actions";
import { telegramBotUsername } from "@/lib/telegram";
import TelegramLoginButton from "@/components/TelegramLoginButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
          Вход
        </h1>
        {error === "telegram" ? (
          <p className="small text-danger text-center mb-3">
            Не удалось войти через Telegram — попробуйте ещё раз
          </p>
        ) : error === "google" ? (
          <p className="small text-danger text-center mb-3">
            Не удалось войти через Google — попробуйте ещё раз
          </p>
        ) : error ? (
          <p className="small text-danger text-center mb-3">Неверный email или пароль</p>
        ) : null}
        <label className="form-label">Email</label>
        <input type="email" name="email" required autoFocus className="form-control mb-3" />
        <label className="form-label">Пароль</label>
        <PasswordInput name="password" required autoComplete="current-password" className="mb-1" />
        <p className="small text-end mb-3">
          <Link href="/forgot-password" className="text-secondary text-decoration-none">
            Забыли пароль?
          </Link>
        </p>
        <button type="submit" className="btn btn-primary w-100 mb-3">
          Войти
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
            Войти через Google
          </a>
        )}
        {botUsername && (
          <div className="text-center mb-3">
            <p className="small text-secondary mb-2">или</p>
            <TelegramLoginButton botUsername={botUsername} />
          </div>
        )}
        <p className="small text-secondary text-center mb-0">
          Нет аккаунта?{" "}
          <Link href="/signup" className="link-body-emphasis">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  );
}

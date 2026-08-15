import Link from "next/link";
import Logo from "@/components/Logo";
import { login } from "./actions";
import { telegramBotUsername } from "@/lib/telegram";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Виджет появляется только когда бот настроен (env задан) — читаем на
  // сервере в рантайме, поэтому NEXT_PUBLIC-переменная не нужна.
  const botUsername = telegramBotUsername();

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
        ) : error ? (
          <p className="small text-danger text-center mb-3">Неверный email или пароль</p>
        ) : null}
        <label className="form-label">Email</label>
        <input type="email" name="email" required autoFocus className="form-control mb-3" />
        <label className="form-label">Пароль</label>
        <input type="password" name="password" required className="form-control mb-3" />
        <button type="submit" className="btn btn-primary w-100 mb-3">
          Войти
        </button>
        {botUsername && (
          <div className="text-center mb-3">
            <p className="small text-secondary mb-2">или</p>
            {/* Официальный Telegram Login Widget: после подтверждения
                Telegram редиректит на data-auth-url с подписанным
                профилем (проверяется в /api/auth/telegram). Работает
                только с домена, привязанного к боту через /setdomain. */}
            <script
              async
              src="https://telegram.org/js/telegram-widget.js?22"
              data-telegram-login={botUsername}
              data-size="large"
              data-auth-url="/api/auth/telegram"
              data-request-access="write"
            />
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

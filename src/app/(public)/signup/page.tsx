import Link from "next/link";
import Logo from "@/components/Logo";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
          Регистрация
        </h1>
        {error === "exists" && (
          <p className="small text-danger text-center mb-3">Такой email уже зарегистрирован</p>
        )}
        {error === "1" && (
          <p className="small text-danger text-center mb-3">Проверьте email и пароль (мин. 6 символов)</p>
        )}
        {error === "invite" && (
          <p className="small text-danger text-center mb-3">
            Неверный или уже использованный инвайт-код
          </p>
        )}
        <label className="form-label">Имя</label>
        <input name="name" className="form-control mb-3" />
        <label className="form-label">Email</label>
        <input type="email" name="email" required className="form-control mb-3" />
        <label className="form-label">Пароль</label>
        <input type="password" name="password" required minLength={6} className="form-control mb-3" />
        <label className="form-label">Инвайт-код</label>
        <input name="inviteCode" required className="form-control mb-3" placeholder="Код приглашения" />
        <button type="submit" className="btn btn-primary w-100 mb-3">
          Зарегистрироваться
        </button>
        <p className="small text-secondary text-center mb-0">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="link-body-emphasis">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}

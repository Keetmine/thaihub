import Link from "next/link";
import Logo from "@/components/Logo";
import { login } from "./actions";

export default async function LoginPage({
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
        {error && (
          <p className="small text-danger text-center mb-3">Неверный email или пароль</p>
        )}
        <label className="form-label">Email</label>
        <input type="email" name="email" required autoFocus className="form-control mb-3" />
        <label className="form-label">Пароль</label>
        <input type="password" name="password" required className="form-control mb-3" />
        <button type="submit" className="btn btn-primary w-100 mb-3">
          Войти
        </button>
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

import Link from "next/link";
import Logo from "@/components/Logo";
import ForgotForm from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto" style={{ maxWidth: "24rem" }}>
      <div className="text-center mb-4">
        <Logo />
      </div>
      <h1 className="h4 font-display text-center mb-3">Забыли пароль?</h1>
      <p className="small text-secondary text-center mb-4">
        Укажите почту аккаунта — пришлём ссылку для сброса.
      </p>
      <ForgotForm />
      <p className="small text-secondary text-center mt-3 mb-0">
        <Link href="/login" className="link-body-emphasis">← Вернуться ко входу</Link>
      </p>
    </div>
  );
}

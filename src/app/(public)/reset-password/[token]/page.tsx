import Logo from "@/components/Logo";
import PasswordInput from "@/components/PasswordInput";
import { prisma } from "@/lib/prisma";
import { resetPassword } from "../actions";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  const valid = !!row && !row.usedAt && row.expiresAt > new Date();

  return (
    <div className="mx-auto" style={{ maxWidth: "24rem" }}>
      <div className="text-center mb-4">
        <Logo />
      </div>
      <h1 className="h4 font-display text-center mb-3">Новый пароль</h1>
      {!valid ? (
        <p className="small text-warning text-center mb-0">
          Ссылка недействительна или устарела —{" "}
          <a href="/forgot-password" className="link-body-emphasis">запросите сброс ещё раз</a>.
        </p>
      ) : (
        <form action={resetPassword.bind(null, token)}>
          <label className="form-label">Придумайте пароль</label>
          <PasswordInput name="password" required minLength={6} autoComplete="new-password" className="mb-3" />
          <button type="submit" className="btn btn-primary w-100">
            Сохранить и войти
          </button>
        </form>
      )}
    </div>
  );
}

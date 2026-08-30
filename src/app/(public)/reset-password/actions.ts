"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/userAuth";
import { getT, localeHref } from "@/lib/i18n";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). Успех делает
 *  redirect — до return дело не доходит. */
export type ResetPasswordResult = { ok: false; error: string };

export async function resetPassword(
  token: string,
  formData: FormData,
): Promise<ResetPasswordResult | void> {
  const { locale, t } = await getT();
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { ok: false, error: t.auth.reset.tooShort };

  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return { ok: false, error: t.auth.reset.linkInvalid };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
    // Сброс делают, когда пароль забыт ИЛИ утёк: все старые сессии
    // закрываем — если аккаунтом успел завладеть кто-то ещё, его
    // сессия гаснет вместе с остальными. Своей активной сессии у
    // сбрасывающего нет — он и так не мог войти.
    prisma.userSession.deleteMany({ where: { userId: row.userId } }),
  ]);
  redirect(localeHref("/login?reset=1", locale));
}

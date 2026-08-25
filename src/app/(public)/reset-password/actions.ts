"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/userAuth";
import { getLocale, localeHref } from "@/lib/i18n";

export async function resetPassword(token: string, formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) throw new Error("Пароль слишком короткий");

  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new Error("Ссылка недействительна или устарела — запросите сброс ещё раз");
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
  ]);
  redirect(localeHref("/login?reset=1", await getLocale()));
}

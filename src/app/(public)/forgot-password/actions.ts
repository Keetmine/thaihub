"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rateLimit";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { getT, localeHref } from "@/lib/i18n";

/** Запрос сброса пароля: всегда отвечает «письмо отправлено» (не
 *  раскрываем существование ящика), кроме случая ненастроенного SMTP. */
export async function requestPasswordReset(
  formData: FormData,
): Promise<{ ok: boolean; smtpMissing?: boolean }> {
  if (!isMailerConfigured()) return { ok: false, smtpMissing: true };
  await assertRateLimit("signup");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: true };

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, passwordHash: { not: null } },
  });
  if (!user) return { ok: true }; // молча — существование ящика не раскрываем

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  const base = process.env.SITE_URL ?? "https://myblhub.com";
  // Письмо на языке страницы, с которой запросили сброс, и ссылка туда же:
  // с /ru она должна вести на русскую версию формы.
  const { locale, t } = await getT();
  await sendMail(
    email,
    t.auth.resetEmail.subject,
    t.auth.resetEmail.body(`${base}${localeHref(`/reset-password/${token}`, locale)}`),
  );
  return { ok: true };
}

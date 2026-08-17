"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rateLimit";
import { isMailerConfigured, sendMail } from "@/lib/mailer";

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
  await sendMail(
    email,
    "Сброс пароля — MyBLHub",
    `Чтобы задать новый пароль, перейдите по ссылке (действует час):\n\n${base}/reset-password/${token}\n\nЕсли вы не запрашивали сброс — просто проигнорируйте это письмо.`,
  );
  return { ok: true };
}

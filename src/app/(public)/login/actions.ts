"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, destroyUserSession, verifyPassword } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";
import { getLocale, localeHref } from "@/lib/i18n";

export async function login(formData: FormData) {
  await assertRateLimit("login");
  // Язык страницы, с которой пришла форма: иначе после входа с /ru
  // человека выбрасывало на английскую версию кабинета.
  const locale = await getLocale();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  // passwordHash is null for Telegram-auth accounts — they can't log in
  // with a password at all, same error as a wrong one.
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    redirect(localeHref("/login?error=1", locale));
  }

  await createUserSession(user.id);
  redirect(localeHref("/account", locale));
}

export async function logout() {
  const locale = await getLocale();
  await destroyUserSession();
  redirect(localeHref("/", locale));
}

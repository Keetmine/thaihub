"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, destroyUserSession, verifyPassword } from "@/lib/userAuth";
import { isRateLimited } from "@/lib/rateLimit";
import { sanitizeNextPath } from "@/lib/loginNext";
import { getLocale, localeHref } from "@/lib/i18n";

export async function login(formData: FormData) {
  // Язык страницы, с которой пришла форма: иначе после входа с /ru
  // человека выбрасывало на английскую версию кабинета.
  const locale = await getLocale();
  // Возврат после входа: скрытое поле формы (изначально — из ?next=,
  // который проставляет прокси, уводя гостя с приватной страницы).
  // Валидация строгая — см. sanitizeNextPath; мусор молча превращается
  // в обычный путь через /account.
  const next = sanitizeNextPath(formData.get("next"));
  // При ошибке next проносится обратно в форму, чтобы возврат пережил
  // и опечатку в пароле.
  const nextQs = next ? `&next=${encodeURIComponent(next)}` : "";

  // Лимит — значением, не исключением: текст брошенной ошибки прод
  // съедает, а так форма показывает человеческое «подождите».
  if (await isRateLimited("login")) {
    redirect(localeHref(`/login?error=rate${nextQs}`, locale));
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  // passwordHash is null for Telegram-auth accounts — they can't log in
  // with a password at all, same error as a wrong one.
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    redirect(localeHref(`/login?error=1${nextQs}`, locale));
  }

  await createUserSession(user.id);
  redirect(localeHref(next ?? "/account", locale));
}

export async function logout() {
  const locale = await getLocale();
  await destroyUserSession();
  redirect(localeHref("/", locale));
}

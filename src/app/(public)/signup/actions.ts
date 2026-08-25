"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, hashPassword } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";
import { getLocale, localeHref } from "@/lib/i18n";

export async function signup(formData: FormData) {
  await assertRateLimit("signup");
  // Язык страницы, с которой пришла форма: онбординг после регистрации
  // должен продолжиться на том же языке.
  const locale = await getLocale();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  // Ханипот (см. signup/page.tsx): заполнен — значит бот. Отвечаем как
  // при успехе, чтобы не подсказывать, что регистрация не прошла.
  if (String(formData.get("website") ?? "").trim()) {
    redirect(localeHref("/welcome/profile", locale));
  }

  if (!email || password.length < 6) {
    redirect(localeHref("/signup?error=1", locale));
  }

  // Чекбокс согласия с условиями и политикой обязателен (браузер
  // проверяет required, здесь — на случай запроса мимо формы).
  if (formData.get("acceptTerms") !== "on") {
    redirect(localeHref("/signup?error=1", locale));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect(localeHref("/signup?error=exists", locale));
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      name: name || null,
    },
  });

  await createUserSession(user.id);
  redirect(localeHref("/welcome/profile", locale));
}

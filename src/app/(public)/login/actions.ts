"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, destroyUserSession, verifyPassword } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";

export async function login(formData: FormData) {
  await assertRateLimit("login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  // passwordHash is null for Telegram-auth accounts — they can't log in
  // with a password at all, same error as a wrong one.
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=1");
  }

  await createUserSession(user.id);
  redirect("/account");
}

export async function logout() {
  await destroyUserSession();
  redirect("/");
}

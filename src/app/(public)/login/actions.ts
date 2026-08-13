"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, destroyUserSession, verifyPassword } from "@/lib/userAuth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=1");
  }

  await createUserSession(user.id);
  redirect("/account");
}

export async function logout() {
  await destroyUserSession();
  redirect("/");
}

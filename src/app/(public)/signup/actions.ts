"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createUserSession, hashPassword } from "@/lib/userAuth";
import { assertRateLimit } from "@/lib/rateLimit";

export async function signup(formData: FormData) {
  await assertRateLimit("signup");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || password.length < 6) {
    redirect("/signup?error=1");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=exists");
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      name: name || null,
    },
  });

  await createUserSession(user.id);
  redirect("/account");
}

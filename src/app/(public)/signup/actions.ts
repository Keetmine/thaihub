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
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();

  if (!email || password.length < 6) {
    redirect("/signup?error=1");
  }

  // Регистрация по инвайтам: код генерируется в /admin/users, одноразовый.
  const invite = inviteCode
    ? await prisma.inviteCode.findUnique({ where: { code: inviteCode } })
    : null;
  if (!invite || invite.usedAt) {
    redirect("/signup?error=invite");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=exists");
  }

  // Код помечается использованным той же транзакцией, что создаёт юзера —
  // параллельная регистрация с тем же кодом не пройдёт (updateMany с
  // условием usedAt: null сработает только у одного).
  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.inviteCode.updateMany({
      where: { code: invite.code, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error("invite already used");
    const created = await tx.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        name: name || null,
      },
    });
    await tx.inviteCode.update({ where: { code: invite.code }, data: { usedById: created.id } });
    return created;
  });

  await createUserSession(user.id);
  redirect("/account");
}

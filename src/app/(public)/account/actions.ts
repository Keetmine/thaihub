"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/userAuth";

export async function updateProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();

  await prisma.user.update({
    where: { id: user.id },
    data: { name: name || null, photoUrl: photoUrl || null },
  });

  revalidatePath("/account");
  revalidatePath("/account/settings");
}

export async function changePassword(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new Error("Неверный текущий пароль");
  }
  if (newPassword.length < 6) {
    throw new Error("Новый пароль должен быть не короче 6 символов");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("Пароли не совпадают");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword) },
  });
}

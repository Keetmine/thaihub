"use server";

import { randomUUID } from "crypto";
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
    data: {
      name: name || null,
      photoUrl: photoUrl || null,
    },
  });

  revalidatePath("/account");
  revalidatePath("/account/settings");
}

/** Отдельная форма приватности (вкладка в настройках) — не смешиваем с
 *  именем/фото, чтобы сабмит одной вкладки не затирал другую. */
export async function updatePrivacy(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      hideProfileActivity: String(formData.get("hideProfileActivity") ?? "") === "on",
      hideAchievements: String(formData.get("hideAchievements") ?? "") === "on",
      hideFavoritePerformers: String(formData.get("hideFavoritePerformers") ?? "") === "on",
      hideVisitedPlaces: String(formData.get("hideVisitedPlaces") ?? "") === "on",
    },
  });
  revalidatePath("/account/settings");
}

export async function changePassword(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!user.passwordHash) {
    throw new Error("Аккаунт создан через Telegram — пароля у него нет");
  }
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

/** Returns the user's ICS feed token, generating one on first use. */
export async function getOrCreateIcsToken(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.icsToken) return user.icsToken;

  const token = randomUUID();
  await prisma.user.update({ where: { id: user.id }, data: { icsToken: token } });
  return token;
}

/** Invalidates the current feed URL (e.g. if it leaked) and issues a new one. */
export async function regenerateIcsToken(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const token = randomUUID();
  await prisma.user.update({ where: { id: user.id }, data: { icsToken: token } });
  revalidatePath("/account/settings");
  return token;
}

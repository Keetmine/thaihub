"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isKnownTimezone } from "@/lib/timezones";
import {
  destroyUserSession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/userAuth";
import { softDeleteUser } from "@/lib/userDeletion";
import { isValidUsername, RESERVED_USERNAMES } from "@/lib/userProfile";
import { isKnownCountry } from "@/lib/countries";

export async function updateProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const country = String(formData.get("country") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const birthRaw = String(formData.get("birthDate") ?? "").trim();
  const [by, bm, bd] = birthRaw.split("-").map(Number);

  // Ник меняется здесь же: он уникален и служит адресом профиля,
  // поэтому проверяем формат и занятость, а при ошибке молча оставляем
  // прежний — форма настроек не показывает ошибки полей.
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  let nextUsername: string | undefined;
  if (username && username !== user.username) {
    const valid = isValidUsername(username) && !RESERVED_USERNAMES.has(username);
    const taken = valid
      ? await prisma.user.findFirst({ where: { username, id: { not: user.id } }, select: { id: true } })
      : null;
    if (valid && !taken) nextUsername = username;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: name || null,
      photoUrl: photoUrl || null,
      // Неизвестное значение молча не пишем — остаётся прежняя зона.
      ...(isKnownTimezone(timezone) ? { timezone } : {}),
      ...(nextUsername ? { username: nextUsername } : {}),
      country: country && isKnownCountry(country) ? country : null,
      gender: gender || null,
      bio: bio || null,
      birthDate: by && bm && bd ? new Date(Date.UTC(by, bm - 1, bd)) : null,
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

/** Отвязать Telegram от аккаунта. Уведомления после этого слать некуда,
 *  поэтому предупреждаем прямо в настройках. Вход через Telegram у
 *  аккаунта без пароля тоже перестанет работать — но пароль можно
 *  задать там же, во вкладке «Безопасность». */
export async function unlinkTelegram(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Если Telegram — единственный способ войти, отвязка заперла бы
  // человека снаружи: сначала пусть заведёт пароль или подключит Google.
  if (!user.passwordHash && !user.googleId) {
    redirect("/account/settings?telegram=only-login");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramId: null, telegramUsername: null },
  });
  revalidatePath("/account/settings");
}

/** Что дублировать в Telegram. Уведомления на сайте приходят всегда —
 *  настройка управляет только тем, что уходит в бота. */
export async function updateNotificationPrefs(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      tgNotifyInvites: String(formData.get("tgNotifyInvites") ?? "") === "on",
      tgNotifyFriends: String(formData.get("tgNotifyFriends") ?? "") === "on",
      tgNotifyReplies: String(formData.get("tgNotifyReplies") ?? "") === "on",
      tgNotifyEvents: String(formData.get("tgNotifyEvents") ?? "") === "on",
      tgNotifyBroadcast: String(formData.get("tgNotifyBroadcast") ?? "") === "on",
    },
  });
  revalidatePath("/account/settings");
}

/** Самоудаление аккаунта (Э1.7): то же мягкое удаление, что и у
 *  админа — почта/привязки освобождаются, контент обезличивается.
 *  После — чистим куку и уводим на главную. */
export async function deleteOwnAccount(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await softDeleteUser(user.id, "самоудаление из настроек");
  await destroyUserSession();
  redirect("/");
}

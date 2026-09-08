"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isKnownTimezone } from "@/lib/timezones";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import {
  destroyUserSession,
  getCurrentUser,
  hashPassword,
  USER_COOKIE,
  verifyPassword,
} from "@/lib/userAuth";
import { softDeleteUser } from "@/lib/userDeletion";
import { isValidUsername, RESERVED_USERNAMES } from "@/lib/userProfile";
import { isKnownCountry } from "@/lib/countries";
import { parseUploadUrl } from "@/lib/uploadUrl";
import { isPremiumActive } from "@/lib/premium";
import { getT, localeHref } from "@/lib/i18n";

export async function updateProfile(
  formData: FormData,
): Promise<{ ok: false; error: string } | void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  // Фото профиля — только свой /uploads/…: адрес уходит в голый <img>
  // на публичном профиле, чужой домен — утечка реферера и подменяемая
  // картинка (см. src/lib/uploadUrl.ts). Пусто — «фото убрали», это
  // законно; подделанный адрес — ошибка, а не молчаливое сохранение.
  const photo = parseUploadUrl(formData.get("photoUrl"));
  if (!photo.ok) {
    return { ok: false, error: (await getT()).t.account.settings.badPhotoUrl };
  }
  // Обложка профиля — косметика подписчика (аудит 2026-09, раздел 8).
  // Поле есть в форме только у подписчика, поэтому трогаем колонку
  // ТОЛЬКО когда оно пришло: иначе первое же сохранение профиля после
  // окончания подписки стирало бы обложку, которую мы обещали оставить
  // видимой всем. Проверка подписки на сервере отдельно — форму можно и
  // подделать.
  const coverSent = formData.has("coverUrl") && isPremiumActive(user);
  const cover = coverSent ? parseUploadUrl(formData.get("coverUrl")) : null;
  if (cover && !cover.ok) {
    return { ok: false, error: (await getT()).t.settings.coverBadUrl };
  }
  const timezone = String(formData.get("timezone") ?? "");
  const locale = String(formData.get("locale") ?? "");
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
      photoUrl: photo.url,
      ...(cover?.ok ? { coverUrl: cover.url } : {}),
      // Неизвестное значение молча не пишем — остаётся прежняя зона.
      ...(isKnownTimezone(timezone) ? { timezone } : {}),
      ...(isLocale(locale) ? { locale } : {}),
      ...(nextUsername ? { username: nextUsername } : {}),
      country: country && isKnownCountry(country) ? country : null,
      gender: gender || null,
      bio: bio || null,
      birthDate: by && bm && bd ? new Date(Date.UTC(by, bm - 1, bd)) : null,
    },
  });

  revalidatePath("/account");
  revalidatePath("/account/settings");

  // Язык из профиля дублируем в куку: интерфейс читает её, а не базу
  // (proxy бежит на каждый запрос и в базу не ходит). Без этого выбор в
  // настройках поменял бы язык уведомлений, но не самой страницы.
  //
  // И уводим на тот же адрес в новом языке: заголовок с языком для этого
  // запроса proxy посчитал ДО того, как появилась кука, поэтому без
  // перехода страница осталась бы на прежнем языке — и выглядело бы это
  // так, будто сохранение не сработало.
  if (isLocale(locale) && locale !== user.locale) {
    const store = await cookies();
    store.set(LOCALE_COOKIE, locale, {
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
    });
    redirect(localeHref("/account/settings", locale));
  }
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

/** Ошибки валидации возвращаются значением, а не броском: в проде Next
 *  минифицирует текст исключения из server action, и клиент видит
 *  generic error boundary вместо причины (см. promoActions.ts). */
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Текст ошибки уходит на клиент как значение, поэтому язык берём из
  // того же заголовка, что и страницы: экшен летит на текущий адрес.
  const { t } = await getT();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!user.passwordHash) {
    return { ok: false, error: t.account.settings.passwordNoAccount };
  }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, error: t.account.settings.passwordWrongCurrent };
  }
  if (newPassword.length < 6) {
    return { ok: false, error: t.account.settings.passwordTooShort };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: t.account.settings.passwordMismatch };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword) },
  });
  // Пароль меняют в том числе потому, что он мог утечь: остальные
  // сессии (возможно, чужие руки) закрываем, текущую — оставляем, чтобы
  // человек не вылетел из аккаунта сразу после смены.
  const currentSessionId = (await cookies()).get(USER_COOKIE)?.value;
  await prisma.userSession.deleteMany({
    where: {
      userId: user.id,
      ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
    },
  });
  return { ok: true };
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
    const { locale } = await getT();
    redirect(localeHref("/account/settings?telegram=only-login", locale));
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
      tgNotifyBirthdays: String(formData.get("tgNotifyBirthdays") ?? "") === "on",
      tgNotifyEpisodes: String(formData.get("tgNotifyEpisodes") ?? "") === "on",
      tgNotifyCommunities: String(formData.get("tgNotifyCommunities") ?? "") === "on",
      tgNotifyBroadcast: String(formData.get("tgNotifyBroadcast") ?? "") === "on",
      // Недельный дайджест: сама рассылка идёт только подписчикам, но
      // тумблер пишем всем — бесплатный аккаунт может настроить его
      // заранее, а после оплаты подписки настройка уже на месте.
      tgNotifyDigest: String(formData.get("tgNotifyDigest") ?? "") === "on",
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

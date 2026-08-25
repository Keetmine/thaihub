"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extendPremium } from "@/lib/premium";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/auth";
import { getCurrentUser } from "@/lib/userAuth";
import { notifyUser } from "@/lib/notifications";
import { getDict, DEFAULT_LOCALE } from "@/lib/i18n";
import { formatHumanDate } from "@/lib/dates";
import { softDeleteUser } from "@/lib/userDeletion";

/** Продлить подписку на месяц (от конца текущей, если ещё активна). */
export async function grantPremiumMonth(userId: string) {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const until = extendPremium(user.premiumUntil);
  await prisma.user.update({
    where: { id: userId },
    data: { premiumUntil: until },
  });
  // Человек должен узнать, что подписка появилась, — иначе он видит
  // только исчезнувший пейволл и гадает, что произошло.
  await notifyUser({
    userId,
    kind: "PREMIUM_GRANTED",
    // Подпись собирается при чтении, на языке получателя; сюда идёт
    // только дата — язык человека мы в этот момент не знаем.
    body: getDict(DEFAULT_LOCALE).notifications.premiumBody(formatHumanDate(until, "en")),
    href: "/",
  });
  revalidatePath("/admin/users");
}

/** Досрочно отключить подписку. */
export async function revokePremium(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil: null } });
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  // Мягкое удаление: запись остаётся (иначе каскадом ушли бы
  // комментарии, отзывы и участие в совместных поездках), но аккаунт
  // нигде не показывается, войти нельзя, а почта и Telegram
  // освобождаются — см. lib/userDeletion.ts.
  await softDeleteUser(userId, "удалён администратором");
  revalidatePath("/admin/users");
}

/** Одноразовый инвайт-код для регистрации (Б5 в roadmap). Формат короткий
 *  и читаемый — им делятся в переписке. */


/** Промокод на месяц подписки (подарочный). */
export async function createPromoCode(): Promise<void> {
  await requireAdmin();
  const code = `GIFT-${randomBytes(4).toString("hex").toUpperCase()}`;
  await prisma.promoCode.create({ data: { code, months: 1 } });
  revalidatePath("/admin/users");
}

export async function deletePromoCode(code: string): Promise<void> {
  await requireAdmin();
  await prisma.promoCode.deleteMany({ where: { code, usedAt: null } });
  revalidatePath("/admin/users");
}

/** Назначить/снять роль админа. Себя разжаловать нельзя — иначе можно
 *  остаться вовсе без админов. */
export async function setAdminRole(userId: string, isAdmin: boolean): Promise<void> {
  await requireAdmin();
  if (!isAdmin) {
    const me = await getCurrentUser();
    if (me?.id === userId) {
      throw new Error("Нельзя снять роль админа с самого себя");
    }
  }
  await prisma.user.update({ where: { id: userId }, data: { isAdmin } });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Роль менеджера каталога: правит каталог, но не видит пользователей,
 *  финансы, рассылки и настройки (см. isCatalogEditor). */
export async function setManagerRole(userId: string, isManager: boolean): Promise<void> {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { isManager } });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

// --- Модерация пользовательского контента (см. /admin/users/[id]) ---

export async function adminDeleteEventNote(noteId: string): Promise<void> {
  await requireAdmin();
  await prisma.eventNote.delete({ where: { id: noteId } });
  revalidatePath("/admin/users");
}

export async function adminDeletePlaceList(listId: string): Promise<void> {
  await requireAdmin();
  await prisma.placeList.delete({ where: { id: listId } });
  revalidatePath("/admin/users");
}

export async function adminDeleteOwnPlace(locationId: string): Promise<void> {
  await requireAdmin();
  // только пользовательские «свои места», каталог не трогаем
  await prisma.location.deleteMany({ where: { id: locationId, createdByUserId: { not: null } } });
  revalidatePath("/admin/users");
}

export async function adminDeleteTrip(tripId: string): Promise<void> {
  await requireAdmin();
  await prisma.trip.delete({ where: { id: tripId } });
  revalidatePath("/admin/users");
}

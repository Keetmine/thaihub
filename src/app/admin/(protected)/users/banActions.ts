"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getCurrentUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

/**
 * Блокировка пользователя (просьба владельца: «нужно иметь возможность
 * банить»). Отдельный файл от actions.ts: там премиум, роли и точечное
 * удаление контента — блокировка живёт своей жизнью и правится отдельно.
 *
 * Ошибки возвращаем ЗНАЧЕНИЕМ, а не исключением: текст брошенного в
 * server action исключения Next в проде до клиента не доводит, и админ
 * увидел бы безликое «что-то пошло не так» вместо «админа блокировать
 * нельзя».
 */
export type BanResult = { ok: true } | { ok: false; error: string };

/** Причина — служебная заметка для админки, человеку её не показываем. */
const REASON_MAX = 500;

function label(user: {
  name: string | null;
  email: string | null;
  telegramUsername: string | null;
  id: string;
}): string {
  return user.name ?? user.email ?? user.telegramUsername ?? user.id;
}

export async function banUser(userId: string, reason: string): Promise<BanResult> {
  await requireAdmin();
  const me = await getCurrentUser();
  // Себя — нельзя: заблокировавший себя админ потерял бы и админку, и
  // возможность разблокироваться (getCurrentUser отдаёт забаненного как
  // гостя, а гость до /admin не доходит).
  if (me?.id === userId) return { ok: false, error: "Себя заблокировать нельзя" };

  const text = reason.trim().slice(0, REASON_MAX);
  if (!text) return { ok: false, error: "Напишите причину — её видно только в админке" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      telegramUsername: true,
      isAdmin: true,
      deletedAt: true,
      bannedAt: true,
    },
  });
  if (!user) return { ok: false, error: "Пользователь не найден" };
  // Админа сайта — нельзя: блокировка отрезала бы его от админки, и
  // снять её было бы некому, кроме как руками в базе.
  if (user.isAdmin) return { ok: false, error: "Админа заблокировать нельзя" };
  if (user.deletedAt) return { ok: false, error: "Аккаунт удалён — блокировать нечего" };
  if (user.bannedAt) return { ok: true };

  await prisma.user.update({
    where: { id: userId },
    // Сессии НЕ гасим намеренно (в отличие от softDeleteUser): живая
    // строка сессии нужна, чтобы человек на следующем клике попал на
    // экран «вы заблокированы», а не на форму входа. Доступ закрывает
    // getCurrentUser — он ходит в базу на каждый запрос.
    data: { bannedAt: new Date(), banReason: text, bannedById: me?.id ?? null },
  });

  await logAudit({
    action: "UPDATE",
    entityType: "User",
    entityId: userId,
    entityLabel: label(user),
    note: `заблокирован: ${text}`,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function unbanUser(userId: string): Promise<BanResult> {
  await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, telegramUsername: true, bannedAt: true },
  });
  if (!user) return { ok: false, error: "Пользователь не найден" };
  if (!user.bannedAt) return { ok: true };

  // Причину и автора блокировки стираем вместе с ней: они описывают
  // конкретную блокировку, и оставленный «хвост» на карточке читался бы
  // как «этот всё ещё под баном». История остаётся в журнале правок.
  await prisma.user.update({
    where: { id: userId },
    data: { bannedAt: null, banReason: null, bannedById: null },
  });

  await logAudit({
    action: "UPDATE",
    entityType: "User",
    entityId: userId,
    entityLabel: label(user),
    note: "блокировка снята",
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

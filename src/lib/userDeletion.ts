import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * Мягкое удаление аккаунта: запись остаётся (иначе каскадом ушли бы
 * комментарии, отзывы и участие в совместных поездках), но аккаунт
 * нигде не показывается и войти в него нельзя.
 *
 * Уникальные поля освобождаются: иначе почта и Telegram остались
 * бы занятыми навсегда, и человек не смог бы зарегистрироваться заново.
 * Заодно это обезличивание — держать личные данные удалённого аккаунта
 * без нужды неправильно; сам факт удаления остаётся в журнале правок.
 */
export async function softDeleteUser(
  userId: string,
  reason: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, telegramUsername: true },
  });
  if (!user) return;

  await prisma.$transaction([
    // Сессии рвём сразу, чтобы удалённый аккаунт не дожил до истечения
    // куки.
    prisma.userSession.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: null,
        telegramId: null,
        telegramUsername: null,
        googleId: null,
        passwordHash: null,
        name: "Удалённый аккаунт",
        photoUrl: null,
      },
    }),
  ]);

  await logAudit({
    action: "DELETE",
    entityType: "User",
    entityId: userId,
    entityLabel: user.name ?? user.email ?? user.telegramUsername ?? userId,
    note: reason,
  });
}

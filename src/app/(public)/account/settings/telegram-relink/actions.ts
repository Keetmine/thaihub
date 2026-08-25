"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";
import { softDeleteUser } from "@/lib/userDeletion";
import { getT } from "@/lib/i18n";

/**
 * Перенос Telegram на текущий аккаунт: старый удаляется (мягко), новый
 * получает привязку.
 *
 * Подписанные данные приходят аргументом, а не куку. Куки тут не нужны:
 * подпись всё равно проверяется заново, а из-за неё попап дёргал сервер
 * при открытии и ждал удаления куки при закрытии — отсюда «Закрываем…»
 * и задержка на кнопке отмены.
 */
export async function confirmTelegramRelink(
  authQuery: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Ошибки уходят на клиент значением, поэтому берём язык страницы.
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: t.account.settings.telegramSessionExpired };

  const payload = verifyTelegramAuth(new URLSearchParams(authQuery));
  // Подпись живёт сутки: если попап провисел дольше, привязку нужно
  // начинать заново.
  if (!payload) {
    return { ok: false, error: t.account.settings.relinkExpired };
  }

  const other = await prisma.user.findUnique({ where: { telegramId: payload.id } });
  if (other && other.id !== user.id) {
    await softDeleteUser(other.id, `Telegram перенесён на аккаунт ${user.id}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId: payload.id,
      telegramUsername: payload.username,
      ...(user.photoUrl ? {} : { photoUrl: payload.photoUrl }),
    },
  });

  return { ok: true };
}

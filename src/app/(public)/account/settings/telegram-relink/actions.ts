"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { verifyTelegramAuth } from "@/lib/telegram";
import { TELEGRAM_RELINK_COOKIE } from "@/lib/telegramRelink";
import { softDeleteUser } from "@/lib/userDeletion";

/**
 * Перенос Telegram на текущий аккаунт: старый удаляется (мягко), новый
 * получает привязку. Подпись проверяется здесь заново — кука сама по
 * себе ничего не разрешает.
 */
export async function confirmTelegramRelink(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const store = await cookies();
  const raw = store.get(TELEGRAM_RELINK_COOKIE)?.value;
  if (!raw) redirect("/account/settings");

  const payload = verifyTelegramAuth(new URLSearchParams(raw));
  if (!payload) {
    store.delete(TELEGRAM_RELINK_COOKIE);
    redirect("/account/settings?telegram=failed");
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

  store.delete(TELEGRAM_RELINK_COOKIE);
  redirect("/account/settings?telegram=linked");
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/telegram";

export type BroadcastResult = { sent: number; total: number };

/**
 * Telegram-рассылка по пользователям с привязанным ботом. Аудитория:
 * все или только с активной подпиской. Шлём последовательно с паузой —
 * лимит Bot API ~30 сообщений/сек, а у нас счёт на десятки.
 */
export async function sendBroadcast(formData: FormData): Promise<BroadcastResult> {
  await requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all") === "premium" ? "premium" : "all";
  if (!text) throw new Error("Введите текст рассылки");

  const users = await prisma.user.findMany({
    where: {
      telegramId: { not: null },
      ...(audience === "premium" ? { premiumUntil: { gt: new Date() } } : {}),
    },
    select: { telegramId: true },
  });

  let sent = 0;
  for (const u of users) {
    try {
      await sendTelegramMessage(u.telegramId!, text);
      sent += 1;
    } catch {
      // юзер заблокировал бота и т.п. — пропускаем
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  await prisma.broadcast.create({ data: { text, audience, sentCount: sent } });
  revalidatePath("/admin/broadcast");
  return { sent, total: users.length };
}

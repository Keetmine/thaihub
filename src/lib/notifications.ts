import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import type { NotificationKind } from "@/generated/prisma/client";

// Уведомления пользователю: строка в колокольчике на сайте и, если у
// человека привязан Telegram, сообщение туда же. До этого приглашения в
// поездку, заявки в друзья и ответы на комментарии проходили молча —
// узнать о них можно было, только зайдя в нужный раздел.
// См. docs/features/notifications.md.

const APP_URL = process.env.APP_URL ?? "https://myblhub.com";

/** Какие поводы дублируются в Telegram. Остальное живёт только на
 *  сайте, чтобы не превращать бота в спамера. */
const TELEGRAM_KINDS: NotificationKind[] = [
  "TRIP_INVITE",
  "FRIEND_REQUEST",
  "COMMENT_REPLY",
  "PREMIUM_GRANTED",
];

export async function notifyUser(input: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    // Себе не уведомляем: собственное действие человек только что
    // совершил и так.
    if (input.actorId && input.actorId === input.userId) return;

    await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        actorId: input.actorId ?? null,
      },
    });

    if (!TELEGRAM_KINDS.includes(input.kind)) return;
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { telegramId: true },
    });
    if (!user?.telegramId) return;

    const link = input.href ? `\n${APP_URL}${input.href}` : "";
    await sendTelegramMessage(
      user.telegramId,
      `<b>${escapeHtml(input.title)}</b>${input.body ? `\n${escapeHtml(input.body)}` : ""}${link}`,
    ).catch(() => false);
  } catch (error) {
    // Уведомление не должно ронять действие, которое его вызвало:
    // приглашение в поездку важнее строки в колокольчике.
    console.error("notifyUser failed", error);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Сколько непрочитанного — для счётчика на колокольчике. */
export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

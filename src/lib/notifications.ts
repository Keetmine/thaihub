import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import type { NotificationKind } from "@/generated/prisma/client";
import { notificationTitle } from "@/lib/notificationText";
import { getDict, DEFAULT_LOCALE } from "@/lib/i18n";

// Уведомления пользователю: строка в колокольчике на сайте и, если у
// человека привязан Telegram, сообщение туда же. До этого приглашения в
// поездку, заявки в друзья и ответы на комментарии проходили молча —
// узнать о них можно было, только зайдя в нужный раздел.
// См. docs/features/notifications.md.

const APP_URL = process.env.APP_URL ?? "https://myblhub.com";

/** Какие поводы вообще могут уходить в Telegram и каким переключателем
 *  в настройках управляются. Лайки и «заявку приняли» не шлём никогда:
 *  они частые, бот превратился бы в спамера. */
const TELEGRAM_KINDS: Partial<Record<NotificationKind, keyof TelegramPrefs>> = {
  TRIP_INVITE: "tgNotifyInvites",
  FRIEND_REQUEST: "tgNotifyFriends",
  COMMENT_REPLY: "tgNotifyReplies",
  FRIEND_GOING: "tgNotifyEvents",
  PREMIUM_GRANTED: "tgNotifyInvites",
};

type TelegramPrefs = {
  tgNotifyInvites: boolean;
  tgNotifyFriends: boolean;
  tgNotifyReplies: boolean;
  tgNotifyEvents: boolean;
};

/**
 * Создать уведомление.
 *
 * Фразу сюда НЕ передают: язык получателя в момент события неизвестен,
 * поэтому вызывающий отдаёт только переменные части (имя того, кто
 * вызвал событие, и название поездки/события/ачивки), а фраза
 * складывается при чтении — см. lib/notificationText.ts.
 *
 * В `title` при этом кладётся английский вариант: он уходит в Telegram
 * (там языка получателя мы тоже не знаем) и служит запасным вариантом
 * для строк, созданных до этого разделения.
 */
export async function notifyUser(input: {
  userId: string;
  kind: NotificationKind;
  actorName?: string | null;
  subject?: string | null;
  body?: string | null;
  href?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    // Себе не уведомляем: собственное действие человек только что
    // совершил и так.
    if (input.actorId && input.actorId === input.userId) return;

    // Повод без действующего лица (ачивка, выданная подписка) хранит
    // NULL, повод с ним — имя или пустую строку, если имени у человека
    // нет. Различие читает actorLabel в lib/notificationText.ts.
    const actorName = "actorName" in input ? (input.actorName ?? "") : null;
    const subject = input.subject ?? null;
    const title = notificationTitle(
      { kind: input.kind, actorName, subject, title: "" },
      getDict(DEFAULT_LOCALE),
    );

    await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        actorName,
        subject,
        title,
        body: input.body ?? null,
        href: input.href ?? null,
        actorId: input.actorId ?? null,
      },
    });

    const prefKey = TELEGRAM_KINDS[input.kind];
    if (!prefKey) return;
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        telegramId: true,
        tgNotifyInvites: true,
        tgNotifyFriends: true,
        tgNotifyReplies: true,
        tgNotifyEvents: true,
      },
    });
    // Нет привязанного Telegram или повод выключен в настройках —
    // уведомление остаётся только на сайте.
    if (!user?.telegramId || !user[prefKey]) return;

    const link = input.href ? `\n${APP_URL}${input.href}` : "";
    await sendTelegramMessage(
      user.telegramId,
      `<b>${escapeHtml(title)}</b>${input.body ? `\n${escapeHtml(input.body)}` : ""}${link}`,
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

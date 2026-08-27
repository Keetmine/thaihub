import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import type { NotificationKind } from "@/generated/prisma/client";
import { notificationTitle } from "@/lib/notificationText";
import { getDict, isLocale, localeHref, DEFAULT_LOCALE, type Dict, type Locale } from "@/lib/i18n";

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
  PERFORMER_BIRTHDAY: "tgNotifyBirthdays",
};

type TelegramPrefs = {
  tgNotifyInvites: boolean;
  tgNotifyFriends: boolean;
  tgNotifyReplies: boolean;
  tgNotifyEvents: boolean;
  tgNotifyBirthdays: boolean;
};

/**
 * Создать уведомление.
 *
 * Фразу сюда НЕ передают: вызывающий отдаёт только переменные части
 * (имя того, кто вызвал событие, и название поездки/события/ачивки), а
 * фраза складывается при чтении, на языке того, кто её читает, — см.
 * lib/notificationText.ts.
 *
 * Язык получателя берётся из его профиля (`User.locale`). Он нужен для
 * двух вещей: сообщения в Telegram — оно отправляется прямо сейчас и
 * переписать его потом нельзя, — и записанного `title`, который служит
 * запасным вариантом.
 *
 * `body` бывает и данными (отрывок комментария, подсказка ачивки), и
 * фразой с датой, а дата зависит от языка. Поэтому его можно передать
 * функцией: её позовут, когда язык получателя уже известен. В отличие
 * от заголовка, body записывается один раз и при смене языка не
 * переедет — для даты или цитаты это не беда.
 */
export async function notifyUser(input: {
  userId: string;
  kind: NotificationKind;
  actorName?: string | null;
  subject?: string | null;
  body?: string | ((t: Dict, locale: Locale) => string) | null;
  href?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    // Себе не уведомляем: собственное действие человек только что
    // совершил и так.
    if (input.actorId && input.actorId === input.userId) return;

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        locale: true,
        telegramId: true,
        tgNotifyInvites: true,
        tgNotifyFriends: true,
        tgNotifyReplies: true,
        tgNotifyEvents: true,
        tgNotifyBirthdays: true,
      },
    });
    if (!user) return;

    // Язык не выбирали — остаётся язык сайта по умолчанию: угадывать по
    // чему-то ещё тут нечему, браузера рядом нет.
    const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
    const t = getDict(locale);

    // Повод без действующего лица (ачивка, выданная подписка) хранит
    // NULL, повод с ним — имя или пустую строку, если имени у человека
    // нет. Различие читает actorLabel в lib/notificationText.ts.
    const actorName = "actorName" in input ? (input.actorName ?? "") : null;
    const subject = input.subject ?? null;
    const title = notificationTitle({ kind: input.kind, actorName, subject, title: "" }, t);
    const body = typeof input.body === "function" ? input.body(t, locale) : (input.body ?? null);

    await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        actorName,
        subject,
        title,
        body,
        href: input.href ?? null,
        actorId: input.actorId ?? null,
      },
    });

    const prefKey = TELEGRAM_KINDS[input.kind];
    if (!prefKey) return;
    // Нет привязанного Telegram или повод выключен в настройках —
    // уведомление остаётся только на сайте.
    if (!user.telegramId || !user[prefKey]) return;

    // Ссылка — на версию сайта на языке получателя: иначе человек,
    // читающий сайт по-русски, приходил бы из Telegram на английскую
    // страницу.
    const link = input.href ? `\n${APP_URL}${localeHref(input.href, locale)}` : "";
    await sendTelegramMessage(
      user.telegramId,
      `<b>${escapeHtml(title)}</b>${body ? `\n${escapeHtml(body)}` : ""}${link}`,
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

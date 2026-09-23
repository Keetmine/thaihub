import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import type { NotificationKind } from "@/generated/prisma/client";
import { notificationTitle } from "@/lib/notificationText";
import { getDict, isLocale, localeHref, DEFAULT_LOCALE, type Dict, type Locale } from "@/lib/i18n";
import { templateOverridesFor } from "@/lib/notificationTemplateStore";
import type { TemplateOverrides } from "@/lib/notificationTemplates";

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
  FRIEND_ATTENDED: "tgNotifyEvents",
  PREMIUM_GRANTED: "tgNotifyInvites",
  PERFORMER_BIRTHDAY: "tgNotifyBirthdays",
  EPISODE_AIRED: "tgNotifyEpisodes",
  // «Просимый сериал теперь в каталоге» — той же ручкой, что серии:
  // отдельный тумблер ради редкого повода только загромоздил бы
  // настройки, а тематически это тот же «мой список сериалов».
  DRAMA_ADDED: "tgNotifyEpisodes",
  // «Через час откроется онлайн-бронирование» по своему билету — той же
  // ручкой, что остальные поводы про события; подпись переключателя в
  // настройках упоминает и его.
  ONLINE_BOOKING: "tgNotifyEvents",
  // «У избранного артиста новое событие» — тоже ручка событий: повод про
  // афишу, а не про артистов (дни рождения — отдельный тумблер).
  PERFORMER_EVENT: "tgNotifyEvents",
  // «Стартовал сериал из ваших планов» — той же ручкой, что серии: это
  // тот же «мой список сериалов», отдельный тумблер его бы раздробил.
  DRAMA_STARTED: "tgNotifyEpisodes",
  // Сообщества — одной ручкой на три повода: позвали, попросились,
  // ответили по заявке. Все три редки и адресованы лично, поэтому
  // дробить их на отдельные тумблеры незачем.
  //
  // COMMUNITY_POST (новая тема в обсуждениях) сюда НЕ входит намеренно
  // (решение владельца): тем в живом сообществе много, и бот на каждой
  // из них превратился бы в спамера. Темы остаются в колокольчике.
  COMMUNITY_INVITE: "tgNotifyCommunities",
  COMMUNITY_JOIN_REQUEST: "tgNotifyCommunities",
  COMMUNITY_JOIN_ANSWER: "tgNotifyCommunities",
  // Обратный отсчёт до поездки — своя ручка: месяц ежедневных сообщений
  // человек должен уметь выключить, не теряя приглашений в поездки.
  TRIP_COUNTDOWN: "tgNotifyTrips",
};

type TelegramPrefs = {
  tgNotifyInvites: boolean;
  tgNotifyFriends: boolean;
  tgNotifyReplies: boolean;
  tgNotifyEvents: boolean;
  tgNotifyBirthdays: boolean;
  tgNotifyEpisodes: boolean;
  /** Сообщества. Поле необязательное: массовые рассылки (серии, дни
   *  рождения, напоминания о событиях) собирают получателей одним
   *  findMany и выбирают из User только свои тумблеры — требовать от них
   *  ещё и этот значило бы тащить лишнюю колонку ради повода, который
   *  они не шлют. Поводы сообществ идут поштучно, и там notifyUser
   *  перечитывает пользователя сам, вместе с этим полем. */
  tgNotifyCommunities?: boolean;
  /** Обратный отсчёт до поездки. Необязательное по той же причине:
   *  тумблер нужен одной рассылке, и только она его выбирает. */
  tgNotifyTrips?: boolean;
};

/** Всё, что notifyUser нужно знать о получателе. Отдельным типом, чтобы
 *  массовые рассылки могли выбрать эти поля одним findMany и передать
 *  готового юзера — вместо findUnique на каждого получателя. */
export type NotifyUserRecipient = TelegramPrefs & {
  locale: string | null;
  telegramId: string | null;
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
  /** Как и `body`, можно передать функцией: её позовут, когда язык
   *  получателя уже известен. Нужно там, где действующих лиц несколько
   *  и их надо перечислить связкой «и» / «and» (см. namesList). */
  actorName?: string | ((t: Dict, locale: Locale) => string) | null;
  subject?: string | null;
  /** Третьим аргументом приезжают правки текстов из админки: их
   *  читает notifyUser (он же знает язык получателя), а собирает фразу
   *  вызывающий — через renderTemplate. */
  body?: string | ((t: Dict, locale: Locale, overrides: TemplateOverrides) => string) | null;
  href?: string | null;
  actorId?: string | null;
  /** Уже прочитанный получатель — для массовых рассылок, где данные всех
   *  получателей забраны одним findMany; без него юзер перечитывается из
   *  БД (N+1 на каждом уведомлении). */
  user?: NotifyUserRecipient;
}): Promise<void> {
  try {
    // Себе не уведомляем: собственное действие человек только что
    // совершил и так.
    if (input.actorId && input.actorId === input.userId) return;

    const user =
      input.user ??
      (await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          locale: true,
          telegramId: true,
          tgNotifyInvites: true,
          tgNotifyFriends: true,
          tgNotifyReplies: true,
          tgNotifyEvents: true,
          tgNotifyBirthdays: true,
          tgNotifyEpisodes: true,
          tgNotifyCommunities: true,
          tgNotifyTrips: true,
        },
      }));
    if (!user) return;

    // Язык не выбирали — остаётся язык сайта по умолчанию: угадывать по
    // чему-то ещё тут нечему, браузера рядом нет.
    const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
    const t = getDict(locale);

    // Повод без действующего лица (ачивка, выданная подписка) хранит
    // NULL, повод с ним — имя или пустую строку, если имени у человека
    // нет. Различие читает actorLabel в lib/notificationText.ts.
    const actorName =
      "actorName" in input
        ? typeof input.actorName === "function"
          ? input.actorName(t, locale)
          : (input.actorName ?? "")
        : null;
    const subject = input.subject ?? null;
    // Тексты правятся из админки — накладкой поверх словаря
    // (см. lib/notificationTemplates.ts). Заголовок собирается ЗДЕСЬ и
    // навсегда: в Telegram его потом не переписать, а в колокольчике он
    // пересобирается при каждом чтении, уже с текущими правками.
    const overrides = await templateOverridesFor(locale);
    const title = notificationTitle({ kind: input.kind, actorName, subject, title: "" }, t, overrides);
    const body =
      typeof input.body === "function" ? input.body(t, locale, overrides) : (input.body ?? null);

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

import type { Dict } from "@/lib/i18n";
import type { NotificationKind } from "@/generated/prisma/client";

/** То, из чего складывается фраза. Ровно поля модели `Notification`. */
export type NotificationParts = {
  kind: NotificationKind;
  actorName: string | null;
  subject: string | null;
  /** Готовая фраза из базы — запасной вариант, см. ниже. */
  title: string;
};

/**
 * Заголовок уведомления на языке того, кто его читает.
 *
 * Собирается из повода и замороженных частей, а не берётся из базы:
 * язык получателя в момент события неизвестен, и записанная тогда фраза
 * оказалась бы чужой половине читателей.
 *
 * Запасной вариант — записанный `title`. Он нужен для строк, созданных
 * до появления `actorName`/`subject`: у них частей нет, и собрать фразу
 * не из чего. Такие строки остаются на языке, на котором были записаны;
 * со временем они вытесняются новыми.
 */
export function notificationTitle(n: NotificationParts, t: Dict): string {
  const titles = t.notifications.title;
  const who = actorLabel(n, t);
  const subject = n.subject;

  switch (n.kind) {
    case "FRIEND_REQUEST":
    case "FRIEND_ACCEPTED":
    case "COMMENT_REPLY":
    case "COMMENT_LIKE":
      return who ? titles[n.kind](who) : n.title;
    case "TRIP_INVITE_ACCEPTED":
      return who ? titles.TRIP_INVITE_ACCEPTED(who) : n.title;
    case "TRIP_INVITE":
      return who && subject ? titles.TRIP_INVITE(who, subject) : n.title;
    case "FRIEND_GOING":
      return who && subject ? titles.FRIEND_GOING(who, subject) : n.title;
    case "ACHIEVEMENT":
      return subject ? titles.ACHIEVEMENT(subject) : n.title;
    case "PREMIUM_GRANTED":
      return titles.PREMIUM_GRANTED;
    case "PERFORMER_BIRTHDAY":
      return subject ? titles.PERFORMER_BIRTHDAY(subject) : n.title;
    case "EPISODE_AIRED":
      return subject ? titles.EPISODE_AIRED(subject) : n.title;
    default:
      return n.title;
  }
}

/**
 * Имя для фразы — или null, если фразу собрать не из чего.
 *
 * Пустая строка и NULL тут значат разное, и различие нужно: NULL — это
 * строка старого образца, у неё частей нет вовсе; пустая строка — новая
 * строка, где у человека просто не было имени. В первом случае надо
 * показать записанный `title`, во втором — обычную фразу с «кто-то».
 */
function actorLabel(n: NotificationParts, t: Dict): string | null {
  if (n.actorName === null) return null;
  return n.actorName || t.notifications.someone;
}

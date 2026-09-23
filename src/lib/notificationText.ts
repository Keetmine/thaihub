import type { Dict } from "@/lib/i18n";
import type { NotificationKind } from "@/generated/prisma/client";
import { renderTemplate, type TemplateOverrides } from "@/lib/notificationTemplates";

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
export function notificationTitle(
  n: NotificationParts,
  t: Dict,
  /** Правки текстов из админки (/admin/notifications). Не переданы —
   *  рисуем словарём: рассылке важнее уйти, чем дождаться таблицы. */
  overrides?: TemplateOverrides,
): string {
  const who = actorLabel(n, t);
  const subject = n.subject;
  /** Фраза по ключу реестра — или записанный `title`, если частей, из
   *  которых её собирают, у строки нет (см. комментарий выше). */
  const render = (vars: Record<string, string>): string =>
    renderTemplate(`title.${n.kind}`, vars, t, overrides);

  switch (n.kind) {
    case "FRIEND_REQUEST":
    case "FRIEND_ACCEPTED":
    case "COMMENT_REPLY":
    case "COMMENT_LIKE":
    case "TRIP_INVITE_ACCEPTED":
      return who ? render({ who }) : n.title;
    case "TRIP_REMOVED":
      return subject ? render({ trip: subject }) : n.title;
    case "TRIP_INVITE":
      return who && subject ? render({ who, trip: subject }) : n.title;
    case "TRIP_COUNTDOWN":
      // Число дней — в body (подпись дня), заголовок только называет
      // поездку: иначе пришлось бы морозить число в subject.
      return subject ? render({ trip: subject }) : n.title;
    case "FRIEND_GOING":
    case "FRIEND_ATTENDED":
      return who && subject ? render({ who, event: subject }) : n.title;
    case "ACHIEVEMENT":
      return subject ? render({ name: subject }) : n.title;
    case "PREMIUM_GRANTED":
      // subject "lifetime" — бессрочная выдача из админки: свой,
      // праздничный заголовок вместо сухого «Подписка активна».
      return renderTemplate(
        subject === "lifetime" ? "title.PREMIUM_LIFETIME" : "title.PREMIUM_GRANTED",
        {},
        t,
        overrides,
      );
    case "PERFORMER_BIRTHDAY":
      return subject ? render({ name: subject }) : n.title;
    case "EPISODE_AIRED":
    case "DRAMA_ADDED":
    case "DRAMA_STARTED":
      return subject ? render({ drama: subject }) : n.title;
    case "ONLINE_BOOKING":
      return subject ? render({ event: subject }) : n.title;
    case "PERFORMER_EVENT":
      // «Кто» — артист из избранного получателя: его имя заморожено в
      // actorName точно так же, как имена людей в соседних поводах.
      return who && subject ? render({ who, event: subject }) : n.title;
    case "COMMUNITY_DIGEST":
      // Месячная сводка владельцу: подробности (сколько участников, тем,
      // комментариев) лежат в body — там же, где у остальных поводов.
      return subject ? render({ community: subject }) : n.title;
    case "COMMUNITY_JOIN_REQUEST":
    case "COMMUNITY_INVITE":
    case "COMMUNITY_POST":
      return who && subject ? render({ who, community: subject }) : n.title;
    case "COMMUNITY_JOIN_ANSWER": {
      // Решение по заявке приезжает одним видом: «+название» — приняли,
      // «-название» — отказали. Отдельный вид уведомления ради одной
      // строки не заводим, а фразу собираем на языке получателя.
      if (!subject) return n.title;
      return renderTemplate(
        subject.startsWith("+") ? "title.COMMUNITY_JOIN_ACCEPTED" : "title.COMMUNITY_JOIN_DECLINED",
        { community: subject.slice(1) },
        t,
        overrides,
      );
    }
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

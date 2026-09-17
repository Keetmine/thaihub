/** Эмодзи-иконка по виду уведомления — одна таблица на страницу
 *  `/notifications` и выпадающий блок у колокольчика (2026-09-17). */
export const NOTIFICATION_ICONS: Record<string, string> = {
  TRIP_INVITE: "✈️",
  TRIP_INVITE_ACCEPTED: "✅",
  TRIP_REMOVED: "🧳",
  FRIEND_REQUEST: "👋",
  FRIEND_ACCEPTED: "🤝",
  COMMENT_REPLY: "💬",
  COMMENT_LIKE: "❤️",
  FRIEND_GOING: "👥",
  FRIEND_ATTENDED: "🎫",
  PREMIUM_GRANTED: "✨",
  ACHIEVEMENT: "🏆",
  PERFORMER_BIRTHDAY: "🎂",
  EPISODE_AIRED: "📺",
  DRAMA_ADDED: "🎬",
  ONLINE_BOOKING: "🎟",
  PERFORMER_EVENT: "🎤",
  DRAMA_STARTED: "▶️",
  COMMUNITY_JOIN_REQUEST: "🙋",
  COMMUNITY_JOIN_ANSWER: "🫂",
  COMMUNITY_INVITE: "💌",
  COMMUNITY_POST: "📝",
  COMMUNITY_DIGEST: "📬",
};

export function notificationIcon(kind: string): string {
  return NOTIFICATION_ICONS[kind] ?? "🔔";
}

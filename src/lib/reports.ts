/**
 * На что вообще принимается жалоба (`Report.targetType`).
 *
 * Список закрытый: `targetType` приезжает с клиента, и произвольная
 * строка засоряла бы очередь модерации записями, которые ни открыть, ни
 * удалить — в /admin/moderation такая жалоба выглядела бы как «placeXyz
 * cm4k…» без единого действия.
 *
 * Подписи русские, потому что этот же справочник даёт человеческую
 * строку в уведомлении админам («Жалоба на встречу сообщества») — раньше
 * туда уезжал сырой `communityPost`.
 *
 * Отдельным модулем, а не константой в `feedbackActions.ts`: файл с
 * `"use server"` умеет экспортировать только асинхронные функции, а этот
 * справочник нужен и экшену, и кнопке жалобы, и очереди модерации.
 *
 * Сообщества (АА25): жаловаться можно не только на тему, но и на само
 * сообщество, его встречу и его ссылку. Внутри сообщества есть свои
 * хозяева, но проблемой бывает сообщество целиком — а закрытое админ
 * иначе и не увидит (см. docs/features/communities.md, «Модерация
 * сообществ со стороны админки»).
 */
export const REPORT_TARGET_LABELS = {
  placeList: "список мест",
  profile: "профиль",
  eventNote: "заметку",
  comment: "комментарий",
  review: "отзыв",
  communityPost: "тему в сообществе",
  community: "сообщество",
  communityMeetup: "встречу сообщества",
  communityLink: "ссылку сообщества",
} as const;

export type ReportTargetType = keyof typeof REPORT_TARGET_LABELS;

export function isReportTargetType(value: string): value is ReportTargetType {
  return Object.prototype.hasOwnProperty.call(REPORT_TARGET_LABELS, value);
}

/**
 * Константы фикстуры для notification-click-read.spec.ts — общие для
 * create-/delete-скриптов и самой спеки. actorName служит и меткой
 * фикстуры: по нему скрипты находят и убирают свои строки, не трогая
 * настоящие уведомления (локальная база — копия прода).
 */
export const CLICK_NOTIFICATION = {
  kind: "FRIEND_REQUEST" as const,
  actorName: "e2e-click",
  // Фраза собирается при чтении из kind + actorName; title — запасной
  // вариант для Telegram и старых строк, тут просто дублирует смысл.
  title: "e2e-click wants to add you as a friend",
  href: "/account",
};

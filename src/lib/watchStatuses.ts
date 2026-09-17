/**
 * Порядок статусов просмотра для полосы «библиотеки» в статистике
 * профиля. Отдельный модуль без Prisma: его импортирует и серверный
 * свод (lib/userStats.ts), и клиентская вкладка (StatsTab.tsx) — а
 * userStats тянет Prisma, и тащить его в клиентский бандл нельзя.
 */
export const WATCH_STATUS_KEYS = [
  "WATCHING",
  "COMPLETED",
  "PLAN_TO_WATCH",
  "ON_HOLD",
  "DROPPED",
] as const;
export type WatchStatusKey = (typeof WATCH_STATUS_KEYS)[number];

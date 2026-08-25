import type { DramaWatchStatusValue } from "@/app/(public)/favorites/actions";

// Без единого серверного импорта (Prisma и прочего) — модуль тянет
// клиентский DramaStatusButton ради одного порядка статусов. Серверная выборка живёт в src/lib/favorites.ts.
// Подписи здесь не лежат: статусы видит посетитель, поэтому они берутся
// из словаря (t.catalog.watchStatus) на месте отрисовки.

export const WATCH_STATUS_ORDER: DramaWatchStatusValue[] = [
  "WATCHING",
  "COMPLETED",
  "PLAN_TO_WATCH",
  "ON_HOLD",
  "DROPPED",
];

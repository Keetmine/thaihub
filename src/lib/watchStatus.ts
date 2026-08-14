import type { DramaWatchStatusValue } from "@/app/(public)/favorites/actions";

// Kept free of any server-only import (Prisma, etc.) — this module is
// pulled into client components (AccountTabs, WatchStatusSelect,
// DramaStatusButton) for the labels/order alone. The server-side lookup
// lives in src/lib/favorites.ts instead.

export const WATCH_STATUS_LABELS: Record<DramaWatchStatusValue, string> = {
  WATCHING: "Смотрю сейчас",
  COMPLETED: "Просмотрено",
  ON_HOLD: "Отложено",
  PLAN_TO_WATCH: "Буду смотреть",
  DROPPED: "Заброшено",
};

export const WATCH_STATUS_ORDER: DramaWatchStatusValue[] = [
  "WATCHING",
  "COMPLETED",
  "PLAN_TO_WATCH",
  "ON_HOLD",
  "DROPPED",
];

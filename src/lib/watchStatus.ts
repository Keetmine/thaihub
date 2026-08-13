import type { DramaWatchStatusValue } from "@/app/(public)/favorites/actions";

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

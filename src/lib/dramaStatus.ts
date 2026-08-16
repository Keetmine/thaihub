import type { DramaStatus } from "@/generated/prisma/client";

export const DRAMA_STATUS_LABELS: Record<DramaStatus, string> = {
  RETURNING_SERIES: "Выходит",
  PLANNED: "Запланирован",
  IN_PRODUCTION: "В производстве",
  ENDED: "Завершён",
  CANCELED: "Отменён",
  PILOT: "Пилот",
};

// Цветовое кодирование статуса (см. globals.css): ещё не вышедшие —
// красный, выходящие сейчас — зелёный, уже вышедшие — голубой.
export const DRAMA_STATUS_BADGE_CLASS: Record<DramaStatus, string> = {
  RETURNING_SERIES: "status-badge-airing",
  PLANNED: "status-badge-upcoming",
  IN_PRODUCTION: "status-badge-upcoming",
  PILOT: "status-badge-upcoming",
  ENDED: "status-badge-ended",
  CANCELED: "status-badge-canceled",
};

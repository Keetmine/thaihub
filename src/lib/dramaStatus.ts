import type { DramaStatus } from "@/generated/prisma/client";

export const DRAMA_STATUS_LABELS: Record<DramaStatus, string> = {
  RETURNING_SERIES: "Выходит",
  PLANNED: "Запланирован",
  IN_PRODUCTION: "В производстве",
  ENDED: "Завершён",
  CANCELED: "Отменён",
  PILOT: "Пилот",
};

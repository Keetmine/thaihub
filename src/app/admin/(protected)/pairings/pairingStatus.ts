import type { PairingStatus } from "@/generated/prisma/client";

/** Подписи статусов пейринга. Живут рядом с разделом, а не в общем
 *  lib: их читают только список пейрингов (бейдж строки и выпадашка
 *  массового действия) и запись в историю правок — у фильтров каталога
 *  свои подписи в `catalogFilters`. */
export const PAIRING_STATUS_LABELS: Record<PairingStatus, string> = {
  CURRENT: "Текущий",
  PAST: "Бывший",
};

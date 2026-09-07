import { METRICS, METRIC_KEYS } from "@/lib/achievements";
import { COMMUNITY_METRICS, COMMUNITY_METRIC_KEYS } from "@/lib/communityAchievements";
import type { MetricOption } from "./AchievementForm";

/**
 * Плоский список метрик для формы ачивки — обоих видов сразу.
 *
 * Сами реестры серверные (тянут prisma через свои модули) и в
 * клиентский бандл не попадают, поэтому форма получает готовые опции.
 * Отдельным модулем, а не копией в двух страницах (создание и правка):
 * две копии одного списка разъехались бы.
 */
export function metricOptionsForForm(): MetricOption[] {
  return [
    ...METRIC_KEYS.map((value) => ({
      value,
      label: METRICS[value].label,
      kind: METRICS[value].kind,
      scope: "USER" as const,
    })),
    ...COMMUNITY_METRIC_KEYS.map((value) => ({
      value,
      label: COMMUNITY_METRICS[value].label,
      kind: COMMUNITY_METRICS[value].kind,
      scope: "COMMUNITY" as const,
    })),
  ];
}

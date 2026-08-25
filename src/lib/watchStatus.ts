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

/**
 * Сколько серий отмечено и сколько всего — для показа прогресса.
 *
 * Отдельной функцией, потому что у «Просмотрено» счётчик может быть
 * пустым: статус ставили до того, как появился подсчёт серий, или
 * ставили руками у сериала с неизвестным тогда числом серий. Показывать
 * в этом случае «0 из 10» было бы прямой ложью — досмотренный сериал
 * досмотрен целиком, поэтому подставляем n из n.
 *
 * Возвращает null, когда показывать нечего: статуса нет вовсе или серии
 * не отмечались у сериала, который человек ещё не досмотрел.
 */
export function episodeProgress(
  entry: { status: DramaWatchStatusValue; episodesWatched: number | null } | null | undefined,
  episodes: number | null | undefined,
): { watched: number; total: number | null } | null {
  if (!entry) return null;
  const total = episodes ?? null;
  const watched =
    entry.episodesWatched ?? (entry.status === "COMPLETED" ? total : null);
  if (watched === null) return null;
  return { watched, total };
}

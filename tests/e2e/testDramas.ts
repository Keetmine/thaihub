/**
 * Сериалы-фикстуры для episode-progress.spec.ts.
 *
 * Отдельный файл БЕЗ единого импорта — и это не вкусовщина: спека
 * тянет отсюда константы, а Prisma здесь ESM-only, и любой файл, через
 * который она попадёт в граф спеки, роняет прогон с «Cannot use
 * import.meta outside a module». Заводит сами записи отдельный
 * tsx-процесс (create-test-dramas.ts), он же и импортирует Prisma.
 *
 * Различие статусов существенное: правило «дошёл до последней серии —
 * сериал закрывается» действует только у вышедшего целиком.
 */
export const TEST_DRAMAS = {
  ended: {
    slug: "e2e-ended-drama",
    title: "E2E Ended Drama",
    episodes: 22,
    status: "ENDED",
  },
  airing: {
    slug: "e2e-airing-drama",
    title: "E2E Airing Drama",
    episodes: 10,
    status: "RETURNING_SERIES",
  },
} as const;

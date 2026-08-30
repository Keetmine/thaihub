/**
 * Фикстуры для гостевых смоук-спек similar-dramas.spec.ts и
 * calendar-series.spec.ts.
 *
 * Файл БЕЗ единого импорта — по той же причине, что testDramas.ts:
 * спеки тянут отсюда константы, а Prisma ESM-only, и любой файл, через
 * который она попадёт в граф спеки, роняет прогон с «Cannot use
 * import.meta outside a module». Сами записи заводит отдельный
 * tsx-процесс (create-smoke-fixtures.ts).
 *
 * Жанр и актёры — маркеры, которых нет ни у одной настоящей записи:
 * блок «Вам может понравиться» (скоринг в src/lib/similarDramas.ts,
 * порог 2) на ЛЮБОЙ базе покажет у исходника ровно кандидатов —
 * общий актёр даёт 3 очка, общий жанр ещё 1, а настоящие сериалы по
 * маркерам не совпадают.
 */
export const SIMILAR_GENRE = "E2E Similar Genre";

export const SIMILAR_PERFORMERS = [
  { slug: "e2e-similar-actor-1", name: "E2E Similar Actor One" },
  { slug: "e2e-similar-actor-2", name: "E2E Similar Actor Two" },
] as const;

/** Исходник: страница, на которой ждём блок рекомендаций. */
export const SIMILAR_SOURCE = {
  slug: "e2e-similar-source",
  title: "E2E Similar Source Drama",
} as const;

/** Кандидаты: общий каст + общий жанр с исходником. */
export const SIMILAR_CANDIDATES = [
  { slug: "e2e-similar-hit-1", title: "E2E Similar Hit One", year: 2022 },
  { slug: "e2e-similar-hit-2", title: "E2E Similar Hit Two", year: 2023 },
] as const;

/** Сериал со серией, выходящей СЕГОДНЯ, — для блока «Выходит сегодня»
 *  на главной. Дату серии create-smoke-fixtures.ts ставит на текущие
 *  UTC-сутки (вся работа с датами в проекте — UTC, см. src/lib/dates.ts). */
export const TODAY_DRAMA = {
  slug: "e2e-airing-today",
  title: "E2E Airing Today Drama",
  episodes: 12,
  episodeNumber: 3,
} as const;

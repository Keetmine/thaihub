/**
 * Константы фикстур review-privacy.spec.ts — общие для спека и
 * create/delete-скриптов (Prisma в спеки не импортировать, см.
 * docs/testing.md: скрипты запускаются отдельным tsx-процессом).
 * Префикс e2e- — как у остальных тестовых записей.
 */
export const REVIEW_AUTHOR_EMAIL = "e2e-review-author@test.local";
export const REVIEW_VIEWER_EMAIL = "e2e-review-viewer@test.local";
export const REVIEW_TEST_PASSWORD = "e2e-review-pass";
export const REVIEW_DRAMA = {
  slug: "e2e-review-privacy-drama",
  title: "E2E Review Privacy Drama",
};
/** Публичная оценка зрителя — создаётся фикстурой, чтобы у среднего
 *  рейтинга была публичная база, от которой приватный не должен
 *  отклонять (10 при приватной 2 — расхождение видно сразу). */
export const VIEWER_PUBLIC_RATING = 10;

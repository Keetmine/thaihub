/**
 * Константы фикстур profile-privacy.spec.ts — общие для спека и
 * create/delete-скриптов (Prisma в спеки не импортировать, см.
 * docs/testing.md). Префикс e2e- — как у остальных тестовых записей.
 *
 * Проверяется единая страница профиля /users/[id]: зрителю не должны
 * доставаться приватный отзыв, приватная поездка и email владельца —
 * даже в HTML (фильтры стоят в серверных выборках).
 */
export const PROFILE_OWNER_EMAIL = "e2e-profile-owner@test.local";
export const PROFILE_VIEWER_EMAIL = "e2e-profile-viewer@test.local";
export const PROFILE_TEST_PASSWORD = "e2e-profile-pass";

/** Два сериала: у отзыва уникальность (userId, dramaId), поэтому
 *  приватный и публичный отзывы владельца живут на разных записях. */
export const PROFILE_DRAMA_PRIVATE = {
  slug: "e2e-profile-privacy-drama-a",
  title: "E2E Profile Privacy Drama A",
};
export const PROFILE_DRAMA_PUBLIC = {
  slug: "e2e-profile-privacy-drama-b",
  title: "E2E Profile Privacy Drama B",
};

export const PRIVATE_REVIEW_TEXT = "E2E private profile review — must stay hidden";
export const PUBLIC_REVIEW_TEXT = "E2E public profile review — visible to all";
export const PRIVATE_TRIP_TITLE = "E2E private trip — must stay hidden";
export const PUBLIC_TRIP_TITLE = "E2E public trip — visible to all";

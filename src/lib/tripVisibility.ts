// Клиент-безопасный модуль без серверных импортов — используется и в
// серверных страницах (метки в списках), и в клиентских контролах
// (TripVisibilityControls.tsx), по тому же принципу, что dramaStatus.ts.
export const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: "Приватная",
  FRIENDS: "Для друзей",
  PUBLIC: "Публичная",
};

export const VISIBILITY_HINTS: Record<string, string> = {
  PRIVATE: "видите только вы",
  FRIENDS: "видят ваши друзья",
  PUBLIC: "видят все по ссылке",
};

/**
 * Вики: индекс статей и страница статьи. Сами статьи пишет владелец —
 * их текст живёт в базе и здесь не переводится (см. features/i18n.md).
 */
export const wiki = {
  metaTitle: "Wiki",
  metaDescription:
    "Guides and useful articles for fans of Thai actors: tickets, trips, fan meets.",
  eyebrow: "Useful",
  title: "Wiki",
  intro:
    "Guides and articles: how to buy tickets, where to fly, what to watch — everything a fan needs, in one place.",
  emptyTitle: "Articles are on the way",
  emptyHint: "We are putting together guides on tickets, trips and fan meets — do look in later.",

  article: {
    metaTitle: "Article",
    metaNotFound: "Article not found.",
    metaDescription: (title: string) => `${title}: a step-by-step guide for fans of Thai actors.`,
    back: "← Help",
  },
};

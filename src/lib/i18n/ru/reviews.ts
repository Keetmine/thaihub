import type { Dict } from "../en";

export const reviews: Dict["reviews"] = {
  reviewsHeading: "Отзывы",
  commentsHeading: "Комментарии",
  noName: "Без имени",
  writeReview: "+ Написать отзыв",
  editReview: "Редактировать мой отзыв",
  reviewPlaceholder: "Чем зацепило, что не понравилось, кому советуете…",
  reviewAria: "Текст отзыва",
  ratingLabel: "Оценка",
  outOf10: "из 10",
  publish: "Опубликовать",
  save: "Сохранить",
  // Приватный отзыв: чекбокс в форме и бейдж у своего отзыва в списке.
  privateLabel: "Виден только мне",
  privateBadge: "виден только вам",
  deleteReview: "Удалить отзыв",
  deleteReviewConfirm: "Удалить ваш отзыв?",
  noReviews: "Пока нет отзывов — будьте первыми.",
  commentPlaceholder: "Ваш комментарий…",
  commentAria: "Ваш комментарий",
  noComments: "Пока нет комментариев — начните обсуждение.",
  deleteComment: "Удалить комментарий",
  deleteCommentConfirm: "Удалить комментарий?",
  signIn: "Войдите",
  toReview: ", чтобы оставить отзыв.",
  toComment: ", чтобы комментировать.",
  send: "Отправить",
  reply: "Ответить",
  replyPlaceholder: (name: string) => `Ответ для ${name}…`,
  replyAria: (name: string) => `Ответ для ${name}`,
  author: "автора",

  /** Ответы серверных экшенов — их показывают формы блока. */
  errors: {
    ratingRange: "Оценка — от 1 до 10",
    textRequired: "Напишите текст отзыва",
    emptyComment: "Пустой комментарий",
    tooLongComment: "Слишком длинный комментарий",
    parentNotFound: "Родительский комментарий не найден",
    cannotDeleteOthers: "Нельзя удалить чужой комментарий",
  },
};

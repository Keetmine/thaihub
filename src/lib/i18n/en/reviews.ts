export const reviews = {
  reviewsHeading: "Reviews",
  commentsHeading: "Comments",
  noName: "No name",
  writeReview: "+ Write a review",
  editReview: "Edit my review",
  reviewPlaceholder: "What hooked you, what didn't, who would you recommend it to…",
  reviewAria: "Review text",
  /** Фото в комментариях (АА20). */
  photos: {
      add: "Attach a photo",
      uploading: "Uploading…",
      /** Подписи у кнопки нет: скрепка объясняется подсказкой по
       *  наведению (правка владельца 2026-09-09), и `add` теперь ею и
       *  служит. */
      remove: "Remove the photo",
  },

  rating: {
      story: "Story",
      acting: "Cast",
      music: "Music",
      overall: "Overall",
      choose: (label: string, n: string) => `${label}: rate ${n} out of 10`,
      overallAuto: "Overall is the average of the sections — feel free to change it.",
  },
  publish: "Publish",
  save: "Save",
  // Приватный отзыв: чекбокс в форме (с подсказкой) и бейдж у своего
  // отзыва в списке.
  privateLabel: "Private review",
  privateBadge: "Private",
  privateHint: "Hidden from others and excluded from the rating",
  deleteReview: "Delete review",
  deleteReviewConfirm: "Delete your review?",
  noReviews: "No reviews yet — be the first.",
  commentPlaceholder: "Your comment…",
  commentAria: "Your comment",
  noComments: "No comments yet — start the conversation.",
  deleteComment: "Delete comment",
  deleteCommentConfirm: "Delete this comment?",
  signIn: "Sign in",
  toReview: " to leave a review.",
  toComment: " to comment.",
  send: "Send",
  reply: "Reply",
  replyPlaceholder: (name: string) => `Reply to ${name}…`,
  replyAria: (name: string) => `Reply to ${name}`,
  author: "author",

  /** Ответы серверных экшенов — их показывают формы блока. */
  errors: {
    ratingRange: "Set an overall rating — between 0.5 and 10",
        eventNotFinished: "You can review an event once it is over.",
    textRequired: "Write the review text",
    emptyComment: "The comment is empty",
    tooLongComment: "The comment is too long",
    parentNotFound: "The parent comment was not found",
    cannotDeleteOthers: "You can't delete someone else's comment",
  },
};

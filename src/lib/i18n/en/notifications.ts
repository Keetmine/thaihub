/**
 * Строки колокольчика. Фраза собирается при чтении из повода
 * (`Notification.kind`) и замороженных частей (`actorName`, `subject`) —
 * писать её при создании нельзя, язык получателя тогда неизвестен.
 *
 * `someone` подставляется, когда у человека нет имени: фраза «оценил
 * ваш комментарий» без подлежащего не читается.
 */
export const notifications = {
  someone: "Someone",

  title: {
    FRIEND_REQUEST: (who: string) => `${who} wants to add you as a friend`,
    FRIEND_ACCEPTED: (who: string) => `${who} accepted your friend request`,
    COMMENT_REPLY: (who: string) => `${who} replied to your comment`,
    COMMENT_LIKE: (who: string) => `${who} liked your comment`,
    TRIP_INVITE: (who: string, trip: string) => `${who} is inviting you on the trip "${trip}"`,
    TRIP_INVITE_ACCEPTED: (who: string) => `${who} accepted your trip invitation`,
    FRIEND_GOING: (who: string, event: string) => `${who} is going to "${event}"`,
    ACHIEVEMENT: (name: string) => `New achievement: ${name}`,
    PREMIUM_GRANTED: "Your subscription is active",
    PERFORMER_BIRTHDAY: (name: string) => `It's ${name}'s birthday today`,
    EPISODE_AIRED: (drama: string) => `New episode of "${drama}"`,
  },

  birthdayBody: (turns: number) => `Turning ${turns}.`,

  episodeBody: (n: number, total: number | null) =>
    total ? `Episode ${n} of ${total} is out.` : `Episode ${n} is out.`,

  premiumBody: (until: string) => `The feed, the calendar and trips are open — until ${until}.`,
};

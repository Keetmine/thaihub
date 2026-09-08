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
    TRIP_REMOVED: (trip: string) => `You were removed from “${trip}” — your copy is saved`,
    FRIEND_GOING: (who: string, event: string) => `${who} is going to "${event}"`,
    ACHIEVEMENT: (name: string) => `New achievement: ${name}`,
    PREMIUM_GRANTED: "Your subscription is active",
    // Бессрочная выдача из админки — праздничный тон по просьбе владельца.
    PREMIUM_LIFETIME: "🎉 You've got access forever!",
    PERFORMER_BIRTHDAY: (name: string) => `It's ${name}'s birthday today`,
    EPISODE_AIRED: (drama: string) => `New episode of "${drama}"`,
    DRAMA_ADDED: (drama: string) => `"${drama}" is now in our catalog`,
    ONLINE_BOOKING: (event: string) => `Online booking for "${event}" opens soon`,
    // «Кто» здесь — артист, а не пользователь: имя замораживается в
    // actorName так же, как имена людей в соседних поводах.
    PERFORMER_EVENT: (who: string, event: string) => `${who} has a new event: "${event}"`,
    DRAMA_STARTED: (drama: string) => `"${drama}" from your plans has started`,
    COMMUNITY_DIGEST: (community: string) => `“${community}” this month`,
    COMMUNITY_JOIN_REQUEST: (who: string, community: string) =>
        `${who} wants to join "${community}"`,
    COMMUNITY_JOIN_ACCEPTED: (community: string) => `You are now a member of "${community}"`,
    COMMUNITY_JOIN_DECLINED: (community: string) => `Your request to join "${community}" was declined`,
    COMMUNITY_INVITE: (who: string, community: string) =>
        `${who} is inviting you to the community "${community}"`,
    COMMUNITY_POST: (who: string, community: string) =>
        `${who} started a topic in "${community}"`,
  },

  /** Body of the online-booking reminder: the time is Thai wall-clock,
   *  exactly as the ticket owner entered it. */
  onlineBookingBody: (time: string) => `Opens in about an hour — at ${time} (Thai time).`,

  birthdayBody: (turns: number) => `Turning ${turns}.`,

  episodeBody: (n: number, total: number | null) =>
    total ? `Episode ${n} of ${total} is out.` : `Episode ${n} is out.`,

  /** Подборки бота по /today и /week — см. src/lib/botDigest.ts. Язык
   *  берётся из профиля привязанного аккаунта, как у notifyUser. */
  digest: {
    todayTitle: "Today for you",
    weekTitle: "Your week ahead",
    episodesHeader: "Episodes of your series",
    eventsHeader: "Your events",
    presalesHeader: "Ticket sales opening",
    birthdaysHeader: "Birthdays of artists you follow",
    episodeLine: (drama: string, n: number) => `${drama} — episode ${n}`,
    presaleLine: (event: string, time: string) => `${event} — at ${time} (Thai time)`,
    empty:
      "Nothing yet: mark series you watch and add artists and events to favorites — the digest will fill up.",
    /** Подпись воскресной рассылки (sendWeeklyDigests). У ответов бота
     *  её нет: там человек спросил сам, и «как отписаться» неуместно. */
    weeklyFooter: "Your weekly digest — switch it off in notification settings.",
  },

  premiumBody: (until: string) => `The feed, the calendar and trips are open — until ${until}.`,
  premiumLifetimeBody:
    "You're super-duper-mega awesome, so the feed, the calendar and trips are yours for good. No renewals — ever 💜",
};

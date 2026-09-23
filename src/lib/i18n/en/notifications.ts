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

  /**
   * Несколько избранных артистов в одном событии — одной фразой
   * (правка владельца 2026-09-22: «создала событие для двух актёров, а
   * в уведомлении только один, хотя оба в избранном»). Больше трёх имён
   * в заголовок не влезает, поэтому хвост сворачивается в «и ещё N».
   */
  namesList: (names: string[]): string => {
    if (names.length <= 1) return names[0] ?? "";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
    return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  },

  title: {
    FRIEND_REQUEST: (who: string) => `${who} wants to add you as a friend`,
    FRIEND_ACCEPTED: (who: string) => `${who} accepted your friend request`,
    COMMENT_REPLY: (who: string) => `${who} replied to your comment`,
    COMMENT_LIKE: (who: string) => `${who} liked your comment`,
    TRIP_INVITE: (who: string, trip: string) => `${who} is inviting you on the trip "${trip}"`,
    TRIP_INVITE_ACCEPTED: (who: string) => `${who} accepted your trip invitation`,
    TRIP_REMOVED: (trip: string) => `You were removed from “${trip}” — your copy is saved`,
    FRIEND_GOING: (who: string, event: string) => `${who} is going to "${event}"`,
    FRIEND_ATTENDED: (who: string, event: string) => `${who} was at "${event}"`,
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
    // Ежедневный отсчёт до поездки (АА9): число дней — в подписи дня
    // (tripCountdown ниже), заголовок только называет поездку.
    TRIP_COUNTDOWN: (trip: string) => `Your trip “${trip}” is coming up`,
  },

  /**
   * Подписи обратного отсчёта до поездки, по числу оставшихся дней:
   * индекс 0 — «сегодня», 30 — «ровно месяц», с которого отсчёт и
   * начинается (просьба владельца 2026-09-23: «йоу йоу йоу, осталось 25
   * дней», «жесть, поездка уже через неделю» — смешное, милое,
   * современное). Ровно COUNTDOWN_START_DAYS + 1 строка, по одной на
   * день; обращение нейтральное — пол человека мы не знаем.
   */
  tripCountdown: [
    "Today! Sawasdee-ee-ee, Thailand 🇹🇭 Safe travels!",
    "Tomorrow! Tomorrow! TOMORROW! Good night won't work anyway 🛫",
    "The day after tomorrow! Charger, adapter, documents — all there? 🔌",
    "3 days. Losing sleep from excitement is allowed now — we permit it 🌙",
    "4 days. Something is definitely missing from the suitcase — time to remember what 🤔",
    "5 days. You can count down to takeoff on one hand ✋",
    "6 days. Somewhere they're already fueling your plane. Well, almost yours 🛩️",
    "Whoa, the trip is a week away 😱",
    "8 days. Your head is already in Bangkok, only the body is still at home 🙃",
    "9 days. We did the math: that's just nine more wake-ups 🛏️",
    "10 days! Last double-digit number — it only goes down from here 🔟",
    "11 days. Time to pick which series to download for the flight ✈️",
    "12 days. “Sawasdee kha/khap” — that's half the Thai phrasebook done 🙏",
    "13 days. Unlucky number? Not this time 🍀",
    "Two weeks. Two. Weeks. Time to get the suitcase out 🧳",
    "Halfway through the month! 15 days left ⏳",
    "16 days. Googling Bangkok weather is allowed now — it's called planning 🌦️",
    "17 days. Right between “still far away” and “oh wow, soon” 📍",
    "18 days. Dreaming of tom yum? That's normal. It's about to come true 🍜",
    "19 days. The suitcase is still in the closet, but it suspects something 🧳",
    "20 days. A round number — and round eyes of anticipation 👀",
    "Three weeks! Someone's already mentally at 7-Eleven buying toasties 🥪",
    "22 days. Double twos — pretty. Like you on vacation 😎",
    "23 days. The mangoes are ripening, the sticky rice is nearly on 🥭",
    "24 days. That's two 12-episode series at an episode a day. You'll finish both 📺",
    "Yo yo yo, 25 days left 🔥",
    "26 days. The Thai heat is warming up just for you ☀️",
    "27 days. Check your passport's expiry date. Seriously, right now 🛂",
    "Four weeks. Time to build the airplane playlist 🎧",
    "29 days. A month minus one — already sounds shorter, right?",
    "Exactly one month to go. The countdown is officially on 🛫",
  ],

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

import type { Dict } from "../en";

export const notifications: Dict["notifications"] = {
  someone: "Кто-то",

  title: {
    FRIEND_REQUEST: (who: string) => `${who} хочет добавить вас в друзья`,
    FRIEND_ACCEPTED: (who: string) => `${who} принял(а) заявку в друзья`,
    COMMENT_REPLY: (who: string) => `${who} ответил(а) на ваш комментарий`,
    COMMENT_LIKE: (who: string) => `${who} оценил(а) ваш комментарий`,
    TRIP_INVITE: (who: string, trip: string) => `${who} приглашает в поездку «${trip}»`,
    TRIP_INVITE_ACCEPTED: (who: string) => `${who} принял(а) приглашение в поездку`,
    TRIP_REMOVED: (trip: string) => `Вас убрали из поездки «${trip}» — ваша копия сохранена`,
    FRIEND_GOING: (who: string, event: string) => `${who} идёт на «${event}»`,
    ACHIEVEMENT: (name: string) => `Новое достижение: ${name}`,
    PREMIUM_GRANTED: "Подписка активна",
    PREMIUM_LIFETIME: "🎉 Вам открыт доступ навсегда!",
    PERFORMER_BIRTHDAY: (name: string) => `Сегодня день рождения у ${name}`,
    EPISODE_AIRED: (drama: string) => `Новая серия «${drama}»`,
    DRAMA_ADDED: (drama: string) => `Сериал «${drama}» теперь в каталоге`,
    ONLINE_BOOKING: (event: string) => `Скоро откроется онлайн-бронирование на «${event}»`,
    // «Кто» здесь — артист, а не пользователь: имя замораживается в
    // actorName так же, как имена людей в соседних поводах.
    PERFORMER_EVENT: (who: string, event: string) => `У ${who} новое событие: «${event}»`,
    DRAMA_STARTED: (drama: string) => `Стартовал сериал из ваших планов: «${drama}»`,
    // Сообщества: «+название» — приняли, «-название» — отказали. Приставку
    // ставит экшен: фраза собирается на языке получателя, готовый текст в
    // базу класть нельзя (см. notificationText.ts).
    COMMUNITY_DIGEST: (community: string) => `«${community}» за месяц`,
    COMMUNITY_JOIN_REQUEST: (who: string, community: string) =>
        `${who} просится в сообщество «${community}»`,
    COMMUNITY_JOIN_ACCEPTED: (community: string) => `Вас приняли в сообщество «${community}»`,
    COMMUNITY_JOIN_DECLINED: (community: string) => `Заявку в «${community}» отклонили`,
    COMMUNITY_INVITE: (who: string, community: string) =>
        `${who} зовёт вас в сообщество «${community}»`,
    COMMUNITY_POST: (who: string, community: string) =>
        `${who} завёл(а) тему в сообществе «${community}»`,
  },

  onlineBookingBody: (time: string) => `Откроется примерно через час — в ${time} (тайское время).`,

  birthdayBody: (turns: number) => `Исполняется ${turns}.`,

  episodeBody: (n: number, total: number | null) =>
    total ? `Вышла серия ${n} из ${total}.` : `Вышла серия ${n}.`,

  digest: {
    todayTitle: "Сегодня у вас",
    weekTitle: "Ваша неделя",
    episodesHeader: "Серии ваших сериалов",
    eventsHeader: "Ваши события",
    presalesHeader: "Старты продаж",
    birthdaysHeader: "Дни рождения избранных",
    episodeLine: (drama: string, n: number) => `${drama} — серия ${n}`,
    presaleLine: (event: string, time: string) => `${event} — в ${time} (тайское время)`,
    empty:
      "Пока пусто: отмечайте сериалы и добавляйте артистов и события в избранное — подборка наполнится.",
    weeklyFooter: "Ваш недельный дайджест — выключается в настройках уведомлений.",
  },

  premiumBody: (until: string) => `Открыты афиша, календарь и поездки — до ${until}.`,
  premiumLifetimeBody:
    "Вы супер-дупер-пупер крутые, поэтому афиша, календарь и поездки теперь ваши бессрочно. Продлевать ничего не нужно — никогда 💜",
};

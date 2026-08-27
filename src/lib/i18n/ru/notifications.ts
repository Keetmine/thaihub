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
    FRIEND_GOING: (who: string, event: string) => `${who} идёт на «${event}»`,
    ACHIEVEMENT: (name: string) => `Новая ачивка: ${name}`,
    PREMIUM_GRANTED: "Подписка активна",
    PERFORMER_BIRTHDAY: (name: string) => `Сегодня день рождения у ${name}`,
  },

  birthdayBody: (turns: number) => `Исполняется ${turns}.`,

  premiumBody: (until: string) => `Открыты афиша, календарь и поездки — до ${until}.`,
};

import type { settings as enSettings } from "../en/settings";

/** Русские строки редизайна настроек — структура обязана повторять
 *  английскую (см. en/index.ts). */
export const settings: typeof enSettings = {
  profileSection: "Профиль",
  regionalSection: "Язык и регион",
  regionalSectionHint:
    "Язык сайта, часовой пояс и страна — от них зависят даты, время и уведомления.",
  telegramSectionHint:
    "Напоминания и новости могут приходить и в мессенджер — здесь настраивается, что присылать.",
  passwordSection: "Пароль",
  passwordSectionHint:
    "После смены все остальные устройства разлогинятся — вход останется только здесь.",
  calendarSection: "Подписка на календарь",
  privacySection: "Кто что видит",

  saving: "Сохраняем…",
  saved: "Сохранено",
};

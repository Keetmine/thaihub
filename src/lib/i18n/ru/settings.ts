import type { settings as enSettings } from "../en/settings";

/** Русские строки редизайна настроек — структура обязана повторять
 *  английскую (см. en/index.ts). */
export const settings: typeof enSettings = {
  profileSection: "Профиль",
  regionalSection: "Язык и регион",
  telegramSectionHint:
    "Напоминания и новости могут приходить и в мессенджер — здесь настраивается, что присылать.",
  passwordSection: "Пароль",
  passwordSectionHint:
    "После смены все остальные устройства разлогинятся — вход останется только здесь.",
  calendarSection: "Подписка на календарь",
  privacySection: "Кто что видит",

  telegramNotifyDigest: "Недельный дайджест «Ваша неделя» (по воскресеньям)",
  telegramNotifyDigestPremium: "Входит в подписку",

  coverSection: "Обложка профиля",
  coverHint: "Широкая картинка над левой колонкой профиля. Её видят все.",
  coverPremiumHint: "Обложка профиля — часть подписки.",
  coverBadUrl: "Обложку сохранить не вышло — загрузите картинку заново",

  saving: "Сохраняем…",
  saved: "Сохранено",
};

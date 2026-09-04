/** Строки редизайна настроек (секции-карточки, подтверждение
 *  сохранения). Исторические строки настроек живут в account.ts —
 *  сюда кладём только НОВЫЕ ключи, чтобы не сталкиваться с
 *  параллельными правками того файла. */
export const settings = {
  // Заголовки и подводки секций-карточек.
  profileSection: "Profile",
  profileSectionHint:
    "How you appear to friends and on your public profile page.",
  regionalSection: "Language & region",
  regionalSectionHint:
    "The site language, your time zone and country — they shape dates, times and notifications.",
  telegramSectionHint:
    "Reminders and news can also arrive in the messenger — this section controls what gets sent.",
  passwordSection: "Password",
  passwordSectionHint:
    "After the change every other device is signed out — only this one stays in.",
  calendarSection: "Calendar subscription",
  privacySection: "Who sees what",

  // Подтверждение сохранения: server action ничего не возвращает,
  // поэтому «Сохранено» показывает клиентская обёртка формы.
  saving: "Saving…",
  saved: "Saved",
};

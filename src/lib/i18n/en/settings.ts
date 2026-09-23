/** Строки редизайна настроек (секции-карточки, подтверждение
 *  сохранения). Исторические строки настроек живут в account.ts —
 *  сюда кладём только НОВЫЕ ключи, чтобы не сталкиваться с
 *  параллельными правками того файла. */
export const settings = {
  // Заголовки и подводки секций-карточек.
  profileSection: "Profile",
  regionalSection: "Language & region",
  telegramSectionHint:
    "Reminders and news can also arrive in the messenger — this section controls what gets sent.",
  passwordSection: "Password",
  passwordSectionHint:
    "After the change every other device is signed out — only this one stays in.",
  calendarSection: "Calendar subscription",
  privacySection: "Who sees what",

  // Недельный дайджест «Ваша неделя» (аудит 2026-09, раздел 8).
  // Переключатель стоит в общем списке телеграм-поводов, а подсказка
  // появляется только у бесплатного аккаунта: обещать рассылку тому,
  // кому она не придёт, нечестно.
  telegramNotifyDigest: "Weekly digest “Your week ahead” (Sundays)",
  telegramNotifyDigestPremium: "Part of the subscription",

  // Обложка профиля — косметика подписчика (там же). Показывается ВСЕМ,
  // включая гостей; ставить может только подписчик.

  // Подтверждение сохранения: server action ничего не возвращает,
  // поэтому «Сохранено» показывает клиентская обёртка формы.
  saving: "Saving…",
  saved: "Saved",
};

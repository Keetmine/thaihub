import * as Sentry from "@sentry/nextjs";

// Клиентская часть Sentry. Без DSN ничего не инициализируется — на
// локальной разработке и превью ошибки в проект не летят.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // Session Replay записывает DOM и действия пользователя — включаем
  // только при согласии на аналитические куки (см. CookieConsent).
  // Сами отчёты об ошибках остаются: это диагностика работоспособности,
  // без записи сессии.
  const analyticsConsent = /(?:^|;\s*)cookie_consent=all/.test(document.cookie);
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Доля трассируемых запросов: полная трассировка на нашем объёме
    // не нужна и быстро съедает бесплатный лимит.
    tracesSampleRate: 0.1,
    // Записи сессий только там, где что-то сломалось, и только с согласия.
    replaysOnErrorSampleRate: analyticsConsent ? 1.0 : 0,
    replaysSessionSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

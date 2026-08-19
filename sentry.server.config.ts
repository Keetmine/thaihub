import * as Sentry from "@sentry/nextjs";

// Серверная часть. Наш собственный журнал (/admin/errors) остаётся —
// Sentry добавляет стектрейсы, группировку и уведомления, а админский
// лог удобен как быстрый взгляд «что упало за сутки».
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

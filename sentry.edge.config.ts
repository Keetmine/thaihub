import * as Sentry from "@sentry/nextjs";

// Edge-рантайм: у нас там только proxy.ts, но Next инициализирует
// инструментацию и для него.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

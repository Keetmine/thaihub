import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Черновой CSP в режиме Report-Only: ничего не блокирует, только пишет
// нарушения в консоль браузера. Боевой (enforcing) CSP — отдельная задача:
// на сайте инлайн-скрипты Next, Яндекс.Метрика, GTM/GA4, Sentry и
// телеграм-виджет, без вдумчивой обкатки политика их сломает.
const cspReportOnly = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' — инлайн-скрипты Next и Метрики; хосты —
  // Метрика, GTM/GA4, телеграм-виджет логина.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://mc.yandex.ru https://mc.yandex.com https://www.googletagmanager.com https://www.google-analytics.com https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  // Обложки локализуются в /uploads, но старые записи и аватарки могут
  // ссылаться наружу + пиксели счётчиков; тайлы карт — openstreetmap.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.sentry.io https://*.ingest.sentry.io",
  // Метрика и GTM вешают служебные фреймы; oauth.telegram.org — виджет логина.
  "frame-src https://mc.yandex.ru https://mc.yandex.com https://oauth.telegram.org https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  async headers() {
    return [
      {
        // Все маршруты приложения. /uploads/* на проде раздаёт Caddy мимо
        // Next — nosniff для них добавлен отдельно в Caddyfile.
        source: "/:path*",
        headers: [
          // Без preload: заявку в preload-список подаём отдельно, когда
          // будем уверены, что все поддомены навсегда на HTTPS.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Раздел /performers переименован в /artists — сохранённые ссылки
      // (включая query вида ?view=bands) редиректятся навсегда.
      {
        source: "/performers",
        destination: "/artists",
        permanent: true,
      },
      {
        source: "/performers/:slug",
        destination: "/artists/:slug",
        permanent: true,
      },
    ];
  },
};

// Обёртка Sentry: загружает карты кода для читаемых стектрейсов.
// Без SENTRY_AUTH_TOKEN загрузка пропускается — сборка не падает ни
// локально, ни в CI, где токена нет.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  // Карты кода не отдаём наружу: в них исходники приложения.
  widenClientFileUpload: false,
});

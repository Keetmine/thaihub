import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
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

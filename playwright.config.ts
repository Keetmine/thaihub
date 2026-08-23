import { defineConfig } from "@playwright/test";

// Smoke tests run against an already-running dev server (this project's
// Postgres data lives on the developer's machine — we don't want Playwright
// spinning up a second instance against the same DB). Start `npm run dev`
// yourself first; override the port with BASE_URL if it's not 3001.
//
// В CI (.github/workflows/e2e.yml) живого dev-сервера нет, а БД — одноразовый
// сервис-контейнер, поэтому там явно включается webServer флагом
// PW_WEB_SERVER=1: прод-сборка + `next start` на 3001. Без флага поведение
// ровно прежнее — никакого webServer.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // В CI вдобавок к list собираем HTML-отчёт — он уходит в artifacts при
  // падении (шаг upload-artifact в e2e.yml). Локально — как раньше.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  webServer:
    process.env.PW_WEB_SERVER === "1"
      ? {
          // Прод-сборка честнее dev-режима (ловит то, что dev прощает).
          // `next start` с output: "standalone" лишь предупреждает — сервер
          // поднимается штатно. Env (DATABASE_URL, APP_URL) наследуется от
          // процесса Playwright — в CI задаётся на уровне job.
          command: "npm run build && npm run start -- -p 3001",
          url: "http://localhost:3001",
          reuseExistingServer: false,
          // Запас на `next build`: в CI сборка занимает несколько минут.
          timeout: 300_000,
        }
      : undefined,
});

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
  // Один ретрай в CI гасит редкие флейки (сеть/таймауты на медленном
  // раннере); локально ретраев нет — упавший тест должен падать сразу,
  // иначе флейк маскируется и живёт вечно.
  retries: process.env.CI ? 1 : 0,
  // В CI вдобавок к list собираем HTML-отчёт — он уходит в artifacts при
  // падении (шаг upload-artifact в e2e.yml). Локально — как раньше.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  // Вход админом один на весь прогон: setup логинится и складывает
  // состояние в файл, админские спеки поднимают его через
  // test.use({ storageState: ADMIN_STORAGE_STATE }). Раньше вход звала
  // почти каждая спека — выходило ~14 попыток за прогон при лимите 30 за
  // 10 минут (src/lib/rateLimit.ts), и третий прогон подряд рассыпался
  // таймаутами на waitForURL.
  //
  // Состояние намеренно НЕ лежит в общем use: половина набора про
  // анонимного или своего свежего пользователя (favorites, premium-gates,
  // shared-trips, i18n), и админская сессия им всё ломает. Заодно
  // browser.newContext() внутри теста наследует опции из use — то есть
  // общее состояние протекло бы и туда.
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "e2e", dependencies: ["setup"] },
  ],
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
          // Обход лимита логина (src/lib/rateLimit.ts) для повторных
          // прогонов. Действует только вне production, поэтому на
          // прод-сборке в CI он ничего не отключает — там и не нужно:
          // вход один на прогон, раннер одноразовый. Локально сервер
          // стартует разработчик, так что флаг задаётся руками:
          // E2E_RATE_LIMIT_OFF=1 npm run dev (см. docs/testing.md).
          env: { E2E_RATE_LIMIT_OFF: "1" },
          // Запас на `next build`: в CI сборка занимает несколько минут.
          timeout: 300_000,
        }
      : undefined,
});

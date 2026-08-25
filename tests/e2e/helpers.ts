// Тесты ходят по адресам БЕЗ языкового префикса — это английская
// версия сайта (русская живёт под /ru, см. docs/features/i18n.md).
// Поэтому ожидаемые подписи здесь английские.
import "dotenv/config";
import { execFileSync } from "child_process";
import path from "path";
import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin-e2e@test.local";
export const ADMIN_TEST_PASSWORD = "admin-e2e-password";

/** Вход тестовым админом БЕЗ закрепления языка: язык поднимается из
 *  профиля, как у живого человека. Нужен user-locale.spec.ts — он как раз
 *  про эту связку; всем остальным нужен loginAsAdmin ниже. */
export async function loginAsAdminKeepingProfileLocale(page: Page) {
  // Отдельного админ-логина больше нет — админ это роль пользователя.
  // Тестовый админ создаётся/обновляется отдельным tsx-процессом
  // (Prisma ESM-only, из spec-файла её не импортировать).
  execFileSync("npx", ["tsx", path.join(__dirname, "create-admin-user.ts")], {
    cwd: path.join(__dirname, "../.."),
  });
  await page.goto("/login");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
}

export async function loginAsAdmin(page: Page) {
  await loginAsAdminKeepingProfileLocale(page);

  // Закрепляем английский. Тесты проверяют английские подписи (сайт по
  // умолчанию английский), а вход поднимает язык из профиля — и если
  // соседняя спека оставила там русский, соседи начинают падать на
  // ненайденных кнопках. Ставим после входа: до него куку перезапишет
  // createUserSession.
  //
  // url — именно origin, без пути: путь куки Playwright берёт из адреса, а
  // после входа с русским профилем адрес был бы /ru/account — и кука
  // досталась бы только страницам под /ru, то есть закрепила бы ровно не
  // то, ради чего ставится.
  await page.context().addCookies([
    { name: "locale", value: "en", url: new URL(page.url()).origin },
  ]);

  await page.goto("/admin");
  await page.waitForURL(/\/admin$/);
}

export async function signupTestUser(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.fill('input[name="name"]', "Smoke Test");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  // Обязательное согласие с условиями и политикой (Э1.5).
  await page.check('input[name="acceptTerms"]');
  await page.click('button[type="submit"]');
  // после регистрации — онбординг выбора любимых артистов
  await page.waitForURL(/\/welcome/);
}

export async function loginTestUser(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
}

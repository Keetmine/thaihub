// Тесты ходят по адресам БЕЗ языкового префикса — это английская
// версия сайта (русская живёт под /ru, см. docs/features/i18n.md).
// Поэтому ожидаемые подписи здесь английские.
import "dotenv/config";
import { execFileSync } from "child_process";
import path from "path";
import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin-e2e@test.local";
export const ADMIN_TEST_PASSWORD = "admin-e2e-password";

export async function loginAsAdmin(page: Page) {
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

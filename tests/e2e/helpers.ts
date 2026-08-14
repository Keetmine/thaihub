import "dotenv/config";
import type { Page } from "@playwright/test";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-please";

export async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin$/);
}

export async function signupTestUser(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.fill('input[name="name"]', "Smoke Test");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
}

export async function loginTestUser(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
}

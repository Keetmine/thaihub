import "dotenv/config";
import { execFileSync } from "child_process";
import path from "path";
import type { Page } from "@playwright/test";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-please";

export async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin$/);
}

export async function signupTestUser(page: Page, email: string, password: string) {
  // Регистрация только по инвайтам — код создаётся отдельным tsx-процессом
  // (Prisma ESM-only, из spec-файла её не импортировать).
  const inviteCode = execFileSync(
    "npx",
    ["tsx", path.join(__dirname, "create-invite.ts")],
    { cwd: path.join(__dirname, "../..") },
  )
    .toString()
    .trim()
    .split("\n")
    .pop()!;

  await page.goto("/signup");
  await page.fill('input[name="name"]', "Smoke Test");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="inviteCode"]', inviteCode);
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

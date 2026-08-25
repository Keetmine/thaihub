import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_TEST_PASSWORD, loginAsAdmin } from "./helpers";

/**
 * Язык, выбранный в профиле.
 *
 * Куки хватает интерфейсу, но не тому, что уходит человеку вне запроса —
 * уведомлениям в Telegram и календарной подписке. Поэтому выбор живёт
 * ещё и в `User.locale`, а кука из него восстанавливается при входе.
 * Именно эта связка и ломается молча: язык на странице выглядит
 * правильным, а письма продолжают приходить на другом.
 */

async function setLanguage(page: import("@playwright/test").Page, value: "en" | "ru") {
  await page.goto("/account/settings");
  await page.selectOption('select[name="locale"]', value);
  await page.locator('form:has(select[name="locale"]) button[type="submit"]').first().click();
}

test("выбор языка в настройках сразу переводит страницу", async ({ page }) => {
  await loginAsAdmin(page);
  await setLanguage(page, "ru");
  // Не просто «кука поставилась»: заголовок с языком для этого запроса
  // proxy посчитал до того, как кука появилась, поэтому без перехода
  // страница осталась бы английской — и выглядело бы это как несработавшее
  // сохранение.
  await page.waitForURL(/\/ru\/account\/settings/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");

  await setLanguage(page, "en");
  await page.waitForURL(/localhost[^/]*\/account\/settings|\/account\/settings$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("вход на новом устройстве поднимает язык из профиля", async ({ browser, page }) => {
  await loginAsAdmin(page);
  await setLanguage(page, "ru");
  await page.waitForURL(/\/ru\//);

  // Другой браузер: куки нет, язык системы английский — язык должен
  // прийти из профиля, иначе выбор жил бы только на одном устройстве.
  const ctx = await browser.newContext({ locale: "en-GB" });
  const fresh = await ctx.newPage();
  await fresh.goto("/login");
  await fresh.fill('input[name="email"]', ADMIN_EMAIL);
  await fresh.fill('input[name="password"]', ADMIN_TEST_PASSWORD);
  await fresh.click('button[type="submit"]');
  await fresh.waitForURL(/\/account/);

  await fresh.goto("/events");
  expect(new URL(fresh.url()).pathname).toBe("/ru/events");
  await ctx.close();

  await setLanguage(page, "en");
});

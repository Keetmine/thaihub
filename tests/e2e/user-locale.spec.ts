import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_TEST_PASSWORD, loginAsAdminKeepingProfileLocale } from "./helpers";

/**
 * Язык, выбранный в профиле.
 *
 * Куки хватает интерфейсу, но не тому, что уходит человеку вне запроса —
 * уведомлениям в Telegram и календарной подписке. Поэтому выбор живёт
 * ещё и в `User.locale`, а кука из него восстанавливается при входе.
 * Именно эта связка и ломается молча: язык на странице выглядит
 * правильным, а письма продолжают приходить на другом.
 *
 * Вход здесь свой, без `loginAsAdmin`: тот закрепляет куку `locale=en`,
 * чтобы соседние спеки видели английские подписи независимо от того,
 * какой язык остался в профиле. Для этой спеки такая кука — подмена
 * предмета проверки: она как раз про то, что язык приходит из профиля.
 */

async function setLanguage(page: import("@playwright/test").Page, value: "en" | "ru") {
  await page.goto("/account/settings");
  await page.selectOption('select[name="locale"]', value);
  await page.locator('form:has(select[name="locale"]) button[type="submit"]').first().click();
}

/** Адрес без языкового префикса: `/\/account\/settings$/` совпал бы и с
 *  `/ru/account/settings`, то есть не отличал бы английскую версию. */
const pathIs = (expected: string) => (url: URL) => url.pathname === expected;

test("выбор языка в настройках сразу переводит страницу", async ({ page }) => {
  await loginAsAdminKeepingProfileLocale(page);

  // Отправная точка: в профиле мог остаться русский с прошлого прогона, а
  // «переключение» в тот же язык не проверяет ничего — страница и так на
  // нём, и действие в настройках никуда не редиректит (оно сравнивает
  // выбранный язык с тем, что лежит в профиле).
  await setLanguage(page, "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await setLanguage(page, "ru");
  // Не просто «кука поставилась»: заголовок с языком для этого запроса
  // proxy посчитал до того, как кука появилась, поэтому без перехода
  // страница осталась бы английской — и выглядело бы это как несработавшее
  // сохранение.
  await page.waitForURL(/\/ru\/account\/settings/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");

  await setLanguage(page, "en");
  await page.waitForURL(pathIs("/account/settings"));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("вход на новом устройстве поднимает язык из профиля", async ({ browser, page }) => {
  await loginAsAdminKeepingProfileLocale(page);
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
  // /account — permanent redirect на профиль /users/… (в т.ч. под /ru).
  await fresh.waitForURL(/\/users\//);

  await fresh.goto("/events");
  expect(new URL(fresh.url()).pathname).toBe("/ru/events");
  await ctx.close();

  // Возвращаем профилю английский и ДОЖИДАЕМСЯ перехода: тесты идут по
  // одному аккаунту, и незавершённая запись оставила бы следующим спекам
  // русский профиль.
  await setLanguage(page, "en");
  await page.waitForURL(pathIs("/account/settings"));
});

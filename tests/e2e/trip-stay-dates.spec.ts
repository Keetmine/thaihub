import { test, expect, type Page } from "@playwright/test";

// Свои даты участника в общей поездке (АА17): подруги едут вместе, но
// прилетают и улетают вразнобой. Демо-данные: Аня (владелец «Бангкок с
// подругами») и Маша (принятая участница) — как в shared-trips.spec.ts.
//
// Спека возвращает всё как было («Как вся поездка» в конце), чтобы
// демо-набор не разъезжался от прогона к прогону.

const TRIP = "/trips/bangkok-s-podrugami-5tc0";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (u) => !u.pathname.includes("/login") || u.search.includes("error"),
  );
  test.skip(
    new URL(page.url()).pathname.includes("/login"),
    `демо-пользователя ${email} нет в этой БД — сценарии совместных поездок требуют демо-данных`,
  );
}

/** Даты ставим прямо в скрытые поля формы: кликать календарь здесь
 *  незачем, проверяем поведение страницы, а не сам DatePickerInput. */
async function setMyDates(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: /Мои даты|My dates/ }).click();
  await page
    .locator("input[name=startDate]")
    .evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
    }, from);
  await page
    .locator("input[name=endDate]")
    .evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
    }, to);
  await page.getByRole("button", { name: /^Сохранить$|^Save$/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function clearMyDates(page: Page) {
  await page.getByRole("button", { name: /Мои даты|My dates/ }).click();
  await page.getByRole("button", { name: /Как вся поездка|Whole trip/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("свои даты видны в шапке, в ленте и в списке участников", async ({ page }) => {
  await login(page, "anya@example.com", "demo1234");
  await page.goto(TRIP);

  // Берём даты поездки и отступаем внутрь: так рамка не поедет, а
  // отметки прилёта/отъезда встанут в дни, которые в ленте точно есть.
  const heading = await page.locator("h1").innerText();
  await setMyDates(page, "2026-10-20", "2026-10-24");

  await expect(page.getByRole("button", { name: /Мои даты: / })).toBeVisible();
  await expect(page.getByText(/вы прилетаете|you arrive/)).toBeVisible();
  await expect(page.getByText(/вы улетаете|you leave/)).toBeVisible();

  // В списке участников — свои даты у каждого.
  await page.getByRole("button", { name: /Участники|Members/ }).click();
  await expect(page.getByRole("dialog")).toContainText(/20 окт|20 Oct/);
  await page.getByRole("dialog").getByRole("button", { name: /Закрыть|Close/ }).click();

  await clearMyDates(page);
  await expect(page.getByText(/вы прилетаете|you arrive/)).toHaveCount(0);
  expect(await page.locator("h1").innerText()).toBe(heading);
});

test("участник видит прилёт другого участника", async ({ page }) => {
  await login(page, "anya@example.com", "demo1234");
  await page.goto(TRIP);
  await setMyDates(page, "2026-10-20", "2026-10-24");

  // Маша — принятая участница той же поездки.
  await login(page, "masha@example.com", "demo1234");
  await page.goto(TRIP);
  await expect(page.getByText(/прилетает|arrives/)).toBeVisible();

  await login(page, "anya@example.com", "demo1234");
  await page.goto(TRIP);
  await clearMyDates(page);
});

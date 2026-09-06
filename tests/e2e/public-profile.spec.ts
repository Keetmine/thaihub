import { test, expect } from "@playwright/test";

// Профиль открыт БЕЗ входа (правка владельца 2026-09-06): ссылкой на
// себя делятся снаружи, и упираться в форму логина она не должна.
// Гость при этом остаётся «чужим, который никому не друг» — видит ровно
// то, что владелец открыл посторонним. Спека нарочно гостевая: своей
// сессии не заводит.

test("гостя пускают в профиль, а не на форму входа", async ({ page }) => {
  await page.goto("/ru/users/keetmine");
  await expect(page).toHaveURL(/\/users\/keetmine$/);
  await expect(page.locator("h1")).toContainText("Keetmine");
});

test("гость не видит приватного", async ({ page }) => {
  await page.goto("/ru/users/keetmine");
  const html = await page.content();
  // Вкладка билетов — только своя.
  expect(html).not.toContain("Билеты");
  // Приватные поездки и списки в разметку не попадают: у владельца одна
  // поездка «для друзей» и один приватный список мест.
  expect(html).not.toContain("Для друзей");
  expect(html).not.toContain("виден только мне");
});

test("действие из профиля уводит гостя на вход", async ({ page }) => {
  await page.goto("/ru/users/keetmine");
  const add = page.getByRole("button", { name: /В друзья/ }).first();
  await expect(add).toBeVisible();
  await add.click();
  await expect(page).toHaveURL(/\/login/);
});

test("профиль не индексируется", async ({ page }) => {
  const res = await page.goto("/ru/users/keetmine");
  expect(res?.status()).toBe(200);
  // Личные страницы в поиске нам не нужны: открыты по ссылке, но с
  // noindex (см. generateMetadata профиля).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

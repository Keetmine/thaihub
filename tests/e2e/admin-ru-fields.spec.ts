import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { TEST_FILTER_DRAMAS } from "./testDramas";

/**
 * И12: русские название и описание правятся из админки.
 *
 * До этого их писал только импорт — парсер ошибся, и поправить было
 * нечем, кроме базы. Плюс защита от дубля ссылки на dorama.land: поле
 * уникально, и без проверки повторная вставка падала бы сырым P2002,
 * из которого причина не читается.
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-test-dramas.ts"));
test.afterAll(() => fixtureScript("delete-test-dramas.ts"));

test.use({ storageState: ADMIN_STORAGE_STATE });

const F = TEST_FILTER_DRAMAS.fresh;
const O = TEST_FILTER_DRAMAS.old;
const DL_URL = "https://dorama.land/e2e-zanyato";

async function openEdit(page: import("@playwright/test").Page, title: string) {
  await page.goto(`/admin/dramas?q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title }).first().click();
  await page.waitForSelector('input[name="titleRu"]');
}

test("правка русских полей доезжает до /ru", async ({ page }) => {
  // Список показывает русское название подстрокой.
  await page.goto(`/admin/dramas?q=${encodeURIComponent(F.title)}`);
  await expect(page.getByText(F.titleRu).first()).toBeVisible();

  await openEdit(page, F.title);
  await expect(page.locator('input[name="titleRu"]')).toHaveValue(F.titleRu);
  await page.locator('input[name="titleRu"]').fill("Правленое имя");
  await page.locator('textarea[name="synopsisRu"]').fill("Правленое описание.");
  await page.getByRole("button", { name: /Сохранить/ }).first().click();
  // Именно СПИСОК: /admin/dramas/<id>/edit тоже содержит «/admin/dramas»,
  // и подстрочное ожидание совпадало сразу, не дождавшись записи.
  await page.waitForURL((u) => u.pathname === "/admin/dramas");

  await page.goto(`/ru/dramas/${F.slug}`);
  await expect(page.locator("h1")).toContainText("Правленое имя");
  await expect(page.getByText("Правленое описание.").first()).toBeVisible();
});

test("одна страница dorama.land — один сериал", async ({ page }) => {
  await openEdit(page, O.title);
  await page.locator('input[name="doramalandUrl"]').fill(DL_URL);
  await page.getByRole("button", { name: /Сохранить/ }).first().click();
  await page.waitForURL((u) => u.pathname === "/admin/dramas");
  // Убеждаемся, что ссылка ДЕЙСТВИТЕЛЬНО записалась: иначе конфликта
  // не возникнет и проверка ниже пройдёт мимо смысла.
  await openEdit(page, O.title);
  await expect(page.locator('input[name="doramalandUrl"]')).toHaveValue(DL_URL);

  // Та же ссылка у другого сериала — внятный отказ, а не падение.
  await openEdit(page, F.title);
  await page.locator('input[name="doramalandUrl"]').fill(DL_URL);
  await page.getByRole("button", { name: /Сохранить/ }).first().click();
  await expect(page.getByText(/уже стоит у сериала/)).toBeVisible({ timeout: 15000 });
});

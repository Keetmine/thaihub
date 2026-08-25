import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта (tests/e2e/auth.setup.ts): вход на весь
// прогон один, у формы входа лимит попыток.
test.use({ storageState: ADMIN_STORAGE_STATE });

// Regression test for the blscene duplicate-import bug: typing a title that
// already exists in the catalog should surface a "похоже, уже есть" hint
// on the create form before the admin submits.
test("drama create form warns about an existing title", async ({ page }) => {
  await page.goto("/admin/dramas");
  const firstTitle = page.locator(".font-display.fw-medium.text-white").first();
  test.skip((await firstTitle.count()) === 0, "no dramas in the database to collide with");
  const existingTitle = (await firstTitle.textContent())!.trim();

  await page.goto("/admin/dramas/new");
  await page.fill('input[name="title"]', existingTitle);

  await expect(page.getByText("Похоже, уже есть:")).toBeVisible();
  await expect(page.getByRole("link", { name: existingTitle })).toBeVisible();
});

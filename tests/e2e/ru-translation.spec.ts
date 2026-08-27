import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { TEST_FILTER_DRAMAS } from "./testDramas";

/**
 * Русские название и описание сериала (dorama.land, Ж4б).
 *
 * Русская версия показывает titleRu/synopsisRu, английская — как
 * раньше; поиск находит сериал и по русскому названию. Фикстура несёт
 * перевод с собой — прогон не зависит от того, гоняли ли синк.
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-test-dramas.ts"));
test.afterAll(() => fixtureScript("delete-test-dramas.ts"));

const F = TEST_FILTER_DRAMAS.fresh;

test("русская версия показывает перевод, английская — оригинал", async ({ page }) => {
  await page.goto(`/ru/dramas/${F.slug}`);
  await expect(page.locator("h1")).toContainText(F.titleRu);
  // Английское название не пропадает — оно в строке альтернативных.
  await expect(page.getByText(F.title).first()).toBeVisible();
  await expect(page.getByText(F.synopsisRu.slice(0, 30)).first()).toBeVisible();

  await page.goto(`/dramas/${F.slug}`);
  await expect(page.locator("h1")).toContainText(F.title);
  await expect(page.locator("h1")).not.toContainText(F.titleRu);
});

test("поиск находит сериал по русскому названию", async ({ page }) => {
  await page.goto(`/ru/search?q=${encodeURIComponent(F.titleRu)}`);
  await expect(page.getByText(F.titleRu).first()).toBeVisible();
});

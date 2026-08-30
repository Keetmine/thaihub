import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { SIMILAR_CANDIDATES, SIMILAR_SOURCE } from "./testSmokeFixtures";

/**
 * Рекомендации «Вам может понравиться» (З4) на странице сериала —
 * гостевой смоук, без логина: блок публичный, а обходиться без входа
 * значит не трогать лимит формы логина.
 *
 * Фикстуры (create-smoke-fixtures.ts): исходник и два кандидата с общим
 * кастом-маркером и жанром-маркером — блок обязан показать обоих
 * кандидатов на любой базе, и локальной, и CI-шной. Prisma из спеки не
 * импортировать (ESM-only), фикстуры заводит отдельный tsx-процесс.
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-smoke-fixtures.ts"));
test.afterAll(() => fixtureScript("delete-smoke-fixtures.ts"));

const SOURCE_URL = `/dramas/${SIMILAR_SOURCE.slug}`;
// Без куки языка адрес без префикса — английская версия, но спека
// устойчива к обоим языкам (как соседние гостевые).
const HEADING = /You may also like|Вам может понравиться/;

test("страница сериала показывает блок рекомендаций с карточками", async ({ page }) => {
  await page.goto(SOURCE_URL);
  const heading = page.getByRole("heading", { name: HEADING });
  await expect(heading).toBeVisible();

  // Сетка карточек — соседний блок сразу после заголовка.
  const grid = heading.locator("xpath=following-sibling::div[1]");
  for (const c of SIMILAR_CANDIDATES) {
    await expect(grid.getByText(c.title)).toBeVisible();
  }

  // Не больше шести карточек — лимит findSimilarDramas (limit = 6);
  // каждая карточка — колонка первого уровня сетки.
  const count = await grid.locator("> div").count();
  expect(count).toBeGreaterThanOrEqual(SIMILAR_CANDIDATES.length);
  expect(count).toBeLessThanOrEqual(6);

  // Карточка ведёт на страницу кандидата.
  await grid.getByText(SIMILAR_CANDIDATES[0].title).click();
  await expect(page).toHaveURL(new RegExp(`/dramas/${SIMILAR_CANDIDATES[0].slug}`));
});

test("на /ru заголовок блока — русский", async ({ page }) => {
  await page.goto(`/ru${SOURCE_URL}`);
  await expect(
    page.getByRole("heading", { name: "Вам может понравиться" }),
  ).toBeVisible();
  await expect(page.getByText(SIMILAR_CANDIDATES[0].title)).toBeVisible();
});

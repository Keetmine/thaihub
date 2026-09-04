import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import {
  REVIEW_AUTHOR_EMAIL,
  REVIEW_DRAMA,
  REVIEW_TEST_PASSWORD,
  REVIEW_VIEWER_EMAIL,
} from "./testReviewFixtures";

// Приватные отзывы: автор видит свой с бейджем (и во вкладке «Отзывы»
// кабинета), второй пользователь не видит его нигде — даже в HTML, — а
// средний рейтинг и счётчик считаются только по публичным.
//
// Фикстура кладёт публичный отзыв зрителя с оценкой 10 — фон, от
// которого приватная двойка автора не должна отклонить среднее.

const DRAMA_PAGE = `/dramas/${REVIEW_DRAMA.slug}`;
const root = path.join(__dirname, "../..");

test.beforeAll(() => {
  execFileSync("npx", ["tsx", path.join(__dirname, "create-review-fixtures.ts")], { cwd: root });
});

test.afterAll(() => {
  execFileSync("npx", ["tsx", path.join(__dirname, "delete-review-fixtures.ts")], { cwd: root });
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', REVIEW_TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
}

test("приватный отзыв виден только автору и не двигает средний рейтинг", async ({ page }) => {
  const marker = `Секретный e2e-отзыв ${Date.now()}`;

  // --- Автор публикует приватный отзыв с низкой оценкой ---
  await login(page, REVIEW_AUTHOR_EMAIL);
  await page.goto(DRAMA_PAGE);
  await page.locator("summary", { hasText: /review/i }).first().click();
  await page.selectOption('select[name="rating"]', "2");
  await page.fill('section textarea[name="text"]', marker);
  await page.check('section input[name="isPrivate"]');
  await page.locator('button:has-text("Publish"), button:has-text("Save")').first().click();

  // Свой приватный — в общем списке, с бейджем
  await expect(page.locator("p", { hasText: marker })).toBeVisible();
  await expect(page.getByText("only visible to you").first()).toBeVisible();

  // Среднее и счётчик — только по публичному отзыву зрителя (10, одна
  // штука); приватная двойка дала бы 6.
  const heading = page.locator("h2.section-heading", { hasText: "Reviews" });
  await expect(heading).toContainText("10");
  await expect(heading).toContainText("(1)");
  await expect(heading).not.toContainText("6");

  // --- Вкладка «Отзывы» в кабинете автора ---
  await page.goto("/account?tab=reviews");
  await expect(page.getByText(marker)).toBeVisible();
  await expect(page.getByText("only visible to you")).toBeVisible();
  await expect(page.getByRole("link", { name: REVIEW_DRAMA.title })).toBeVisible();

  // --- Второй пользователь: отзыва нет нигде, рейтинг не сдвинут ---
  await page.context().clearCookies();
  await login(page, REVIEW_VIEWER_EMAIL);
  await page.goto(DRAMA_PAGE);
  // Текст не просто спрятан — его нет даже в HTML страницы (фильтр в
  // серверной выборке, а не при отрисовке).
  expect(await page.content()).not.toContain(marker);
  const viewerHeading = page.locator("h2.section-heading", { hasText: "Reviews" });
  await expect(viewerHeading).toContainText("10");
  await expect(viewerHeading).toContainText("(1)");
  await expect(viewerHeading).not.toContainText("6");
  // Свой публичный отзыв зритель видит, и он без бейджа приватности.
  // Именно абзац: textarea своей формы держит тот же текст как
  // defaultValue (см. shared-trips.spec.ts).
  await expect(page.locator("p", { hasText: "E2E public baseline review" })).toBeVisible();
  await expect(page.getByText("only visible to you")).toHaveCount(0);
});

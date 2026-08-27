import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { TEST_FILTER_DRAMAS, TEST_GENRE } from "./testDramas";

/**
 * Поиск с фильтрами (И1) и фильтры в админке (И6).
 *
 * Фикстуры несут жанр-маркер, которого нет ни у одной настоящей записи:
 * фильтр по нему обязан вернуть ровно две записи на ЛЮБОЙ базе — и на
 * локальной копии боевой, и на пустой CI-шной. Диапазон года поверх
 * жанра оставляет одну. Prisma из спеки не импортировать (ESM-only),
 * фикстуры заводит отдельный tsx-процесс.
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-test-dramas.ts"));
test.afterAll(() => fixtureScript("delete-test-dramas.ts"));

const GENRE_URL = `/search?section=dramas&genres=${encodeURIComponent(TEST_GENRE)}`;

test.describe("публичный /search", () => {
  test("фильтр по жанру сужает выдачу, диапазон года — ещё уже", async ({ page }) => {
    await page.goto(GENRE_URL);
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toBeVisible();
    await expect(page.getByText(TEST_FILTER_DRAMAS.fresh.title)).toBeVisible();

    // Год отсекает старую: адрес — единственный источник состояния.
    await page.goto(`${GENRE_URL}&yearFrom=2020`);
    await expect(page.getByText(TEST_FILTER_DRAMAS.fresh.title)).toBeVisible();
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toHaveCount(0);
  });

  test("панель фильтров пишет выбор в адрес", async ({ page }) => {
    // Год, а не жанр: список жанров приходит из получасового кэша
    // вариантов, и жанра-маркера, заведённого beforeAll, там ещё нет.
    // Механику «панель → адрес» год проверяет ничуть не хуже.
    await page.goto(GENRE_URL);
    const aside = page.locator(".search-filter-aside");
    await aside.getByLabel(/Year: from|Год: от/).fill("2020");
    await aside.getByLabel(/Year: from|Год: от/).press("Enter");
    await expect(page).toHaveURL(/yearFrom=2020/);
    await expect(page.getByText(TEST_FILTER_DRAMAS.fresh.title)).toBeVisible();
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toHaveCount(0);
  });

  test("вкладка раздела и русская версия", async ({ page }) => {
    await page.goto(`/ru${GENRE_URL}`);
    await expect(page.getByRole("link", { name: "Сериалы", exact: true }).first()).toBeVisible();
    await expect(page.getByText(TEST_FILTER_DRAMAS.fresh.title)).toBeVisible();
  });

  test("жанр на карточке сериала ведёт в поиск с этим жанром", async ({ page }) => {
    await page.goto(`/dramas/${TEST_FILTER_DRAMAS.fresh.slug}`);
    const chip = page.locator(`a.tag-chip`, { hasText: TEST_GENRE });
    await expect(chip).toHaveAttribute("href", /\/search\?section=dramas&genres=/);
    await chip.click();
    await expect(page).toHaveURL(/\/search\?section=dramas/);
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toBeVisible();
  });

  test("клик по поиску поднимает палитру с подсказками и чипами", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dramas");
    await page.locator(".search-palette-trigger").first().click();
    const input = page.locator(".quick-search input[name=q]");
    await expect(input).toBeFocused();
    await input.fill("E2E Filter");
    await expect(page.locator(".search-palette-hit").first()).toBeVisible({ timeout: 5000 });
    // Чип «Локации» — такого имени среди локаций нет, подсказки пустеют.
    await page
      .locator(".search-palette-chip")
      .filter({ hasText: /Locations|Локации/ })
      .click();
    await expect(page.locator(".search-palette-hit")).toHaveCount(0);
    // Esc закрывает палитру.
    await page.keyboard.press("Escape");
    await expect(page.locator(".quick-search")).toHaveCount(0);
  });

  test("чипы активных фильтров снимаются крестиком", async ({ page }) => {
    await page.goto(`${GENRE_URL}&yearFrom=2020`);
    const chips = page.locator(".filter-chip");
    await expect(chips.filter({ hasText: TEST_GENRE })).toBeVisible();
    await chips.filter({ hasText: /Year|Год/ }).click();
    await expect(page).not.toHaveURL(/yearFrom/);
    // Жанр остался — снялся только год, и старая запись вернулась.
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toBeVisible();
  });
});

test.describe("админка (И6)", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("фильтры в /admin/dramas складываются с поиском", async ({ page }) => {
    await page.goto(
      `/admin/dramas?genres=${encodeURIComponent(TEST_GENRE)}&yearFrom=2020`,
    );
    // Панель раскрыта, раз фильтры активны, и счётчик на месте.
    await expect(page.getByText(/Фильтры \(2\)/)).toBeVisible();
    await expect(page.getByText(TEST_FILTER_DRAMAS.fresh.title)).toBeVisible();
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toHaveCount(0);
  });

  test("флаг «без постера» находит фикстуры", async ({ page }) => {
    await page.goto(`/admin/dramas?genres=${encodeURIComponent(TEST_GENRE)}&noPoster=1`);
    await expect(page.getByText(TEST_FILTER_DRAMAS.old.title)).toBeVisible();
  });

  test("живые подсказки в списке ведут в правку", async ({ page }) => {
    await page.goto("/admin/dramas");
    const input = page.locator('input[name="q"]');
    await input.click();
    await input.fill("E2E Filter");
    const hit = page.locator(".live-search-hit", { hasText: TEST_FILTER_DRAMAS.fresh.title });
    await expect(hit).toBeVisible({ timeout: 5000 });
    await hit.click();
    await expect(page).toHaveURL(/\/admin\/dramas\/[a-z0-9]+\/edit/);
  });

  test("фильтр прав в /admin/users", async ({ page }) => {
    await page.goto("/admin/users?role=admin");
    await expect(page.getByText(/Фильтры \(1\)/)).toBeVisible();
  });
});

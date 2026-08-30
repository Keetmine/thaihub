import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { DL_QUERY, DL_TRANSLATED, DL_UNTRANSLATED } from "./testAuditFixtures";

/**
 * Русские тексты с dorama.land — то, что осталось непокрытым соседями.
 * Показ titleRu/synopsisRu на /ru, оригинал на английской версии и
 * поиск по русскому названию проверяет ru-translation.spec.ts; правку
 * русских полей из админки и уникальность ссылки — admin-ru-fields.spec.ts.
 * Здесь — админский фильтр «Нет ру перевода» (`titleRu IS NULL`) и
 * ссылка на источник в «Источниках» на публичной странице.
 *
 * В живой dorama.land спека не ходит: перевод приносит фикстура, как и
 * у соседей. См. docs/features/doramaland-import.md.
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-audit-fixtures.ts"));
test.afterAll(() => fixtureScript("delete-audit-fixtures.ts"));

test("страница сериала показывает dorama.land в «Источниках»", async ({ page }) => {
  // Гостевой тест: страница сериала публичная, а без входа не тратится
  // попытка на лимитированной форме.
  await page.goto(`/ru/dramas/${DL_TRANSLATED.slug}`, { waitUntil: "domcontentloaded" });
  const source = page.locator(`a[href="${DL_TRANSLATED.doramalandUrl}"]`);
  await expect(source).toBeVisible();
  await expect(source).toHaveText("dorama.land");

  // У сериала без перевода строки нет — она есть только там, откуда
  // русские тексты действительно взяты.
  await page.goto(`/ru/dramas/${DL_UNTRANSLATED.slug}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href*="dorama.land"]')).toHaveCount(0);
});

test.describe("админский фильтр «Нет ру перевода»", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("оставляет в списке только сериалы без titleRu", async ({ page }) => {
    await page.goto(`/admin/dramas?q=${encodeURIComponent(DL_QUERY)}`);
    await expect(page.getByText(DL_TRANSLATED.title)).toBeVisible();
    await expect(page.getByText(DL_UNTRANSLATED.title)).toBeVisible();

    // Флаг — чекбокс в колонке фильтров. Панель отрисована дважды
    // (раскрывашка для телефона и колонка для широкого экрана), берём
    // ту, что видна на десктопном окне прогона.
    // Именно click, а не check: чекбокс управляемый — состояние он
    // берёт из адреса, а не из себя, и check() успевает проверить
    // галочку раньше, чем router.replace перерисует панель.
    await page
      .locator(".search-filter-aside")
      .locator("label", { hasText: "Нет ру перевода" })
      .locator("input[type=checkbox]")
      .click();
    await expect(page).toHaveURL(/noRu=1/);

    await expect(page.getByText(DL_UNTRANSLATED.title)).toBeVisible();
    await expect(page.getByText(DL_TRANSLATED.title)).toHaveCount(0);

    // Смысл фильтра — рабочий список «что дописать»: из него открывается
    // форма с пустой секцией русских полей.
    await page.getByRole("link", { name: DL_UNTRANSLATED.title }).first().click();
    await page.waitForSelector('input[name="titleRu"]');
    await expect(page.getByText("Русские название и описание")).toBeVisible();
    await expect(page.locator('input[name="titleRu"]')).toHaveValue("");
    await expect(page.locator('textarea[name="synopsisRu"]')).toHaveValue("");
  });
});
